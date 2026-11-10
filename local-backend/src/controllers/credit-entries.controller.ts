import { Controller, Get, Headers, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import {
  createCreditEntry,
  creditEntryInputSchema,
} from "../lib/credit-entry";
import {
  databaseUnavailable,
  jsonData,
  jsonError,
  rejectUnauthorized,
} from "../lib/http";
import { PrismaService } from "../lib/prisma.service";
import { creditStatusOf } from "../lib/credit-status";
import { FinancialError } from "../lib/financial-movement";

@Controller("api/v1/credit-entries")
export class CreditEntriesController {
  constructor(private readonly database: PrismaService) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query("customerId") customerId: string | undefined,
    @Res() response: Response,
  ) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsedCustomerId = customerId
      ? z.string().uuid().safeParse(customerId)
      : undefined;
    if (customerId && !parsedCustomerId?.success) {
      return response
        .status(400)
        .json(jsonError("INVALID_ID", "O identificador do cliente é inválido.", 400));
    }

    const entries = await this.database.creditEntry.findMany({
      where: parsedCustomerId?.success
        ? { creditAccount: { customerId: parsedCustomerId.data } }
        : undefined,
      orderBy: { occurredAt: "desc" },
      take: 200,
      include: { creditAccount: { include: { customer: true } } },
    });

    if (!parsedCustomerId) {
      const customers = await this.database.customer.findMany({
        where: { creditAccount: { isNot: null } },
        orderBy: { name: "asc" },
        include: { creditAccount: true },
      });
      const entriesByAccount = new Map<string, typeof entries>();
      for (const entry of entries) entriesByAccount.set(entry.creditAccountId, [...(entriesByAccount.get(entry.creditAccountId) ?? []), entry]);
      const enrichedCustomers = customers.map(customer => ({
        ...customer,
        ...(customer.creditAccount ? creditStatusOf(entriesByAccount.get(customer.creditAccount.id) ?? []) : { creditStatus: "on_time" as const, lateDays: 0, lastPaymentAt: null }),
      }));
      return response.json(jsonData({ entries, customers: enrichedCustomers }));
    }

    return response.json(jsonData({ entries }));
  }

  @Post()
  async create(
    @Req() request: Request,
    @Headers("idempotency-key") operationId: string | undefined,
    @Res() response: Response,
  ) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    if (!operationId || !z.string().uuid().safeParse(operationId).success) {
      return response.status(400).json(
        jsonError(
          "IDEMPOTENCY_KEY_REQUIRED",
          "Envie um Idempotency-Key UUID para registrar o lançamento.",
          400,
        ),
      );
    }

    const parsed = creditEntryInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(
        jsonError(
          "VALIDATION_ERROR",
          "Confira os dados do lançamento.",
          400,
          parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        ),
      );
    }

    try {
      const result = await createCreditEntry(this.database, parsed.data, operationId);
      return response
        .status(result.duplicate ? 200 : 201)
        .json(jsonData({ entry: result.entry, duplicate: result.duplicate }));
    } catch (error) {
      if (error instanceof FinancialError) return response.status(409).json(jsonError("PAYMENT_CONFLICT", error.message, 409));
      if (error instanceof Error && error.message === "CREDIT_ACCOUNT_NOT_FOUND") {
        return response.status(404).json(
          jsonError(
            "CREDIT_ACCOUNT_NOT_FOUND",
            "O cliente não possui uma conta de crediário.",
            404,
          ),
        );
      }
      if (error instanceof Error && error.message === "PAYMENT_EXCEEDS_BALANCE") return response.status(409).json(jsonError("PAYMENT_EXCEEDS_BALANCE", "O recebimento não pode ser maior que o saldo em aberto.", 409));
      if (error instanceof Error && error.message === "CREDIT_LIMIT_EXCEEDED") return response.status(409).json(jsonError("CREDIT_LIMIT_EXCEEDED", "O limite de crédito seria ultrapassado.", 409));

      return response.status(500).json(
        jsonError(
          "CREDIT_ENTRY_FAILED",
          "Não foi possível registrar o lançamento.",
          500,
        ),
      );
    }
  }
}
