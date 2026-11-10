import { Controller, Get, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { PrismaService } from "../lib/prisma.service";
import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { cashSnapshot, unassignedReceipts } from "../lib/cash-ledger";
import { FinancialError, recordFinancialMovement } from "../lib/financial-movement";
import { ensureDailyCashSession } from "../lib/cash-session";

const money = z.number().int().nonnegative().max(100_000_000);
const openSchema = z.object({ openingCashCents: money.optional().default(0) });
const closeSchema = z.object({ sessionId: z.string().uuid(), countedCashCents: money, expectedCashCents: z.number().int().optional(), notes: z.string().trim().max(500).nullable().optional() });
const movementSchema = z.object({ operationId: z.string().uuid(), kind: z.enum(["supply", "withdrawal", "expense"]), amountCents: money.refine(value => value > 0), note: z.string().trim().min(3).max(500) });

@Controller("api/v1/food/cash")
export class FoodCashController {
  constructor(private readonly database: PrismaService) {}

  @Get("today")
  async today(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const result = await this.database.$transaction(async tx => {
      const session = await ensureDailyCashSession(tx);
      return { ...await cashSnapshot(tx, session), unassigned: await unassignedReceipts(tx) };
    });
    return response.json(jsonData(result));
  }

  @Get("history")
  async history(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const sessions = await this.database.$transaction(async tx => {
      await ensureDailyCashSession(tx);
      const rows = await tx.foodCashSession.findMany({ orderBy: { openedAt: "desc" }, take: 50 });
      return (await Promise.all(rows.map(row => cashSnapshot(tx, row)))).map(snapshot => snapshot.session).filter(Boolean);
    });
    return response.json(jsonData({ sessions }));
  }

  @Get(":id")
  async detail(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    if (!z.string().uuid().safeParse(id).success) return response.status(400).json(jsonError("INVALID_ID", "Identificador inválido.", 400));
    const snapshot = await this.database.$transaction(async tx => cashSnapshot(tx, await tx.foodCashSession.findUnique({ where: { id } })));
    if (!snapshot.session) return response.status(404).json(jsonError("NOT_FOUND", "Caixa não encontrado.", 404));
    return response.json(jsonData(snapshot));
  }

  @Post("open")
  async open(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const parsed = openSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(jsonError("INVALID_CASH_OPEN", "Informe o dinheiro que está no caixa.", 400));
    try {
      const result = await this.database.$transaction(async tx => {
        const session = await ensureDailyCashSession(tx, new Date(), parsed.data.openingCashCents);
        if (session.status !== "open") throw new FinancialError("O caixa desta data já foi fechado.");
        return cashSnapshot(tx, session);
      });
      return response.status(201).json(jsonData(result));
    } catch (error) {
      return response.status(409).json(jsonError("CASH_OPEN_CONFLICT", error instanceof FinancialError ? error.message : "Já existe um caixa aberto ou fechado nesta data.", 409));
    }
  }

  @Post("movements")
  async movement(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const parsed = movementSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(jsonError("INVALID_MOVEMENT", "Informe valor, tipo e justificativa do lançamento.", 400));
    try {
      const entry = await this.database.$transaction(async tx => {
        const operationId = `cash:${parsed.data.operationId}`;
        if (parsed.data.kind !== "supply" && !await tx.foodFinancialMovement.findUnique({ where: { operationId } })) {
          const session = await ensureDailyCashSession(tx);
          const snapshot = await cashSnapshot(tx, session);
          if (snapshot.expectedCashCents < parsed.data.amountCents) throw new FinancialError("O valor supera o dinheiro disponível no caixa.");
        }
        return recordFinancialMovement(tx, {
          ...parsed.data, operationId, referenceType: "cash_movement", referenceId: parsed.data.operationId,
          source: "manual", paymentMethod: "cash",
        });
      });
      return response.json(jsonData({ movement: entry }));
    } catch (error) {
      if (error instanceof FinancialError) return response.status(409).json(jsonError("MOVEMENT_CONFLICT", error.message, 409));
      throw error;
    }
  }

  @Post("close")
  async close(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const parsed = closeSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(jsonError("INVALID_CASH_CLOSE", "Informe o caixa e o dinheiro contado no fechamento.", 400));
    try {
      const result = await this.database.$transaction(async tx => {
        const current = await tx.foodCashSession.findUnique({ where: { id: parsed.data.sessionId } });
        if (!current) throw new FinancialError("Caixa não encontrado.");
        if (current.status === "closed") {
          if (current.countedCashCents !== parsed.data.countedCashCents || current.notes !== (parsed.data.notes || null)) throw new FinancialError("Este caixa já foi fechado com outros dados.");
          return cashSnapshot(tx, current);
        }
        const locked = await tx.foodCashSession.updateMany({ where: { id: current.id, status: "open" }, data: { updatedAt: new Date() } });
        if (locked.count !== 1) throw new FinancialError("O caixa já foi fechado.");
        const snapshot = await cashSnapshot(tx, current);
        if (parsed.data.expectedCashCents !== undefined && parsed.data.expectedCashCents !== snapshot.expectedCashCents) throw new FinancialError("O caixa recebeu novas movimentações. Atualize os valores e confira o fechamento novamente.");
        const differenceCents = parsed.data.countedCashCents - snapshot.expectedCashCents;
        const session = await tx.foodCashSession.update({ where: { id: current.id }, data: {
          status: "closed", activeKey: null, expectedCashCents: snapshot.expectedCashCents, countedCashCents: parsed.data.countedCashCents,
          differenceCents, notes: parsed.data.notes || null, closedAt: new Date(),
        } });
        return cashSnapshot(tx, session);
      });
      return response.json(jsonData(result));
    } catch (error) {
      if (error instanceof FinancialError) return response.status(409).json(jsonError("CASH_CLOSE_CONFLICT", error.message, 409));
      throw error;
    }
  }
}
