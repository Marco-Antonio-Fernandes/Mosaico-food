import { Controller, Get, Post, Param, Patch, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { runFoodAutomation } from "../features/food-automation/food-automation";
import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { PrismaService } from "../lib/prisma.service";

const customerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).refine(value => {
    const digits = value.replace(/\D/g, "");
    return /^(?:[1-9]\d{9,10}|55[1-9]\d{9,10})$/.test(digits);
  }, "Informe um telefone com DDD."),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const automationSchema = z.object({ enabled: z.boolean() });

@Controller("api/v1/food/customers")
export class FoodCustomersController {
  constructor(private readonly database: PrismaService) {}

  @Get()
  async list(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const customers = await this.database.foodCustomer.findMany({ orderBy: { name: "asc" } });
    return response.json(jsonData({ customers }));
  }

  @Post()
  async create(@Req() request: Request, @Res() response: Response) {
    return this.save(request, response);
  }

  @Patch(":id")
  async update(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (!z.string().uuid().safeParse(id).success) {
      return response.status(400).json(jsonError("INVALID_ID", "Identificador inválido.", 400));
    }
    return this.save(request, response, id);
  }

  private async save(request: Request, response: Response, id?: string) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const parsed = customerSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(jsonError("VALIDATION_ERROR", "Confira nome, telefone com DDD, endereço e observações do cliente.", 400,
      parsed.error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message }))));
    const digits = parsed.data.phone.replace(/\D/g, "");
    const data = { ...parsed.data, normalizedPhone: digits.length <= 11 ? `55${digits}` : digits,
      email: parsed.data.email === undefined ? undefined : parsed.data.email || null,
      address: parsed.data.address || null, notes: parsed.data.notes || null };
    try {
      const customer = id
        ? await this.database.foodCustomer.update({ where: { id }, data })
        : await this.database.foodCustomer.create({ data: { ...data, automationEnabled: false } });
      return response.status(id ? 200 : 201).json(jsonData({ customer }));
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "P2002") return response.status(409).json(jsonError("DUPLICATE_PHONE", "Já existe um cliente com esse telefone. Busque o contato para editar o cadastro.", 409));
      if (code === "P2025") return response.status(404).json(jsonError("NOT_FOUND", "Cliente não encontrado.", 404));
      throw error;
    }
  }

  @Patch(":id/automation")
  async automation(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = automationSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(jsonError("VALIDATION_ERROR", "Informe se a automação de teste está ativa.", 400));
    }

    try {
      const result = await this.database.$transaction(async (transaction) => {
        const customer = await transaction.foodCustomer.update({
          where: { id },
          data: { automationEnabled: parsed.data.enabled },
        });
        const conversations = await transaction.foodConversation.updateMany({
          where: { customerId: id },
          data: { automationPaused: !parsed.data.enabled },
        });
        if (parsed.data.enabled) {
          await transaction.foodAutomationConfig.upsert({
            where: { id: "default" },
            create: { id: "default", enabled: true },
            update: { enabled: true },
          });
        }
        return { customer, conversations: conversations.count };
      });

      if (parsed.data.enabled) {
        void runFoodAutomation(this.database).catch(() => undefined);
      }

      return response.json(jsonData(result));
    } catch (error) {
      if (error instanceof Error && error.message.includes("Record to update not found")) {
        return response.status(404).json(jsonError("NOT_FOUND", "Contato não encontrado.", 404));
      }
      throw error;
    }
  }
}
