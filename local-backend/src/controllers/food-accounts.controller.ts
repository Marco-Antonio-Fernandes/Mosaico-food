import { Controller, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { provisionNotasemtupeCompany } from "../lib/notasemtupe";
import { PrismaService } from "../lib/prisma.service";

const accountSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  cnpj: z.string().transform(value => value.replace(/\D/g, "")).refine(value => /^\d{14}$/.test(value), "Informe um CNPJ com 14 dígitos."),
  city: z.string().trim().max(120).optional().default(""),
});

@Controller("api/v1/accounts")
export class FoodAccountsController {
  constructor(private readonly database: PrismaService) {}

  @Post()
  async save(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = accountSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(jsonError(
        "INVALID_ACCOUNT",
        "Informe o nome da empresa e um CNPJ válido.",
        400,
        parsed.error.issues.map(issue => ({ field: issue.path.join(".") || "body", message: issue.message })),
      ));
    }

    const input = parsed.data;
    const existingByCnpj = await this.database.foodAccount.findUnique({ where: { cnpj: input.cnpj } });
    if (existingByCnpj && existingByCnpj.id !== input.id) {
      return response.status(409).json(jsonError("ACCOUNT_CNPJ_ALREADY_EXISTS", "Este CNPJ já está associado a outra conta do Mosaico.", 409));
    }

    let integration;
    try {
      integration = await provisionNotasemtupeCompany({
        externalId: input.id,
        name: input.name,
        cnpj: input.cnpj,
        city: input.city,
        state: "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível criar a empresa no not@sem tupe.";
      return response.status(502).json(jsonError("NOTASEMTUPE_PROVISION_FAILED", message, 502));
    }

    const existing = await this.database.foodAccount.findUnique({ where: { id: input.id } });
    const account = await this.database.foodAccount.upsert({
      where: { id: input.id },
      create: {
        id: input.id,
        name: input.name,
        cnpj: input.cnpj,
        city: input.city,
        notasemtupeCompanyId: integration.companyId,
        notasemtupeToken: integration.token,
      },
      update: {
        name: input.name,
        cnpj: input.cnpj,
        city: input.city,
        notasemtupeCompanyId: integration.companyId ?? existing?.notasemtupeCompanyId,
        ...(integration.token ? { notasemtupeToken: integration.token } : {}),
      },
    });

    return response.status(existing ? 200 : 201).json(jsonData({
      account: { id: account.id, name: account.name, cnpj: account.cnpj, city: account.city },
      integration: {
        configured: integration.configured,
        provisioned: integration.provisioned,
        companyId: integration.companyId,
        message: integration.message,
      },
    }));
  }
}
