import { Controller, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { recordHumanMessageContext } from "../features/food-automation/food-automation";
import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { env } from "../lib/env";
import { PrismaService } from "../lib/prisma.service";

const relayMessageSchema = z.object({
  providerMessageId: z.string().trim().min(1).max(300),
  sessionId: z.string().trim().min(1).max(150),
  remoteJid: z.string().trim().min(3).max(200),
  customerName: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().max(20_000).nullable(),
  mediaType: z.string().trim().max(80).nullable().optional(),
  locationLatitude: z.number().finite().nullable().optional(),
  locationLongitude: z.number().finite().nullable().optional(),
  locationAddress: z.string().trim().max(1000).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  direction: z.enum(["inbound", "outbound"]).default("inbound"),
});

function normalizeRemoteJid(value: string) {
  if (value.endsWith("@s.whatsapp.net") || value.endsWith("@g.us")) return value;
  const digits = value.replace(/\D/g, "");
  const number = digits.startsWith("55") ? digits : digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return number ? `${number}@s.whatsapp.net` : "";
}

function phoneFromJid(remoteJid: string) {
  return remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
}

@Controller("api/v1/food/relay")
export class FoodRelayController {
  constructor(private readonly database: PrismaService) {}

  @Post("ingest")
  async ingest(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (env.MOSAICO_RELAY_ONLY) {
      return response.status(409).json(jsonError("LOCAL_BACKEND_REQUIRED", "O processamento deve ser feito pelo aplicativo local.", 409));
    }
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = relayMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(jsonError("VALIDATION_ERROR", "A mensagem recebida pela ponte é inválida.", 400));
    }

    const input = parsed.data;
    const remoteJid = normalizeRemoteJid(input.remoteJid);
    const phone = phoneFromJid(remoteJid);
    if (!remoteJid || !phone) return response.status(400).json(jsonError("VALIDATION_ERROR", "O telefone da mensagem é inválido.", 400));
    const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();

    const customer = await this.database.foodCustomer.upsert({
      where: { normalizedPhone: phone },
      create: { name: input.customerName || phone, normalizedPhone: phone, phone, automationEnabled: false },
      update: { ...(input.customerName ? { name: input.customerName } : {}), phone },
    });
    let conversation = await this.database.foodConversation.upsert({
      where: { sessionId_remoteJid: { sessionId: input.sessionId, remoteJid } },
      create: { sessionId: input.sessionId, remoteJid, customerId: customer.id, lastMessageAt: createdAt },
      update: { customerId: customer.id, lastMessageAt: createdAt },
    });

    if (input.direction === "inbound" && conversation.automationPaused) {
      const previousMessage = await this.database.foodMessage.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
      });
      if (previousMessage?.direction === "outbound" && previousMessage.source === "human") {
        conversation = await this.database.foodConversation.update({
          where: { id: conversation.id },
          data: { automationPaused: false },
        });
      }
    }

    const providerMessageId = input.providerMessageId || `relay:${randomUUID()}`;
    const existing = await this.database.foodMessage.findUnique({
      where: { sessionId_providerMessageId: { sessionId: input.sessionId, providerMessageId } },
    });

    if (input.direction === "outbound") {
      const message = existing ?? await this.database.foodMessage.create({
        data: {
          conversationId: conversation.id,
          sessionId: input.sessionId,
          providerMessageId,
          direction: "outbound",
          source: "human",
          body: input.body,
          mediaType: input.mediaType ?? null,
          locationLatitude: input.locationLatitude ?? null,
          locationLongitude: input.locationLongitude ?? null,
          locationAddress: input.locationAddress ?? null,
          createdAt,
          processedAt: new Date(),
        },
      });
      await this.database.foodMessage.updateMany({
        where: { conversationId: conversation.id, direction: "inbound", processedAt: null },
        data: { processedAt: new Date(), needsHuman: false },
      });
      await this.database.foodConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: createdAt, automationPaused: true } });
      await recordHumanMessageContext(this.database, conversation.id, input.body).catch(() => undefined);
      return response.json(jsonData({ conversationId: conversation.id, message, replies: [] }));
    }

    if (existing) {
      return response.json(jsonData({ conversationId: conversation.id, message: existing, replies: [] }));
    }

    const message = await this.database.foodMessage.create({
      data: {
        conversationId: conversation.id,
        sessionId: input.sessionId,
        providerMessageId,
        direction: "inbound",
        source: "customer",
        body: input.body,
        mediaType: input.mediaType ?? null,
        locationLatitude: input.locationLatitude ?? null,
        locationLongitude: input.locationLongitude ?? null,
        locationAddress: input.locationAddress ?? null,
        transcriptionStatus: input.mediaType === "audio" ? "completed" : null,
        createdAt,
      },
    });

    return response.json(jsonData({ conversationId: conversation.id, message, replies: [] }));
  }
}
