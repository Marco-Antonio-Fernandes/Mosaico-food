import { Controller, Get, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { PrismaService } from "../lib/prisma.service";
import { WaAkgClient } from "../lib/wa-akg";
import { recordHumanMessageContext, runFoodAutomation } from "../features/food-automation/food-automation";

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "A mensagem não pode ficar vazia.").max(5000),
});

const transcriptionSchema = z.object({
  text: z.string().trim().min(1, "A transcrição não pode ficar vazia.").max(5000),
});

const modeSchema = z.object({ automationPaused: z.boolean() });
const exportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function saoPauloDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = new Map(parts.map(part => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function localDateStart(value: string) {
  return new Date(`${value}T00:00:00-03:00`);
}

@Controller("api/v1/food/conversations")
export class FoodConversationsController {
  constructor(
    private readonly database: PrismaService,
    private readonly waAkg: WaAkgClient,
  ) {}

  @Get()
  async list(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const conversations = await this.database.foodConversation.findMany({
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        customer: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return response.json(
      jsonData({
        conversations: conversations.map(({ messages, ...conversation }) => ({
          ...conversation,
          lastMessage: messages[0] ?? null,
        })),
      }),
    );
  }

  @Get("export")
  async exportMessages(@Req() request: Request, @Query() query: Record<string, unknown>, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const today = saoPauloDate();
    const parsed = exportQuerySchema.safeParse({ from: query.from, to: query.to });
    if (!parsed.success) {
      return response.status(400).json(jsonError("VALIDATION_ERROR", "Use datas no formato AAAA-MM-DD.", 400));
    }
    const from = parsed.data.from ?? today;
    const to = parsed.data.to ?? from;
    const start = localDateStart(from);
    const end = new Date(localDateStart(to).getTime() + 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return response.status(400).json(jsonError("VALIDATION_ERROR", "O intervalo de datas é inválido.", 400));
    }

    const conversations = await this.database.foodConversation.findMany({
      where: { messages: { some: { createdAt: { gte: start, lt: end } } } },
      orderBy: [{ lastMessageAt: "asc" }, { createdAt: "asc" }],
      include: {
        customer: true,
        messages: {
          where: { createdAt: { gte: start, lt: end } },
          orderBy: { createdAt: "asc" },
        },
        orders: {
          orderBy: { createdAt: "asc" },
          include: { items: true },
        },
      },
    });

    return response.json(jsonData({
      format: "mosaico-food-conversation-log",
      version: 1,
      exportedAt: new Date().toISOString(),
      period: { from, to, timezone: "America/Sao_Paulo" },
      conversations,
    }));
  }

  @Get(":id/messages")
  async messages(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const conversation = await this.database.foodConversation.findUnique({ where: { id } });
    if (!conversation) {
      return response.status(404).json(jsonError("NOT_FOUND", "Conversa não encontrada.", 404));
    }

    const messages = await this.database.foodMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
      take: 300,
    });
    return response.json(jsonData({ messages }));
  }

  @Get(":id/messages/:messageId/audio")
  async audio(@Req() request: Request, @Param("id") id: string, @Param("messageId") messageId: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const message = await this.database.foodMessage.findFirst({ where: { id: messageId, conversationId: id } });
    if (!message || message.mediaType !== "audio") {
      return response.status(404).json(jsonError("NOT_FOUND", "Áudio não encontrado.", 404));
    }
    if (!this.waAkg.isConfigured) {
      return response.status(503).json(jsonError("WA_AKG_NOT_CONFIGURED", "Configure o WA-AKG antes de baixar o áudio.", 503));
    }

    try {
      const audio = await this.waAkg.downloadAudio(message.providerMessageId, message.mediaUrl);
      response.setHeader("Content-Type", "audio/ogg");
      response.setHeader("Content-Length", String(audio.length));
      response.setHeader("Cache-Control", "no-store");
      return response.send(Buffer.from(audio));
    } catch (error) {
      return response.status(502).json(jsonError("AUDIO_UNAVAILABLE", error instanceof Error ? error.message : "Áudio indisponível.", 502));
    }
  }

  @Get(":id/messages/:messageId/media")
  async media(@Req() request: Request, @Param("id") id: string, @Param("messageId") messageId: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const message = await this.database.foodMessage.findFirst({ where: { id: messageId, conversationId: id } });
    if (!message || !message.mediaType || !["image", "audio"].includes(message.mediaType)) {
      return response.status(404).json(jsonError("NOT_FOUND", "Mídia não encontrada.", 404));
    }
    if (!this.waAkg.isConfigured) {
      return response.status(503).json(jsonError("WA_AKG_NOT_CONFIGURED", "Configure o WA-AKG antes de baixar a mídia.", 503));
    }

    try {
      const media = await this.waAkg.downloadMedia(message.providerMessageId, message.mediaUrl);
      const contentType = message.mediaType === "image"
        ? (media.contentType?.startsWith("image/") ? media.contentType : "image/jpeg")
        : (media.contentType?.startsWith("audio/") ? media.contentType : "audio/ogg");
      response.setHeader("Content-Type", contentType);
      response.setHeader("Content-Length", String(media.bytes.length));
      response.setHeader("Cache-Control", "private, no-store");
      return response.send(Buffer.from(media.bytes));
    } catch (error) {
      return response.status(502).json(jsonError("MEDIA_UNAVAILABLE", error instanceof Error ? error.message : "Mídia indisponível.", 502));
    }
  }

  @Post(":id/messages/:messageId/transcription")
  async transcription(@Req() request: Request, @Param("id") id: string, @Param("messageId") messageId: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = transcriptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(jsonError("VALIDATION_ERROR", "Informe uma transcrição válida.", 400));
    }
    const message = await this.database.foodMessage.findFirst({ where: { id: messageId, conversationId: id } });
    if (!message || message.mediaType !== "audio" || message.direction !== "inbound") {
      return response.status(404).json(jsonError("NOT_FOUND", "Mensagem de áudio não encontrada.", 404));
    }

    const updated = await this.database.foodMessage.update({
      where: { id: message.id },
      data: { body: parsed.data.text, transcriptionStatus: "completed", processedAt: null },
    });
    void runFoodAutomation(this.database, { conversationId: id }).catch(() => undefined);
    return response.json(jsonData({ message: updated }));
  }

  @Post(":id/messages")
  async sendMessage(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = sendMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(jsonError("VALIDATION_ERROR", "Informe uma mensagem válida.", 400));
    }

    const conversation = await this.database.foodConversation.findUnique({ where: { id } });
    if (!conversation) {
      return response.status(404).json(jsonError("NOT_FOUND", "Conversa não encontrada.", 404));
    }
    if (!this.waAkg.isConfigured) {
      return response.status(503).json(jsonError("WA_AKG_NOT_CONFIGURED", "Configure o WA-AKG no backend antes de enviar mensagens.", 503));
    }

    let sent: Awaited<ReturnType<WaAkgClient["sendText"]>>;
    try {
      sent = await this.waAkg.sendText(conversation.remoteJid, parsed.data.body);
    } catch (error) {
      return response.status(502).json(
        jsonError(
          "WHATSAPP_SEND_FAILED",
          error instanceof Error ? error.message : "Não foi possível enviar a mensagem pelo WhatsApp.",
          502,
        ),
      );
    }

    const message = await this.database.foodMessage.create({
      data: {
        conversationId: id,
        sessionId: this.waAkg.sessionId ?? "",
        providerMessageId: sent.providerMessageId ?? `outbound:${randomUUID()}`,
        direction: "outbound",
        source: "human",
        body: parsed.data.body,
        processedAt: new Date(),
      },
    });
    await this.database.foodMessage.updateMany({
      where: { conversationId: id, direction: "inbound", processedAt: null },
      data: { processedAt: new Date(), needsHuman: false },
    });
    await this.database.foodConversation.update({
      where: { id },
      data: { lastMessageAt: new Date(), automationPaused: true },
    });
    await recordHumanMessageContext(this.database, id, parsed.data.body).catch(() => undefined);

    return response.status(201).json(jsonData({ message }));
  }

  @Patch(":id/mode")
  async mode(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = modeSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(jsonError("VALIDATION_ERROR", "Informe o estado do atendimento automático.", 400));
    }

    try {
      const conversation = await this.database.foodConversation.update({
        where: { id },
        data: { automationPaused: parsed.data.automationPaused },
      });
      if (!conversation.automationPaused) {
        void runFoodAutomation(this.database, { conversationId: id }).catch(() => undefined);
      }
      return response.json(jsonData({ conversation }));
    } catch (error) {
      if (error instanceof Error && error.message.includes("Record to update not found")) {
        return response.status(404).json(jsonError("NOT_FOUND", "Conversa não encontrada.", 404));
      }
      throw error;
    }
  }
}
