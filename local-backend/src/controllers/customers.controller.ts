import { Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { PrismaService } from "../lib/prisma.service";

const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).optional(),
  creditLimitCents: z.number().int().nonnegative().nullable().optional(),
});

const idSchema = z.string().uuid();

function normalizePhone(phone: string | undefined) {
  const normalized = phone?.replace(/\D/g, "");
  return normalized || null;
}

@Controller("api/v1/customers")
export class CustomersController {
  constructor(private readonly database: PrismaService) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query("search") search: string | undefined,
    @Res() response: Response,
  ) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const normalizedSearch = search?.trim();
    const customers = await this.database.customer.findMany({
      where: normalizedSearch
        ? {
            OR: [
              { name: { contains: normalizedSearch } },
              { normalizedPhone: { contains: normalizedSearch.replace(/\D/g, "") } },
            ],
          }
        : undefined,
      orderBy: { name: "asc" },
      include: {
        creditAccount: {
          select: {
            id: true,
            balanceCents: true,
            creditLimitCents: true,
            version: true,
            updatedAt: true,
          },
        },
      },
    });

    return response.json(jsonData({ customers }));
  }

  @Post()
  async create(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = createCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(
        jsonError(
          "VALIDATION_ERROR",
          "Confira os dados do cliente.",
          400,
          parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        ),
      );
    }

    const customer = await this.database.$transaction(async (transaction) => {
      const createdCustomer = await transaction.customer.create({
        data: {
          name: parsed.data.name,
          phone: parsed.data.phone,
          normalizedPhone: normalizePhone(parsed.data.phone),
        },
      });

      return transaction.creditAccount
        .create({
          data: {
            customerId: createdCustomer.id,
            creditLimitCents: parsed.data.creditLimitCents ?? null,
          },
          include: { customer: true },
        })
        .then((account) => ({
          ...account.customer,
          creditAccount: {
            id: account.id,
            balanceCents: account.balanceCents,
            creditLimitCents: account.creditLimitCents,
            version: account.version,
            updatedAt: account.updatedAt,
          },
        }));
    });

    return response.status(201).json(jsonData({ customer }));
  }

  @Get(":id")
  async get(
    @Req() request: Request,
    @Param("id") id: string,
    @Res() response: Response,
  ) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    if (!idSchema.safeParse(id).success) {
      return response
        .status(400)
        .json(jsonError("INVALID_ID", "O identificador do cliente é inválido.", 400));
    }

    const customer = await this.database.customer.findUnique({
      where: { id },
      include: {
        creditAccount: {
          include: {
            entries: { orderBy: { occurredAt: "desc" }, take: 50 },
          },
        },
      },
    });

    if (!customer) {
      return response
        .status(404)
        .json(jsonError("NOT_FOUND", "Cliente não encontrado.", 404));
    }

    return response.json(jsonData({ customer }));
  }
}
