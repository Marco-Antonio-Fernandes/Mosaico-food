import { Controller, Delete, Get, OnModuleDestroy, Param, Patch, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { PrismaService } from "../lib/prisma.service";

const weekdaySchema = z.array(z.number().int().min(0).max(6)).max(7).transform(days => [...new Set(days)].sort((a, b) => a - b));
const scheduleItemSchema = z.object({ productId: z.string().uuid(), quantity: z.number().int().positive().max(100000) });
const scheduleSchema = z.object({
  name: z.string().trim().max(120).optional().default(""),
  frequency: z.enum(["daily", "weekly"]),
  weekdays: weekdaySchema.default([]),
  timeLocal: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  fulfillment: z.enum(["pickup", "delivery"]).default("pickup"),
  deliveryAddress: z.string().trim().max(500).nullable().optional().default(null),
  items: z.array(scheduleItemSchema).min(1).max(100),
}).superRefine((value, context) => {
  if (value.frequency === "weekly" && !value.weekdays.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["weekdays"], message: "Escolha ao menos um dia da semana." });
});
const activeSchema = z.object({ active: z.boolean() });
const updateScheduleSchema = z.union([activeSchema, scheduleSchema]);

function parseWeekdays(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(day => Number.isInteger(day) && day >= 0 && day <= 6) as number[] : [];
  } catch {
    return [];
  }
}

function nextOccurrence(frequency: string, weekdays: number[], timeLocal: string, from = new Date()) {
  const [hour, minute] = timeLocal.split(":").map(Number);
  const validDays = frequency === "daily" ? [0, 1, 2, 3, 4, 5, 6] : weekdays;
  if (!validDays.length || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;

  for (let offset = 0; offset <= 8; offset += 1) {
    const candidate = new Date(from);
    candidate.setHours(hour, minute, 0, 0);
    candidate.setDate(candidate.getDate() + offset);
    if (candidate.getTime() > from.getTime() && validDays.includes(candidate.getDay())) return candidate;
  }
  return null;
}

@Controller("api/v1/food/order-schedules")
export class FoodOrderSchedulesController implements OnModuleDestroy {
  private readonly timer: ReturnType<typeof setInterval>;
  private processing = false;

  constructor(private readonly database: PrismaService) {
    this.timer = setInterval(() => void this.processDueSchedules(), 30_000);
    setTimeout(() => void this.processDueSchedules(), 3_000);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  @Get()
  async list(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const schedules = await this.database.foodOrderSchedule.findMany({ orderBy: [{ active: "desc" }, { nextRunAt: "asc" }], include: { items: true } });
    return response.json(jsonData({ schedules }));
  }

  @Post()
  async create(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const parsed = scheduleSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(jsonError("INVALID_SCHEDULE", "Confira o horário, frequência e itens do pedido agendado.", 400));

    const nextRunAt = nextOccurrence(parsed.data.frequency, parsed.data.weekdays, parsed.data.timeLocal);
    if (!nextRunAt) return response.status(400).json(jsonError("INVALID_SCHEDULE_TIME", "Não foi possível calcular a próxima execução do agendamento.", 400));

    try {
      const schedule = await this.database.$transaction(async transaction => {
        const products = await transaction.foodProduct.findMany({ where: { id: { in: parsed.data.items.map(item => item.productId) }, active: true } });
        const byId = new Map(products.map(product => [product.id, product]));
        const items = parsed.data.items.map(item => {
          const product = byId.get(item.productId);
          if (!product || product.productionMode === "ingredient") throw new Error("PRODUCT_UNAVAILABLE");
          return { productId: product.id, productName: product.productName || product.name, flavor: product.flavor, quantity: item.quantity };
        });
        return transaction.foodOrderSchedule.create({
          data: {
            name: parsed.data.name || "Comanda sem nome",
            frequency: parsed.data.frequency,
            weekdaysJson: JSON.stringify(parsed.data.weekdays),
            timeLocal: parsed.data.timeLocal,
            fulfillment: parsed.data.fulfillment,
            deliveryAddress: parsed.data.deliveryAddress,
            nextRunAt,
            items: { create: items },
          },
          include: { items: true },
        });
      });
      return response.status(201).json(jsonData({ schedule }));
    } catch (error) {
      if (error instanceof Error && error.message === "PRODUCT_UNAVAILABLE") return response.status(409).json(jsonError("PRODUCT_UNAVAILABLE", "Um dos produtos do agendamento não está mais disponível.", 409));
      throw error;
    }
  }

  @Patch(":id")
  async update(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const parsed = updateScheduleSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(jsonError("INVALID_SCHEDULE", "Confira os dados do agendamento.", 400));
    try {
      if ("active" in parsed.data) {
        const schedule = await this.database.foodOrderSchedule.update({ where: { id }, data: { active: parsed.data.active }, include: { items: true } });
        return response.json(jsonData({ schedule }));
      }

      const scheduleData = parsed.data as z.infer<typeof scheduleSchema>;
      const nextRunAt = nextOccurrence(scheduleData.frequency, scheduleData.weekdays, scheduleData.timeLocal);
      if (!nextRunAt) return response.status(400).json(jsonError("INVALID_SCHEDULE_TIME", "Não foi possível calcular a próxima execução do agendamento.", 400));
      const schedule = await this.database.$transaction(async transaction => {
        const products = await transaction.foodProduct.findMany({ where: { id: { in: scheduleData.items.map(item => item.productId) }, active: true } });
        const byId = new Map(products.map(product => [product.id, product]));
        const items = scheduleData.items.map(item => {
          const product = byId.get(item.productId);
          if (!product || product.productionMode === "ingredient") throw new Error("PRODUCT_UNAVAILABLE");
          return { productId: product.id, productName: product.productName || product.name, flavor: product.flavor, quantity: item.quantity };
        });
        return transaction.foodOrderSchedule.update({
          where: { id },
          data: {
            name: scheduleData.name || "Comanda sem nome",
            frequency: scheduleData.frequency,
            weekdaysJson: JSON.stringify(scheduleData.weekdays),
            timeLocal: scheduleData.timeLocal,
            fulfillment: scheduleData.fulfillment,
            deliveryAddress: scheduleData.deliveryAddress,
            nextRunAt,
            lastError: null,
            items: { deleteMany: {}, create: items },
          },
          include: { items: true },
        });
      });
      return response.json(jsonData({ schedule }));
    } catch (error) {
      if (error instanceof Error && error.message === "PRODUCT_UNAVAILABLE") return response.status(409).json(jsonError("PRODUCT_UNAVAILABLE", "Um dos produtos do agendamento não está mais disponível.", 409));
      if (error && typeof error === "object" && "code" in error && error.code === "P2025") return response.status(404).json(jsonError("NOT_FOUND", "Agendamento não encontrado.", 404));
      throw error;
    }
  }

  @Delete(":id")
  async remove(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    try {
      await this.database.foodOrderSchedule.delete({ where: { id } });
      return response.json(jsonData({ deleted: true, id }));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2025") return response.status(404).json(jsonError("NOT_FOUND", "Agendamento não encontrado.", 404));
      throw error;
    }
  }

  private async processDueSchedules() {
    if (this.processing || !this.database.isConfigured) return;
    this.processing = true;
    try {
      const due = await this.database.foodOrderSchedule.findMany({ where: { active: true, nextRunAt: { lte: new Date() } }, select: { id: true }, take: 20 });
      for (const schedule of due) await this.processSchedule(schedule.id);
    } catch (error) {
      console.error(`[Mosaico Food] Falha ao processar pedidos agendados: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.processing = false;
    }
  }

  private async processSchedule(id: string) {
    const now = new Date();
    await this.database.$transaction(async transaction => {
      const schedule = await transaction.foodOrderSchedule.findUnique({ where: { id }, include: { items: true } });
      if (!schedule || !schedule.active || schedule.nextRunAt.getTime() > now.getTime()) return;

      const nextRunAt = nextOccurrence(schedule.frequency, parseWeekdays(schedule.weekdaysJson), schedule.timeLocal, now);
      if (!nextRunAt) return;
      const products = await transaction.foodProduct.findMany({ where: { id: { in: schedule.items.flatMap(item => item.productId ? [item.productId] : []) }, active: true } });
      const byId = new Map(products.map(product => [product.id, product]));
      const items = schedule.items.flatMap(item => {
        const product = item.productId ? byId.get(item.productId) : undefined;
        if (!product || product.productionMode === "ingredient") return [];
        return [{ productId: product.id, productName: product.name, variantName: product.flavor, quantity: item.quantity, unitPriceCents: product.salePriceCents, totalCents: item.quantity * product.salePriceCents, fryNow: false, adjustmentCents: 0, adjustmentNote: null, isGift: false }];
      });

      if (!items.length) {
        await transaction.foodOrderSchedule.update({ where: { id }, data: { lastRunAt: now, nextRunAt, lastError: "Nenhum produto do agendamento está mais disponível." } });
        return;
      }

      await transaction.foodOrder.create({
        data: {
          status: "confirmed",
          customerName: schedule.name === "Comanda sem nome" ? null : schedule.name,
          fulfillment: schedule.fulfillment,
          deliveryAddress: schedule.deliveryAddress,
          totalCents: items.reduce((sum, item) => sum + item.totalCents, 0),
          source: "scheduled",
          stockReserved: false,
          items: { create: items },
        },
      });
      await transaction.foodOrderSchedule.update({ where: { id }, data: { lastRunAt: now, nextRunAt, lastError: null } });
    });
  }
}
