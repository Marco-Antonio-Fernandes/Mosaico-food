import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { FoodFiscalError, foodFiscalIssueSchema, getFoodFiscalStatus, issueFoodFiscalDocument, listFoodFiscalDocuments, listFoodFiscalSources } from "../lib/food-fiscal";
import { getNotasemtupeStatus, notasemtupeSyncSchema, syncNotasemtupeNote } from "../lib/notasemtupe";
import { PrismaService } from "../lib/prisma.service";

@Controller("api/v1/food/fiscal")
export class FoodFiscalController {
  constructor(private readonly database: PrismaService) {}

  private async notasemtupeToken(request: Request) {
    const raw = request.headers["x-mosaico-account-id"];
    const accountId = Array.isArray(raw) ? raw[0] : raw;
    if (!accountId) return undefined;
    const account = await this.database.foodAccount.findUnique({ where: { id: accountId } });
    return account?.notasemtupeToken ?? undefined;
  }

  @Get("status")
  async status(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    return response.json(jsonData(await getFoodFiscalStatus()));
  }

  @Get("sources")
  async sources(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    return response.json(jsonData({ sources: await listFoodFiscalSources(this.database) }));
  }

  @Get("documents")
  async documents(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    return response.json(jsonData({ documents: await listFoodFiscalDocuments(this.database) }));
  }

  @Post("documents/issue")
  async issue(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const parsed = foodFiscalIssueSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(jsonError(
        "INVALID_FISCAL_ISSUE",
        "Informe a venda, o produto e a quantidade que devem aparecer nesta nota.",
        400,
        parsed.error.issues.map((issue) => ({ field: issue.path.join(".") || "body", message: issue.message })),
      ));
    }

    try {
      const document = await issueFoodFiscalDocument(this.database, parsed.data);
      return response.status(document.status === "issued" ? 200 : 202).json(jsonData({ document }));
    } catch (error) {
      if (error instanceof FoodFiscalError) {
        return response.status(error.status).json(jsonError(error.code, error.message, error.status, error.fields));
      }
      throw error;
    }
  }

  @Get("notasemtupe/status")
  async notasemtupeStatus(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    return response.json(jsonData(await getNotasemtupeStatus(await this.notasemtupeToken(request))));
  }

  @Post("notasemtupe/sync")
  async notasemtupeSync(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    const parsed = notasemtupeSyncSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(jsonError(
        "INVALID_NOTASEMTUPE_SYNC",
        "Dados insuficientes para sincronizar a nota com o not@sem tupe.",
        400,
        parsed.error.issues.map((issue) => ({ field: issue.path.join(".") || "body", message: issue.message })),
      ));
    }
    try {
      return response.json(jsonData(await syncNotasemtupeNote(parsed.data, await this.notasemtupeToken(request))));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sincronizar com o not@sem tupe.";
      return response.status(502).json(jsonError("NOTASEMTUPE_SYNC_FAILED", message, 502));
    }
  }
}
