import { Controller, Get, Patch, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import {
  getFoodAutomationStatus,
  runFoodAutomation,
  setFoodAutomationEnabled,
} from "../features/food-automation/food-automation";
import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { PrismaService } from "../lib/prisma.service";

const configSchema = z.object({ enabled: z.boolean() });
const runSchema = z.object({
  conversationId: z.string().uuid().optional(),
  transport: z.enum(["wa-akg", "relay"]).optional(),
  force: z.boolean().optional(),
  latestOnly: z.boolean().optional(),
});

@Controller("api/v1/food-automation")
export class FoodAutomationController {
  constructor(private readonly database: PrismaService) {}

  @Get("status")
  async status(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    return response.json(jsonData(await getFoodAutomationStatus(this.database)));
  }

  @Patch("config")
  async config(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = configSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(
        jsonError("VALIDATION_ERROR", "Informe se a automação deve ficar habilitada.", 400),
      );
    }

    await setFoodAutomationEnabled(this.database, parsed.data.enabled);
    return response.json(jsonData(await getFoodAutomationStatus(this.database)));
  }

  @Post("run")
  async run(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = runSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return response.status(400).json(jsonError("VALIDATION_ERROR", "O identificador da conversa é inválido.", 400));
    }

    // No modo ponte o aplicativo local processa a conversa e devolve as
    // respostas para serem enviadas pelo WhatsApp remoto. Sem isso, o teste
    // exigiria WA-AKG configurado dentro do computador da loja.
    const result = await runFoodAutomation(this.database, {
      ...(parsed.data.conversationId ? { conversationId: parsed.data.conversationId } : {}),
      ...(parsed.data.force ? { force: true } : {}),
      ...(parsed.data.latestOnly ? { latestOnly: true } : {}),
      ...(parsed.data.transport === "relay"
        ? { sendText: async () => ({ providerMessageId: null }) }
        : {}),
    });
    if (!result.enabled) {
      return response.status(409).json(
        jsonError("AUTOMATION_DISABLED", "Habilite o atendimento automático antes de executar.", 409),
      );
    }

    return response.json(jsonData(result));
  }
}
