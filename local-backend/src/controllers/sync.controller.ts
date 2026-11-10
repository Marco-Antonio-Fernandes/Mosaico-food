import { Controller, Get, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { createCreditEntry, creditEntryPayload } from "../lib/credit-entry";
import {
  databaseUnavailable,
  jsonData,
  jsonError,
  rejectUnauthorized,
} from "../lib/http";
import { PrismaService } from "../lib/prisma.service";
import { syncCursorSchema, syncPushSchema } from "../lib/sync";

interface SyncResult {
  operationId: string;
  entity: string;
  entityId: string;
  duplicate?: boolean;
  code?: string;
  message?: string;
}

@Controller("api/v1/sync")
export class SyncController {
  constructor(private readonly database: PrismaService) {}

  @Get("bootstrap")
  async bootstrap(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const [customers, creditAccounts, creditEntries] = await Promise.all([
      this.database.customer.findMany(),
      this.database.creditAccount.findMany(),
      this.database.creditEntry.findMany(),
    ]);

    return response.json(
      jsonData({
        cursor: new Date().toISOString(),
        entities: { customers, creditAccounts, creditEntries },
      }),
    );
  }

  @Get("pull")
  async pull(
    @Req() request: Request,
    @Query("cursor") cursor: string | undefined,
    @Res() response: Response,
  ) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsedCursor = cursor ? syncCursorSchema.safeParse(cursor) : undefined;
    if (cursor && !parsedCursor?.success) {
      return response
        .status(400)
        .json(jsonError("INVALID_CURSOR", "O cursor de sincronização é inválido.", 400));
    }

    const since = parsedCursor?.success ? new Date(parsedCursor.data) : new Date(0);
    const [customers, creditAccounts, creditEntries] = await Promise.all([
      this.database.customer.findMany({ where: { updatedAt: { gt: since } } }),
      this.database.creditAccount.findMany({ where: { updatedAt: { gt: since } } }),
      this.database.creditEntry.findMany({ where: { updatedAt: { gt: since } } }),
    ]);

    return response.json(
      jsonData({
        cursor: new Date().toISOString(),
        changes: { customers, creditAccounts, creditEntries },
      }),
    );
  }

  @Post("push")
  async push(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = syncPushSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(
        jsonError(
          "VALIDATION_ERROR",
          "A fila de sincronização é inválida.",
          400,
          parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        ),
      );
    }

    const accepted: SyncResult[] = [];
    const rejected: SyncResult[] = [];
    const conflicts: SyncResult[] = [];

    for (const operation of parsed.data.operations) {
      const previous = await this.database.syncOperation.findUnique({
        where: { operationId: operation.operationId },
      });

      if (previous) {
        if (previous.status === "accepted") {
          accepted.push({
            operationId: operation.operationId,
            entity: operation.entity,
            entityId: operation.entityId,
            duplicate: true,
          });
        } else if (previous.status === "conflict") {
          conflicts.push({
            operationId: operation.operationId,
            entity: operation.entity,
            entityId: operation.entityId,
            code: previous.errorCode ?? "SYNC_CONFLICT",
            message: "A operação continua aguardando resolução.",
          });
        } else {
          rejected.push({
            operationId: operation.operationId,
            entity: operation.entity,
            entityId: operation.entityId,
            code: previous.errorCode ?? "SYNC_REJECTED",
            message: "A operação já foi rejeitada.",
          });
        }
        continue;
      }

      try {
        const result = await createCreditEntry(
          this.database,
          operation.payload,
          operation.operationId,
          operation.entityId,
        );

        await this.database.syncOperation.create({
          data: {
            operationId: operation.operationId,
            entity: operation.entity,
            entityId: operation.entityId,
            action: operation.action,
            baseVersion: operation.baseVersion,
            occurredAt: new Date(operation.occurredAt),
            payload: JSON.stringify(creditEntryPayload(operation.payload)),
            status: "accepted",
          },
        });

        accepted.push({
          operationId: operation.operationId,
          entity: operation.entity,
          entityId: operation.entityId,
          duplicate: result.duplicate,
        });
      } catch (error) {
        const isMissingAccount =
          error instanceof Error && error.message === "CREDIT_ACCOUNT_NOT_FOUND";

        await this.database.syncOperation.create({
          data: {
            operationId: operation.operationId,
            entity: operation.entity,
            entityId: operation.entityId,
            action: operation.action,
            baseVersion: operation.baseVersion,
            occurredAt: new Date(operation.occurredAt),
            payload: JSON.stringify(creditEntryPayload(operation.payload)),
            status: isMissingAccount ? "rejected" : "conflict",
            errorCode: isMissingAccount ? "CREDIT_ACCOUNT_NOT_FOUND" : "SYNC_CONFLICT",
          },
        });

        const result = {
          operationId: operation.operationId,
          entity: operation.entity,
          entityId: operation.entityId,
          code: isMissingAccount ? "CREDIT_ACCOUNT_NOT_FOUND" : "SYNC_CONFLICT",
          message: isMissingAccount
            ? "O cliente não possui uma conta de crediário."
            : "A operação precisa ser revisada.",
        };

        if (isMissingAccount) rejected.push(result);
        else conflicts.push(result);
      }
    }

    return response.json(jsonData({ accepted, rejected, conflicts }));
  }

  @Post("resolve-conflict")
  async resolveConflict(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    return response.status(501).json(
      jsonError(
        "SYNC_CONFLICT_RESOLUTION_NOT_READY",
        "A resolução manual de conflitos será implementada na próxima etapa.",
        501,
      ),
    );
  }
}
