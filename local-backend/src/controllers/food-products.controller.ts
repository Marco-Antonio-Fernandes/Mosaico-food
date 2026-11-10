import { Controller, Delete, Get, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { PrismaService } from "../lib/prisma.service";
import type { FoodProduct } from "@prisma/client";
import { consumeLoss, consumePreparation, consumeReadyLoss, consumeUnpreparedLoss, preparationCapacity, preparationDependencies, productFamilyName, recipeOf, recipeSchema, salesCapacity } from "../lib/food-stock";

const costUnitSchema = z.enum(["g", "kg", "ml", "l", "un"]);
const costBreakdownItemSchema = z.object({
  ingredientId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  packageQuantity: z.coerce.number().positive().max(100000000),
  packageUnit: costUnitSchema,
  packageCostCents: z.coerce.number().int().nonnegative().max(100000000000),
  usedQuantity: z.coerce.number().positive().max(100000000),
  usedUnit: costUnitSchema,
});
const costBreakdownSchema = z.object({
  yieldQuantity: z.coerce.number().positive().max(1000000),
  items: z.array(costBreakdownItemSchema).min(1).max(50),
});

const productSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  productName: z.string().trim().min(1).max(120).optional(),
  flavor: z.string().trim().min(1).max(80).nullable().optional().default(null),
  category: z.string().trim().min(1).max(80).default("Geral"),
  aliases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  variants: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(80),
    aliases: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
    priceDeltaCents: z.coerce.number().int().nonnegative().default(0),
  })).max(20).default([]),
  costPriceCents: z.coerce.number().int().nonnegative().default(0),
  costBreakdown: costBreakdownSchema.nullable().optional().default(null),
  salePriceCents: z.coerce.number().int().nonnegative().default(0),
  stockQuantity: z.coerce.number().int().nonnegative().default(0),
  unpreparedQuantity: z.number().int().nonnegative().default(0),
  productionMode: z.enum(["frozen", "ready", "made_here", "resale", "recipe", "ingredient"]).default("frozen"),
  stockUnit: z.enum(["un", "g", "ml"]).default("un"),
  unitWeightGrams: z.coerce.number().int().positive().max(100000000).nullable().optional().default(null),
  unitVolumeMl: z.coerce.number().int().positive().max(100000000).nullable().optional().default(null),
  recipe: recipeSchema.default([]),
  customization: z.object({
    label: z.string().trim().min(1).max(80),
    unit: z.string().trim().min(1).max(30),
    baseQuantity: z.number().int().positive().max(1000),
    additionalUnitPriceCents: z.number().int().nonnegative().max(1000000),
    allowRemoval: z.boolean().default(true),
  }).nullable().optional().default(null),
  allowOnDemand: z.boolean().default(false),
  fryToOrder: z.boolean().default(false),
  active: z.boolean().default(true),
  // Perfil fiscal: não há código padrão, porque NCM/CFOP/tributação dependem
  // do produto, da origem e do regime da loja. Sem esse perfil a emissão deve
  // ser bloqueada pelo módulo fiscal.
  fiscalNcm: z.string().trim().regex(/^\d{8}$/, "NCM deve ter 8 dígitos.").nullable().optional().default(null),
  fiscalCest: z.string().trim().regex(/^\d{7}$/, "CEST deve ter 7 dígitos.").nullable().optional().default(null),
  fiscalGtin: z.string().trim().regex(/^(?:\d{8}|\d{12,14})$/, "GTIN deve ter 8, 12, 13 ou 14 dígitos.").nullable().optional().default(null),
  fiscalUnit: z.enum(["UN", "KG", "G", "L", "ML"]).nullable().optional().default(null),
  fiscalCfop: z.string().trim().regex(/^\d{4}$/, "CFOP deve ter 4 dígitos.").nullable().optional().default(null),
  fiscalOrigin: z.coerce.number().int().min(0).max(8).nullable().optional().default(null),
  fiscalCst: z.string().trim().regex(/^\d{2}$/, "CST deve ter 2 dígitos.").nullable().optional().default(null),
  fiscalCsosn: z.string().trim().regex(/^\d{3}$/, "CSOSN deve ter 3 dígitos.").nullable().optional().default(null),
  fiscalPisCst: z.string().trim().regex(/^\d{2}$/, "CST do PIS deve ter 2 dígitos.").nullable().optional().default(null),
  fiscalCofinsCst: z.string().trim().regex(/^\d{2}$/, "CST da COFINS deve ter 2 dígitos.").nullable().optional().default(null),
  fiscalBenefitCode: z.string().trim().min(1).max(20).nullable().optional().default(null),
});

const createProductSchema = productSchema.refine(value => Boolean(value.name?.trim() || value.productName?.trim()), { message: "Informe o produto." });
const updateProductSchema = productSchema.partial();
const createProductsSchema = z.object({ products: z.array(createProductSchema).min(1).max(20) });
type ProductPayload = z.infer<typeof productSchema>;

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function parseAliases(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function parseVariants(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const variant = item as Record<string, unknown>;
          if (typeof variant.id !== "string" || typeof variant.name !== "string") return [];
          const aliases = Array.isArray(variant.aliases)
            ? variant.aliases.filter((alias): alias is string => typeof alias === "string" && alias.trim().length > 0)
            : [];
          const priceDeltaCents = typeof variant.priceDeltaCents === "number" && Number.isInteger(variant.priceDeltaCents)
            ? variant.priceDeltaCents
            : 0;
          return [{ id: variant.id, name: variant.name, aliases, priceDeltaCents }];
        })
      : [];
  } catch {
    return [];
  }
}

function parseCustomization(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const customization = parsed as Record<string, unknown>;
    if (typeof customization.label !== "string" || typeof customization.unit !== "string" || typeof customization.baseQuantity !== "number" || typeof customization.additionalUnitPriceCents !== "number") return null;
    return {
      label: customization.label,
      unit: customization.unit,
      baseQuantity: customization.baseQuantity,
      additionalUnitPriceCents: customization.additionalUnitPriceCents,
      allowRemoval: customization.allowRemoval !== false,
    };
  } catch {
    return null;
  }
}

function parseCostBreakdown(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    const result = costBreakdownSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function currentMonthStartInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find(part => part.type === "year")?.value ?? String(new Date().getUTCFullYear());
  const month = parts.find(part => part.type === "month")?.value ?? String(new Date().getUTCMonth() + 1).padStart(2, "0");
  return new Date(`${year}-${month}-01T00:00:00-03:00`);
}

function productCreateData(input: ProductPayload) {
  const productName = input.productName?.trim() || input.name?.trim() || "";
  const flavor = input.flavor?.trim() || null;
  const displayName = input.name?.trim() || [productName, flavor].filter(Boolean).join(" · ");
  return {
    name: displayName,
    normalizedName: normalizeText(displayName),
    productName,
    flavor,
    normalizedProductName: normalizeText(productName),
    normalizedFlavor: flavor ? normalizeText(flavor) : null,
    category: input.category,
    aliasesJson: JSON.stringify(input.aliases),
    variantsJson: JSON.stringify(input.variants),
    customizationJson: JSON.stringify(input.customization),
    costPriceCents: input.costPriceCents,
    costBreakdownJson: JSON.stringify(input.costBreakdown),
    salePriceCents: input.salePriceCents,
    stockQuantity: input.stockQuantity,
    unpreparedQuantity: input.productionMode === "frozen" || input.productionMode === "resale" ? input.unpreparedQuantity : 0,
    productionMode: input.productionMode,
    stockUnit: input.productionMode === "ingredient" ? input.stockUnit : "un",
    unitWeightGrams: input.productionMode === "ingredient" ? input.unitWeightGrams : null,
    unitVolumeMl: input.productionMode === "ingredient" ? input.unitVolumeMl : null,
    recipeJson: JSON.stringify(["recipe", "resale", "ingredient"].includes(input.productionMode) ? input.recipe : []),
    recipeProgressJson: "{}",
    salesProgressJson: "{}",
    allowOnDemand: input.productionMode === "made_here" ? true : input.allowOnDemand,
    fryToOrder: false,
    active: input.active,
    fiscalNcm: input.fiscalNcm,
    fiscalCest: input.fiscalCest,
    fiscalGtin: input.fiscalGtin,
    fiscalUnit: input.fiscalUnit,
    fiscalCfop: input.fiscalCfop,
    fiscalOrigin: input.fiscalOrigin,
    fiscalCst: input.fiscalCst,
    fiscalCsosn: input.fiscalCsosn,
    fiscalPisCst: input.fiscalPisCst,
    fiscalCofinsCst: input.fiscalCofinsCst,
    fiscalBenefitCode: input.fiscalBenefitCode,
  };
}

function serializeProduct(product: FoodProduct, catalog: FoodProduct[] = []) {
  const productName = product.productName.trim() || productFamilyName(product.name);
  const acceptsPreparation = product.productionMode === "made_here" || product.allowOnDemand || product.fryToOrder;
  return {
    ...product,
    productName,
    flavor: product.flavor?.trim() || null,
    familyName: productName,
    aliases: parseAliases(product.aliasesJson),
    variants: parseVariants(product.variantsJson),
    customization: parseCustomization(product.customizationJson),
    costBreakdown: parseCostBreakdown(product.costBreakdownJson),
    recipe: recipeOf(product),
    ingredientDependencies: preparationDependencies(product, catalog),
    preparationCapacity: preparationCapacity(product, catalog),
    saleCapacity: salesCapacity(product, catalog),
    allowOnDemand: acceptsPreparation,
    fryToOrder: false,
  };
}

@Controller("api/v1/food/products")
export class FoodProductsController {
  constructor(private readonly database: PrismaService) {}

  private async validRecipe(rows: z.infer<typeof recipeSchema>) {
    if (!rows.length) return true;
    const count = await this.database.foodProduct.count({ where: { id: { in: rows.map(row => row.ingredientId) }, active: true, productionMode: "ingredient" } });
    return count === rows.length;
  }

  private async validateCreateProducts(products: ProductPayload[]) {
    for (const product of products) {
      if (product.productionMode === "recipe" && (!(await this.validRecipe(product.recipe)) || product.stockQuantity !== 0 || product.unpreparedQuantity !== 0)) {
        return false;
      }
    }
    return true;
  }

  @Get()
  async list(
    @Req() request: Request,
    @Query("search") search: string | undefined,
    @Query("active") active: string | undefined,
    @Query("available") available: string | undefined,
    @Res() response: Response,
  ) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const normalizedSearch = search?.trim();
    const products = await this.database.foodProduct.findMany({
      where: {
        ...(normalizedSearch ? { OR: [{ name: { contains: normalizedSearch } }, { productName: { contains: normalizedSearch } }, { flavor: { contains: normalizedSearch } }] } : {}),
        ...(active === "true" ? { active: true } : active === "false" ? { active: false } : {}),
      },
      orderBy: { name: "asc" },
    });
    const catalog = await this.database.foodProduct.findMany();
    return response.json(jsonData({ products: products.map(product => serializeProduct(product, catalog)).filter(product => available !== "true" || (product.active && product.productionMode !== "ingredient" && (product.stockQuantity > 0 || product.unpreparedQuantity > 0 || ((product.allowOnDemand || product.fryToOrder) && (product.productionMode === "recipe" ? product.saleCapacity > 0 : product.preparationCapacity > 0))))) }));
  }

  @Get(":id/loss-summary")
  async lossSummary(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const product = await this.database.foodProduct.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!product) return response.status(404).json(jsonError("NOT_FOUND", "Produto não encontrado.", 404));
    const periodStart = currentMonthStartInSaoPaulo();
    const result = await this.database.foodStockOperation.aggregate({
      _sum: { quantity: true },
      where: { productId: id, action: { in: ["loss", "loss_ready", "loss_unprepared", "loss_split"] }, createdAt: { gte: periodStart } },
    });
    return response.json(jsonData({ productId: product.id, productName: product.name, lossQuantity: result._sum.quantity ?? 0, periodStart: periodStart.toISOString() }));
  }

  @Post()
  async create(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = createProductSchema.safeParse(request.body);
    if (!parsed.success) {
      return response.status(400).json(jsonError("VALIDATION_ERROR", "Confira os dados do produto.", 400));
    }
    if (parsed.data.productionMode === "recipe" && (!(await this.validRecipe(parsed.data.recipe)) || parsed.data.stockQuantity !== 0 || parsed.data.unpreparedQuantity !== 0)) {
      return response.status(400).json(jsonError("INVALID_RECIPE", "Corrija os ingredientes da receita e registre a produção depois de salvar.", 400));
    }

    try {
      const product = await this.database.foodProduct.create({
        data: productCreateData(parsed.data),
      });
      return response.status(201).json(jsonData({ product: serializeProduct(product, await this.database.foodProduct.findMany()) }));
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unique constraint")) {
        return response.status(409).json(jsonError("PRODUCT_ALREADY_EXISTS", "Já existe um produto com esse nome.", 409));
      }
      throw error;
    }
  }

  @Post("batch")
  async createBatch(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = createProductsSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json(jsonError("VALIDATION_ERROR", "Confira os dados dos produtos.", 400));
    if (!(await this.validateCreateProducts(parsed.data.products))) {
      return response.status(400).json(jsonError("INVALID_RECIPE", "Corrija os ingredientes da receita e registre a produção depois de salvar.", 400));
    }

    try {
      const products = await this.database.$transaction(async transaction => {
        const created = [];
        for (const input of parsed.data.products) {
          created.push(await transaction.foodProduct.create({ data: productCreateData(input) }));
        }
        return created;
      });
      const catalog = await this.database.foodProduct.findMany();
      return response.status(201).json(jsonData({ products: products.map(product => serializeProduct(product, catalog)) }));
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unique constraint")) {
        return response.status(409).json(jsonError("PRODUCT_ALREADY_EXISTS", "Já existe um produto ou sabor com esse nome.", 409));
      }
      throw error;
    }
  }

  @Patch(":id")
  async update(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    const parsed = updateProductSchema.safeParse(request.body);
    if (!parsed.success || !Object.keys(parsed.data).length) {
      return response.status(400).json(jsonError("VALIDATION_ERROR", "Informe ao menos um campo válido para atualizar.", 400));
    }

    try {
      const existing = await this.database.foodProduct.findUnique({ where: { id } });
      if (!existing) return response.status(404).json(jsonError("NOT_FOUND", "Produto não encontrado.", 404));
      if (parsed.data.productionMode && parsed.data.productionMode !== existing.productionMode) return response.status(400).json(jsonError("MODE_LOCKED", "Cadastre outro item para mudar o tipo de controle de estoque.", 400));
      if (existing.productionMode === "recipe" && parsed.data.recipe && !(await this.validRecipe(parsed.data.recipe))) return response.status(400).json(jsonError("INVALID_RECIPE", "Selecione ingredientes ativos para a receita.", 400));
      if ((parsed.data.stockQuantity !== undefined && parsed.data.stockQuantity !== existing.stockQuantity) || (parsed.data.unpreparedQuantity !== undefined && parsed.data.unpreparedQuantity !== existing.unpreparedQuantity)) {
        return response.status(400).json(jsonError("USE_STOCK_ACTION", "Use Registrar estoque para receber ou preparar unidades.", 400));
      }
      if (parsed.data.stockUnit && parsed.data.stockUnit !== existing.stockUnit && (existing.productionMode !== "ingredient" || existing.stockQuantity > 0 || existing.unpreparedQuantity > 0)) return response.status(400).json(jsonError("UNIT_LOCKED", "A unidade de um ingrediente com estoque não pode ser alterada.", 400));
      const nextProductName = parsed.data.productName !== undefined ? parsed.data.productName : existing.productName.trim() || productFamilyName(existing.name);
      const nextFlavor = parsed.data.flavor !== undefined ? parsed.data.flavor : existing.flavor;
      const product = await this.database.foodProduct.update({
        where: { id },
        data: {
          ...(parsed.data.category === undefined ? {} : { category: parsed.data.category }),
          ...(parsed.data.productionMode === undefined ? {} : { productionMode: parsed.data.productionMode, allowOnDemand: parsed.data.productionMode === "made_here" ? true : parsed.data.allowOnDemand ?? existing.allowOnDemand }),
          ...(parsed.data.recipe === undefined ? {} : { recipeJson: JSON.stringify(parsed.data.recipe), recipeProgressJson: "{}", salesProgressJson: "{}" }),
          ...(parsed.data.aliases === undefined ? {} : { aliasesJson: JSON.stringify(parsed.data.aliases) }),
          ...(parsed.data.variants === undefined ? {} : { variantsJson: JSON.stringify(parsed.data.variants) }),
          ...(parsed.data.costPriceCents === undefined ? {} : { costPriceCents: parsed.data.costPriceCents }),
          ...(parsed.data.costBreakdown === undefined ? {} : { costBreakdownJson: JSON.stringify(parsed.data.costBreakdown) }),
          ...(parsed.data.salePriceCents === undefined ? {} : { salePriceCents: parsed.data.salePriceCents }),
          ...(parsed.data.unitWeightGrams === undefined ? {} : { unitWeightGrams: parsed.data.unitWeightGrams }),
          ...(parsed.data.unitVolumeMl === undefined ? {} : { unitVolumeMl: parsed.data.unitVolumeMl }),
          ...(parsed.data.allowOnDemand === undefined ? {} : { allowOnDemand: parsed.data.allowOnDemand }),
          ...(parsed.data.fryToOrder === undefined ? {} : { fryToOrder: false }),
          ...(parsed.data.active === undefined ? {} : { active: parsed.data.active }),
          ...(parsed.data.fiscalNcm === undefined ? {} : { fiscalNcm: parsed.data.fiscalNcm }),
          ...(parsed.data.fiscalCest === undefined ? {} : { fiscalCest: parsed.data.fiscalCest }),
          ...(parsed.data.fiscalGtin === undefined ? {} : { fiscalGtin: parsed.data.fiscalGtin }),
          ...(parsed.data.fiscalUnit === undefined ? {} : { fiscalUnit: parsed.data.fiscalUnit }),
          ...(parsed.data.fiscalCfop === undefined ? {} : { fiscalCfop: parsed.data.fiscalCfop }),
          ...(parsed.data.fiscalOrigin === undefined ? {} : { fiscalOrigin: parsed.data.fiscalOrigin }),
          ...(parsed.data.fiscalCst === undefined ? {} : { fiscalCst: parsed.data.fiscalCst }),
          ...(parsed.data.fiscalCsosn === undefined ? {} : { fiscalCsosn: parsed.data.fiscalCsosn }),
          ...(parsed.data.fiscalPisCst === undefined ? {} : { fiscalPisCst: parsed.data.fiscalPisCst }),
          ...(parsed.data.fiscalCofinsCst === undefined ? {} : { fiscalCofinsCst: parsed.data.fiscalCofinsCst }),
          ...(parsed.data.fiscalBenefitCode === undefined ? {} : { fiscalBenefitCode: parsed.data.fiscalBenefitCode }),
          ...(parsed.data.productName === undefined ? {} : { productName: parsed.data.productName, normalizedProductName: normalizeText(parsed.data.productName) }),
          ...(parsed.data.flavor === undefined ? {} : { flavor: parsed.data.flavor, normalizedFlavor: parsed.data.flavor ? normalizeText(parsed.data.flavor) : null }),
          ...(parsed.data.customization === undefined ? {} : { customizationJson: JSON.stringify(parsed.data.customization) }),
          ...((parsed.data.productName !== undefined || parsed.data.flavor !== undefined) ? {
            name: [nextProductName, nextFlavor].filter(Boolean).join(" · "),
            normalizedName: normalizeText([nextProductName, nextFlavor].filter(Boolean).join(" · ")),
          } : {}),
          ...(parsed.data.name === undefined ? {} : { name: parsed.data.name, normalizedName: normalizeText(parsed.data.name) }),
        },
      });
      return response.json(jsonData({ product: serializeProduct(product, await this.database.foodProduct.findMany()) }));
    } catch (error) {
      if (error instanceof Error && error.message.includes("Record to update not found")) {
        return response.status(404).json(jsonError("NOT_FOUND", "Produto não encontrado.", 404));
      }
      if (error instanceof Error && error.message.includes("Unique constraint")) {
        return response.status(409).json(jsonError("PRODUCT_ALREADY_EXISTS", "Já existe um produto com esse nome.", 409));
      }
      throw error;
    }
  }

  @Delete(":id")
  async remove(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);

    try {
      const existing = await this.database.foodProduct.findUnique({ where: { id } });
      if (!existing) return response.status(404).json(jsonError("NOT_FOUND", "Produto não encontrado.", 404));
      const product = await this.database.foodProduct.update({ where: { id }, data: { active: false } });
      return response.json(jsonData({ product: serializeProduct(product, await this.database.foodProduct.findMany()) }));
    } catch (error) {
      if (error instanceof Error && error.message.includes("Record to update not found")) {
        return response.status(404).json(jsonError("NOT_FOUND", "Produto não encontrado.", 404));
      }
      throw error;
    }
  }

  @Post(":id/stock")
  async stock(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const parsed = z.object({
      operationId: z.string().uuid(),
      action: z.enum(["receive_ready", "receive_unprepared", "prepare", "loss", "loss_ready", "loss_unprepared", "loss_split"]),
      quantity: z.number().int().positive().max(1000000).optional(),
      readyQuantity: z.number().int().nonnegative().max(1000000).default(0),
      unpreparedQuantity: z.number().int().nonnegative().max(1000000).default(0),
    }).superRefine((value, context) => {
      if (value.action !== "loss_split" && !value.quantity) context.addIssue({ code: z.ZodIssueCode.custom, path: ["quantity"], message: "Informe uma quantidade." });
      if (value.action === "loss_split" && value.readyQuantity + value.unpreparedQuantity <= 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["readyQuantity"], message: "Informe ao menos uma quantidade para dar baixa." });
    }).safeParse(request.body);
    if (!parsed.success) return response.status(400).json(jsonError("VALIDATION_ERROR", "Informe uma quantidade inteira maior que zero.", 400));
    try {
      const { operationId, action } = parsed.data;
      const quantity = action === "loss_split" ? parsed.data.readyQuantity + parsed.data.unpreparedQuantity : parsed.data.quantity ?? 0;
      await this.database.$transaction(async tx => {
        const previous = await tx.foodStockOperation.findUnique({ where: { id: operationId } });
        if (previous) {
          if (previous.productId !== id || previous.action !== action || previous.quantity !== quantity) throw new Error("Operação já utilizada para outro lançamento.");
          return;
        }
        const product = await tx.foodProduct.findUniqueOrThrow({ where: { id } });
        if (!product.active) throw new Error("Ative o produto antes de registrar estoque.");
        if (product.productionMode === "ingredient" && action !== "receive_ready" && action !== "loss" && action !== "loss_ready") throw new Error("Ingredientes recebem entrada na unidade cadastrada.");
        if (product.productionMode === "recipe" && action === "receive_ready") throw new Error("Produtos feitos na loja entram como unidades para finalizar ou são registrados pela produção.");
        if (action === "prepare") await consumePreparation(tx, id, quantity);
        if (action === "loss") await consumeLoss(tx, id, quantity);
        else if (action === "loss_ready") await consumeReadyLoss(tx, id, quantity);
        else if (action === "loss_unprepared") await consumeUnpreparedLoss(tx, id, quantity);
        else if (action === "loss_split") {
          if (parsed.data.readyQuantity) await consumeReadyLoss(tx, id, parsed.data.readyQuantity);
          if (parsed.data.unpreparedQuantity) await consumeUnpreparedLoss(tx, id, parsed.data.unpreparedQuantity);
        }
        else if (action === "prepare") await tx.foodProduct.update({ where: { id }, data: { stockQuantity: { increment: quantity } } });
        else await tx.foodProduct.update({ where: { id }, data: action === "receive_unprepared" ? { unpreparedQuantity: { increment: quantity } } : { stockQuantity: { increment: quantity } } });
        await tx.foodStockOperation.create({ data: { id: operationId, productId: id, action, quantity } });
      });
      const product = await this.database.foodProduct.findUniqueOrThrow({ where: { id } });
      return response.json(jsonData({ product: serializeProduct(product, await this.database.foodProduct.findMany()) }));
    } catch (error) {
      return response.status(409).json(jsonError("STOCK_CONFLICT", error instanceof Error ? error.message : "Não foi possível registrar o estoque.", 409));
    }
  }
}
