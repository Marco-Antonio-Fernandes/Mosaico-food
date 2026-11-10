import { Controller, Get, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { PrismaService } from "../lib/prisma.service";

const notificationQuerySchema = z.object({
  after: z.string().datetime({ offset: true }).optional(),
});

@Controller("api/v1/whatsapp")
export class WhatsappLocalController {
  constructor(private readonly database: PrismaService) {}

  @Get("notifications")
  async notifications(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = notificationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return response.status(400).json(jsonError("VALIDATION_ERROR", "O intervalo de notificações é inválido.", 400));
    }

    const after = parsed.data.after ? new Date(parsed.data.after) : null;
    const messages = await this.database.foodMessage.findMany({
      where: {
        direction: "inbound",
        needsHuman: true,
        ...(after ? { createdAt: { gt: after } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        conversation: {
          include: { customer: true },
        },
      },
    });

    return response.json(jsonData({
      notifications: messages.map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        providerMessageId: message.providerMessageId,
        body: message.body,
        createdAt: message.createdAt,
        customerName: message.conversation.customer?.name || message.conversation.remoteJid.replace(/@.*$/, ""),
        remoteJid: message.conversation.remoteJid,
        automationPaused: message.conversation.automationPaused,
        needsHuman: true,
      })),
    }));
  }
}
