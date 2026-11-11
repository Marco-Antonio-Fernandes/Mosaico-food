import { Controller, Get, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { suggestOrderFromText } from "../features/food-automation/food-automation";
import { databaseUnavailable, jsonData, rejectUnauthorized } from "../lib/http";
import { PrismaService } from "../lib/prisma.service";

const LOOKBACK_DAYS = 7;

@Controller("api/v1/food/order-suggestions")
export class FoodOrderSuggestionsController {
  constructor(private readonly database: PrismaService) {}

  @Get()
  async list(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const conversations = await this.database.foodConversation.findMany({
      where: { lastMessageAt: { gte: since } },
      orderBy: { lastMessageAt: "desc" },
      take: 200,
      include: {
        customer: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    const suggestions: Array<Record<string, unknown>> = [];
    for (const conversation of conversations) {
      const messages = conversation.messages;
      let humanIndex = -1;
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].direction === "outbound" && messages[index].source === "human") {
          humanIndex = index;
          break;
        }
      }
      if (humanIndex < 0) continue;

      const block: typeof messages = [];
      for (let index = humanIndex - 1; index >= 0; index -= 1) {
        if (messages[index].direction === "outbound") break;
        block.unshift(messages[index]);
        if (block.length >= 5) break;
      }
      if (!block.length) continue;

      const text = block
        .map(message => message.body)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join("\n");
      if (!text.trim()) continue;

      const lastInbound = block[block.length - 1];
      const existingOrder = await this.database.foodOrder.findFirst({
        where: { conversationId: conversation.id, createdAt: { gte: lastInbound.createdAt } },
      });
      if (existingOrder) continue;

      const draft = await suggestOrderFromText(this.database, text);
      if (draft.items.length) {
        suggestions.push({
          id: `${conversation.id}:${block.map(message => message.id).join(",")}`,
          conversationId: conversation.id,
          customerName: draft.customerName || conversation.customer?.name || conversation.remoteJid.replace(/@.*$/, ""),
          remoteJid: conversation.remoteJid,
          messageIds: block.map(message => message.id),
          answeredAt: messages[humanIndex].createdAt,
          origin: "customer",
          text,
          ...draft,
        });
      }

      // Anotações enviadas pela própria loja (texto ou áudio transcrito).
      // Elas viram prévias de pedido para o operador aprovar/editar.
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const note = messages[index];
        if (note.direction !== "outbound" || note.source !== "human") continue;
        const noteText = note.body?.trim();
        if (!noteText) continue;
        const orderAfterNote = await this.database.foodOrder.findFirst({
          where: { conversationId: conversation.id, createdAt: { gte: note.createdAt } },
        });
        if (orderAfterNote) break;
        const noteDraft = await suggestOrderFromText(this.database, noteText);
        if (!noteDraft.items.length) continue;
        suggestions.push({
          id: `owner:${conversation.id}:${note.id}`,
          conversationId: conversation.id,
          customerName: noteDraft.customerName || conversation.customer?.name || conversation.remoteJid.replace(/@.*$/, ""),
          remoteJid: conversation.remoteJid,
          messageIds: [note.id],
          answeredAt: note.createdAt,
          origin: "owner",
          text: noteText,
          ...noteDraft,
        });
        break;
      }
    }

    return response.json(jsonData({ suggestions }));
  }
}
