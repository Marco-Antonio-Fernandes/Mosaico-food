import { Controller, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { PrismaService } from "../lib/prisma.service";
import { databaseUnavailable, jsonData, rejectUnauthorized } from "../lib/http";
import { businessDate } from "../lib/cash-session";
import { suggestOrderFromText } from "../features/food-automation/food-automation";
import { createCreditEntry } from "../lib/credit-entry";

const SELF_NOTE_PHONES = new Set(["554498838778"]);
const stockWords = /\b(preparei|fritei|assei|cozinhei|produzi|fiz|recebi|recebemos|entrou|entraram|chegou|chegaram|adicionei|acrescentei)\b/i;
const paymentWords = /\b(pagou|quitou|acertou|efetuou\s+o\s+pagamento)\b/i;

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();

function paymentMethod(text: string) {
  if (/\bpix\b/i.test(text)) return "pix";
  if (/\b(dinheiro|especie|espécie)\b/i.test(text)) return "cash";
  if (/\b(debito|débito)\b/i.test(text)) return "card_debit";
  if (/\b(credito|crédito)\b/i.test(text)) return "card_credit";
  if (/\b(vale|alimentacao|alimentação|refeicao|refeição)\b/i.test(text)) return "meal_voucher";
  return null;
}

function amountCents(text: string) {
  const match = text.match(/(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

function payerName(text: string) {
  const match = text.match(/^\s*(?:o|a)?\s*([a-zà-ú][a-zà-ú\s]{2,60}?)\s+(?:pagou|quitou|acertou|efetuou\s+o\s+pagamento)/i);
  return match?.[1]?.trim() || null;
}

@Controller("api/v1/food/owner-notes")
export class FoodOwnerNotesController {
  constructor(private readonly database: PrismaService) {}

  @Post("process")
  async process(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const startOfToday = new Date(`${businessDate()}T00:00:00-03:00`);
    const conversations = await this.database.foodConversation.findMany({
      where: { remoteJid: { endsWith: "@s.whatsapp.net" } },
      select: { id: true, remoteJid: true },
    });
    const selfIds = conversations.filter(conversation => SELF_NOTE_PHONES.has(conversation.remoteJid.replace(/@.*$/, ""))).map(conversation => conversation.id);
    if (!selfIds.length) return response.json(jsonData({ actions: [] }));
    const messages = await this.database.foodMessage.findMany({
      where: { conversationId: { in: selfIds }, direction: "outbound", source: "human", createdAt: { gte: startOfToday }, ownerProcessedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const actions: Array<Record<string, unknown>> = [];
    for (const message of messages) {
      const text = message.body?.trim();
      if (!text) continue;
      if (stockWords.test(text)) {
        const parsed = await suggestOrderFromText(this.database, text).catch(() => null);
        const items = parsed?.items.filter(item => item.quantity > 0) ?? [];
        if (!items.length) continue;
        try {
          await this.database.$transaction(async tx => {
            for (const item of items) {
              const product = await tx.foodProduct.findUnique({ where: { id: item.productId } });
              if (!product || product.productionMode === "ingredient") continue;
              const operationId = `owner:${message.id}:${item.productId}`;
              if (await tx.foodStockOperation.findUnique({ where: { id: operationId } })) continue;
              await tx.foodProduct.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
              await tx.foodStockOperation.create({ data: { id: operationId, productId: item.productId, action: "receive_ready", quantity: item.quantity } });
              actions.push({ type: "stock", product: product.name, quantity: item.quantity, message: message.id });
            }
            await tx.foodMessage.update({ where: { id: message.id }, data: { ownerProcessedAt: new Date() } });
          });
        } catch {
          // Deixa para a próxima tentativa.
        }
        continue;
      }
      if (paymentWords.test(text)) {
        const name = payerName(text);
        const amount = amountCents(text);
        const method = paymentMethod(text);
        if (!name || !amount || !method) continue;
        const customers = await this.database.customer.findMany({ where: { creditAccount: { isNot: null } } });
        const target = customers.find(customer => normalize(customer.name) === normalize(name)) ?? customers.find(customer => normalize(customer.name).includes(normalize(name)));
        if (!target) continue;
        try {
          await createCreditEntry(this.database, { customerId: target.id, type: "payment", amountCents: amount, paymentMethod: method as never, note: "Pagamento por áudio" }, `owner:${message.id}`);
          await this.database.foodMessage.update({ where: { id: message.id }, data: { ownerProcessedAt: new Date() } });
          actions.push({ type: "credit_payment", customer: target.name, amountCents: amount, paymentMethod: method, message: message.id });
        } catch {
          // Deixa para a próxima tentativa.
        }
      }
    }
    return response.json(jsonData({ actions }));
  }
}
