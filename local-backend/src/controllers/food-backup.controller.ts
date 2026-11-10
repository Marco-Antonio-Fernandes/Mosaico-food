import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { exportFoodDatabase, importFoodDatabase, type FoodBackup } from "../lib/food-backup";
import { PrismaService } from "../lib/prisma.service";
import { FinancialError } from "../lib/financial-movement";

const backupSchema = z.object({
  format: z.literal("mosaico-food-backup"),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  tables: z.record(z.array(z.unknown())),
});

@Controller("api/v1/food/backups")
export class FoodBackupController {
  constructor(private readonly database: PrismaService) {}

  @Get("export")
  async export(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    return response.json(jsonData({ backup: await exportFoodDatabase(this.database) }));
  }

  @Post("import")
  async import(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = backupSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(jsonError("INVALID_BACKUP", "O arquivo não é um backup válido do Mosaico Food.", 400));
    }

    try {
      const summary = await importFoodDatabase(this.database, parsed.data as FoodBackup);
      return response.json(jsonData({ summary }));
    } catch (error) {
      if (error instanceof FinancialError) return response.status(409).json(jsonError("FINANCIAL_BACKUP_CONFLICT", error.message, 409));
      throw error;
    }
  }
}
