import { Controller, Get, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PrismaService } from "../lib/prisma.service";
import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";

@Controller("api/v1/food/stock-notifications")
export class FoodStockNotificationsController {
  constructor(private readonly database: PrismaService) {}

  @Get()
  async list(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const prompts = await this.database.foodStockPrompt.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 100 });
    return response.json(jsonData({ notifications: prompts.map(prompt => ({
      id: prompt.id,
      productName: prompt.productName,
      ingredientName: prompt.ingredientName,
      quantity: prompt.quantity,
      yieldQuantity: prompt.yieldQuantity,
      createdAt: prompt.createdAt,
    })) }));
  }

  @Post(":id/confirm")
  async confirm(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    try {
      await this.database.$transaction(async tx => {
        const prompt = await tx.foodStockPrompt.findUnique({ where: { id } });
        if (!prompt) throw new Error("Notificação não encontrada.");
        if (prompt.status !== "pending") return;
        const stock = await tx.foodProduct.updateMany({ where: { id: prompt.ingredientId, active: true, productionMode: "ingredient", stockQuantity: { gte: prompt.quantity } }, data: { stockQuantity: { decrement: prompt.quantity } } });
        if (stock.count !== 1) throw new Error(`Não há ${prompt.quantity} unidade${prompt.quantity === 1 ? "" : "s"} de ${prompt.ingredientName} no estoque.`);
        await tx.foodStockPrompt.update({ where: { id }, data: { status: "confirmed", resolvedAt: new Date() } });
      });
      return response.json(jsonData({ message: "Estoque do insumo atualizado." }));
    } catch (error) {
      return response.status(409).json(jsonError("STOCK_PROMPT_CONFLICT", error instanceof Error ? error.message : "Não foi possível baixar o insumo.", 409));
    }
  }

  @Post(":id/dismiss")
  async dismiss(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const prompt = await this.database.foodStockPrompt.findUnique({ where: { id } });
    if (!prompt) return response.status(404).json(jsonError("NOT_FOUND", "Notificação não encontrada.", 404));
    if (prompt.status === "pending") await this.database.foodStockPrompt.update({ where: { id }, data: { status: "dismissed", resolvedAt: new Date() } });
    return response.json(jsonData({ message: "Notificação deixada para depois." }));
  }
}
