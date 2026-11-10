import { randomUUID } from "node:crypto";
import { z } from "zod";

import { env } from "./env";
import { PrismaService } from "./prisma.service";

export const fiscalSourceTypeSchema = z.enum(["counter_sale", "order_item"]);

export const foodFiscalIssueSchema = z.object({
  sourceType: fiscalSourceTypeSchema,
  sourceId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().positive().optional(),
  paymentMethod: z.string().trim().max(40).nullable().optional(),
  buyer: z.object({
    document: z.string().trim().max(18).optional(),
    name: z.string().trim().min(2).max(60).optional(),
    email: z.string().trim().email().max(160).optional(),
    address: z.object({
      street: z.string().trim().min(1).max(60),
      number: z.string().trim().min(1).max(60),
      neighborhood: z.string().trim().min(1).max(60),
      city: z.string().trim().min(1).max(60),
      ibge: z.number().int().min(1000000).max(9999999),
      uf: z.string().trim().length(2).transform((value) => value.toUpperCase()),
      cep: z.string().trim().regex(/^\d{8}$/),
    }).optional(),
  }).optional(),
  sourceSnapshot: z.object({
    product: z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(160),
      fiscalNcm: z.string().nullable(),
      fiscalCest: z.string().nullable(),
      fiscalGtin: z.string().nullable(),
      fiscalUnit: z.string().nullable(),
      fiscalCfop: z.string().nullable(),
      fiscalOrigin: z.number().int().nullable(),
      fiscalCst: z.string().nullable(),
      fiscalCsosn: z.string().nullable(),
      fiscalPisCst: z.string().nullable(),
      fiscalCofinsCst: z.string().nullable(),
      fiscalBenefitCode: z.string().nullable(),
    }),
    quantity: z.number().int().positive(),
    unitPriceCents: z.number().int().nonnegative(),
    totalCents: z.number().int().nonnegative(),
    paymentMethod: z.string().trim().max(40).nullable(),
    paymentStatus: z.string().trim().max(40),
    fulfillment: z.string().trim().max(40),
  }).optional(),
});

export type FoodFiscalIssueInput = z.infer<typeof foodFiscalIssueSchema>;

export class FoodFiscalError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
    public readonly fields: { field: string; message: string }[] = [],
  ) {
    super(message);
  }
}

type FiscalProduct = {
  id: string;
  name: string;
  fiscalNcm: string | null;
  fiscalCest: string | null;
  fiscalGtin: string | null;
  fiscalUnit: string | null;
  fiscalCfop: string | null;
  fiscalOrigin: number | null;
  fiscalCst: string | null;
  fiscalCsosn: string | null;
  fiscalPisCst: string | null;
  fiscalCofinsCst: string | null;
  fiscalBenefitCode: string | null;
};

type BuyerInput = NonNullable<FoodFiscalIssueInput["buyer"]>;

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function isValidDocument(value: unknown) {
  const digits = onlyDigits(value);
  if (![11, 14].includes(digits.length) || /^([0-9])\1+$/.test(digits)) return false;
  const size = digits.length === 11 ? 9 : 12;
  const calculate = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  if (calculate(size) !== Number(digits[size])) return false;
  if (digits.length === 11) return calculate(10) === Number(digits[10]);
  let sum = 0;
  for (let index = 0; index < 12; index += 1) sum += Number(digits[index]) * (index < 4 ? 5 - index : 13 - index);
  const first = (sum % 11 < 2) ? 0 : 11 - (sum % 11);
  if (first !== Number(digits[12])) return false;
  sum = 0;
  for (let index = 0; index < 13; index += 1) sum += Number(digits[index]) * (index < 5 ? 6 - index : 14 - index);
  const second = (sum % 11 < 2) ? 0 : 11 - (sum % 11);
  return second === Number(digits[13]);
}

function text(value: unknown, max = 120) {
  return String(value ?? "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\xFF]/g, " ")
    .replace(/[\x7F\x80-\x9F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function money(cents: number) {
  return Number((cents / 100).toFixed(2));
}

function paymentCode(paymentMethod: string | null | undefined) {
  const codes: Record<string, string> = {
    cash: "01",
    card_credit: "03",
    card_debit: "04",
    meal_voucher: "10",
    pix: "17",
  };
  return codes[paymentMethod ?? ""] ?? "99";
}

function fiscalIssues(product: FiscalProduct) {
  const issues: { field: string; message: string }[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  if (!/^\d{8}$/.test(product.fiscalNcm ?? "")) add("fiscalNcm", "Cadastre o NCM de 8 dígitos do produto.");
  if (!product.fiscalUnit) add("fiscalUnit", "Cadastre a unidade comercial fiscal do produto.");
  if (!/^\d{4}$/.test(product.fiscalCfop ?? "")) add("fiscalCfop", "Cadastre o CFOP da saída com orientação do contador.");
  if (product.fiscalOrigin === null || product.fiscalOrigin < 0 || product.fiscalOrigin > 8) add("fiscalOrigin", "Cadastre a origem da mercadoria de 0 a 8.");
  if (!/^\d{2}$/.test(product.fiscalPisCst ?? "")) add("fiscalPisCst", "Cadastre o CST do PIS definido para o produto.");
  if (!/^\d{2}$/.test(product.fiscalCofinsCst ?? "")) add("fiscalCofinsCst", "Cadastre o CST da COFINS definido para o produto.");

  const simpleNational = env.FOOD_FISCAL_CRT === 1 || env.FOOD_FISCAL_CRT === 4;
  if (simpleNational) {
    if (!/^\d{3}$/.test(product.fiscalCsosn ?? "")) add("fiscalCsosn", "Cadastre o CSOSN definido para o produto.");
    if (product.fiscalCst) add("fiscalCst", "Não misture CST com CSOSN no mesmo perfil fiscal.");
  } else {
    if (!/^\d{2}$/.test(product.fiscalCst ?? "")) add("fiscalCst", "Cadastre o CST definido para o produto.");
    if (product.fiscalCsosn) add("fiscalCsosn", "CSOSN só pode ser usado no Simples Nacional ou MEI.");
  }

  const usesSubstitutionTax = product.fiscalCfop?.startsWith("54") || ["10", "30", "60", "70", "90"].includes(product.fiscalCst ?? "") || ["201", "202", "203", "500", "900"].includes(product.fiscalCsosn ?? "");
  if (usesSubstitutionTax && !/^\d{7}$/.test(product.fiscalCest ?? "")) add("fiscalCest", "Este perfil indica substituição tributária; cadastre o CEST correto.");
  if (product.fiscalGtin && !/^(?:\d{8}|\d{12,14})$/.test(product.fiscalGtin)) add("fiscalGtin", "GTIN inválido; use 8, 12, 13 ou 14 dígitos, ou deixe vazio.");
  return issues;
}

function validateBuyer(buyer: BuyerInput | undefined, model: number) {
  if (model !== 55 && !buyer) return;
  if (!buyer) throw new FoodFiscalError("BUYER_REQUIRED", "Para NF-e modelo 55, informe o destinatário completo.");
  const document = onlyDigits(buyer.document);
  if (document && !isValidDocument(document)) throw new FoodFiscalError("INVALID_BUYER_DOCUMENT", "CPF ou CNPJ do destinatário inválido.");
  if (model === 55 && (!document || !buyer.name || !buyer.address)) {
    throw new FoodFiscalError("BUYER_ADDRESS_REQUIRED", "NF-e modelo 55 exige CPF/CNPJ, nome e endereço completo do destinatário.");
  }
  if (buyer.address && buyer.address.uf !== env.FOOD_FISCAL_UF && model === 65) {
    throw new FoodFiscalError("NFC_E_DESTINATION_UNSUPPORTED", "A NFC-e manual está limitada à operação da UF do estabelecimento; use o fluxo de NF-e para destinatário de outra UF.");
  }
}

function buildDestination(buyer: BuyerInput | undefined) {
  if (!buyer) return undefined;
  const document = onlyDigits(buyer.document);
  const destination: Record<string, unknown> = {
    nome: text(buyer.name || "Consumidor final", 60),
    indicadorIE: 9,
  };
  if (document.length === 11) destination.cpf = document;
  if (document.length === 14) destination.cnpj = document;
  if (buyer.email) destination.email = buyer.email;
  if (buyer.address) {
    destination.endereco = {
      logradouro: text(buyer.address.street, 60),
      numero: text(buyer.address.number, 60),
      bairro: text(buyer.address.neighborhood, 60),
      codigoMunicipio: buyer.address.ibge,
      cidade: text(buyer.address.city, 60),
      uf: buyer.address.uf,
      cep: buyer.address.cep,
    };
  }
  return destination;
}

function buildPayload(input: FoodFiscalIssueInput, product: FiscalProduct, quantity: number, unitPriceCents: number, paymentMethod: string | null, fulfillment: string) {
  const model = env.FOOD_FISCAL_MODEL;
  const presencaComprador = model === 65
    ? fulfillment === "delivery" ? 4 : 1
    : fulfillment === "delivery" ? 9 : 1;
  const isNonPresentialNfe = model === 55 && presencaComprador !== 1;
  const tipoPagamento = paymentCode(paymentMethod);
  const item: Record<string, unknown> = {
    codigo: product.id,
    descricao: text(product.name, 120),
    ncm: product.fiscalNcm,
    cfop: product.fiscalCfop,
    unidade: product.fiscalUnit,
    quantidade: quantity,
    valorUnitario: money(unitPriceCents),
    valorTotal: money(unitPriceCents * quantity),
    origem: product.fiscalOrigin,
    cstPis: product.fiscalPisCst,
    cstCofins: product.fiscalCofinsCst,
  };
  if (product.fiscalCest) item.cest = product.fiscalCest;
  if (product.fiscalGtin) item.ean = product.fiscalGtin;
  if (product.fiscalBenefitCode) item.codigoBeneficioFiscal = product.fiscalBenefitCode;
  if (env.FOOD_FISCAL_CRT === 1 || env.FOOD_FISCAL_CRT === 4) item.csosn = product.fiscalCsosn;
  else item.cst = product.fiscalCst;

  return {
    modelo: model,
    naturezaOperacao: env.FOOD_FISCAL_NATUREZA,
    tipoOperacao: 1,
    finalidade: 1,
    consumidorFinal: 1,
    presencaComprador,
    ...(isNonPresentialNfe ? { indicadorIntermediador: 0 } : {}),
    ...(buildDestination(input.buyer) ? { dest: buildDestination(input.buyer) } : {}),
    items: [item],
    pagamentos: [{ tipoPagamento, valor: money(unitPriceCents * quantity), ...(tipoPagamento === "99" ? { descricaoPagamento: "Pagamento não informado" } : {}), ...(["03", "04"].includes(tipoPagamento) ? { tipoIntegracao: 2 } : {}) }],
    transporte: { modalidadeFrete: 9 },
    infCpl: text(`Emissão manual Mosaico Food. Produto ${product.name}. Origem ${input.sourceType}:${input.sourceId}`, 5000),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function notaasFetch(pathname: string, options: RequestInit = {}) {
  if (!env.NOTAAS_API_KEY) throw new FoodFiscalError("FISCAL_PROVIDER_NOT_CONFIGURED", "Configure NOTAAS_API_KEY para habilitar a emissão manual.", 503);
  const url = `${env.NOTAAS_BASE_URL.replace(/\/+$/, "")}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": env.NOTAAS_API_KEY, ...(options.headers ?? {}) },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body: unknown = contentType.includes("json") ? await response.json().catch(() => ({})) : await response.text().catch(() => "");
  if (!response.ok) {
    const data = asRecord(body);
    const detail = typeof body === "string" ? body : String(data.message ?? data.error ?? data.errorMessage ?? "erro do provedor");
    const status = response.status >= 400 && response.status < 500 ? 422 : 502;
    throw new FoodFiscalError("FISCAL_PROVIDER_ERROR", `Notaas ${response.status}: ${detail}`.slice(0, 500), status);
  }
  return body;
}

async function pollNotaas(invoiceId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const status = asRecord(await notaasFetch(`/nfe/invoices/${invoiceId}/status`));
    const state = String(status.status ?? "");
    if (state === "issued" || state === "error" || state === "cancelled") return status;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return { status: "queued", errorMessage: "O provedor ainda está processando a nota; consulte o documento novamente." };
}

export function fiscalProductStatus(product: FiscalProduct) {
  const issues = fiscalIssues(product);
  return { ready: issues.length === 0, missing: issues };
}

async function sourceData(database: PrismaService, input: FoodFiscalIssueInput) {
  if (input.sourceSnapshot) {
    if (input.sourceSnapshot.product.id !== input.productId) throw new FoodFiscalError("PRODUCT_SOURCE_MISMATCH", "O produto selecionado não pertence à venda escolhida.");
    return {
      source: input.sourceSnapshot,
      product: input.sourceSnapshot.product,
      quantity: input.sourceSnapshot.quantity,
      unitPriceCents: input.sourceSnapshot.unitPriceCents,
      paymentMethod: input.sourceSnapshot.paymentMethod,
      paymentStatus: input.sourceSnapshot.paymentStatus,
      fulfillment: input.sourceSnapshot.fulfillment,
    };
  }
  if (input.sourceType === "counter_sale") {
    const sale = await database.foodCounterSale.findUnique({ where: { id: input.sourceId } });
    if (!sale) throw new FoodFiscalError("SOURCE_NOT_FOUND", "Venda de balcão não encontrada.", 404);
    const product = await database.foodProduct.findUnique({ where: { id: sale.productId } });
    if (!product) throw new FoodFiscalError("PRODUCT_NOT_FOUND", "Produto da venda não encontrado.", 404);
    return { source: sale, product, quantity: sale.quantity, unitPriceCents: sale.quantity ? Math.round(sale.totalCents / sale.quantity) : 0, paymentMethod: sale.paymentMethod, paymentStatus: sale.paymentStatus, fulfillment: "pickup" };
  }

  const item = await database.foodOrderItem.findUnique({ where: { id: input.sourceId }, include: { product: true, order: true } });
  if (!item || !item.product) throw new FoodFiscalError("SOURCE_NOT_FOUND", "Item do pedido ou produto não encontrado.", 404);
  return { source: item, product: item.product, quantity: item.quantity, unitPriceCents: item.unitPriceCents, paymentMethod: item.order.paymentMethod, paymentStatus: item.order.paymentStatus, fulfillment: item.order.fulfillment };
}

export async function listFoodFiscalSources(database: PrismaService) {
  const [sales, items, products] = await Promise.all([
    database.foodCounterSale.findMany({ where: { paymentStatus: "paid", isGift: false }, orderBy: { createdAt: "desc" }, take: 100 }),
    database.foodOrderItem.findMany({ where: { isGift: false, order: { paymentStatus: "paid" } }, include: { order: true, product: true }, orderBy: { order: { createdAt: "desc" } }, take: 100 }),
    database.foodProduct.findMany(),
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));
  const sourceIds = [...sales.map((sale) => sale.id), ...items.map((item) => item.id)];
  const documents = await database.foodFiscalDocument.findMany({ where: { sourceId: { in: sourceIds } } });
  const documentBySource = new Map(documents.map((document) => [document.sourceId, document]));
  return [
    ...sales.flatMap((sale) => {
      const product = productById.get(sale.productId);
      if (!product) return [];
      return [{ sourceType: "counter_sale" as const, sourceId: sale.id, productId: sale.productId, productName: sale.productName, quantity: sale.quantity, totalCents: sale.totalCents, paymentMethod: sale.paymentMethod, fulfillment: "pickup", createdAt: sale.createdAt, fiscal: fiscalProductStatus(product), product: { id: product.id, name: product.name, fiscalNcm: product.fiscalNcm, fiscalCest: product.fiscalCest, fiscalGtin: product.fiscalGtin, fiscalUnit: product.fiscalUnit, fiscalCfop: product.fiscalCfop, fiscalOrigin: product.fiscalOrigin, fiscalCst: product.fiscalCst, fiscalCsosn: product.fiscalCsosn, fiscalPisCst: product.fiscalPisCst, fiscalCofinsCst: product.fiscalCofinsCst, fiscalBenefitCode: product.fiscalBenefitCode }, document: documentBySource.get(sale.id) ?? null }];
    }),
    ...items.flatMap((item) => item.product ? [{ sourceType: "order_item" as const, sourceId: item.id, productId: item.productId!, productName: item.productName, quantity: item.quantity, totalCents: item.totalCents, paymentMethod: item.order.paymentMethod, fulfillment: item.order.fulfillment, createdAt: item.order.createdAt, fiscal: fiscalProductStatus(item.product), product: { id: item.product.id, name: item.product.name, fiscalNcm: item.product.fiscalNcm, fiscalCest: item.product.fiscalCest, fiscalGtin: item.product.fiscalGtin, fiscalUnit: item.product.fiscalUnit, fiscalCfop: item.product.fiscalCfop, fiscalOrigin: item.product.fiscalOrigin, fiscalCst: item.product.fiscalCst, fiscalCsosn: item.product.fiscalCsosn, fiscalPisCst: item.product.fiscalPisCst, fiscalCofinsCst: item.product.fiscalCofinsCst, fiscalBenefitCode: item.product.fiscalBenefitCode }, document: documentBySource.get(item.id) ?? null }] : []),
  ];
}

async function ensureFiscalProduct(database: PrismaService, product: FiscalProduct) {
  const existing = await database.foodProduct.findUnique({ where: { id: product.id } });
  if (existing) {
    return database.foodProduct.update({
      where: { id: product.id },
      data: {
        name: product.name, fiscalNcm: product.fiscalNcm, fiscalCest: product.fiscalCest, fiscalGtin: product.fiscalGtin,
        fiscalUnit: product.fiscalUnit, fiscalCfop: product.fiscalCfop, fiscalOrigin: product.fiscalOrigin, fiscalCst: product.fiscalCst,
        fiscalCsosn: product.fiscalCsosn, fiscalPisCst: product.fiscalPisCst, fiscalCofinsCst: product.fiscalCofinsCst, fiscalBenefitCode: product.fiscalBenefitCode,
      },
    });
  }
  return database.foodProduct.create({
    data: {
      id: product.id,
      name: product.name,
      normalizedName: `fiscal-${product.id}`,
      salePriceCents: 0,
      fiscalNcm: product.fiscalNcm,
      fiscalCest: product.fiscalCest,
      fiscalGtin: product.fiscalGtin,
      fiscalUnit: product.fiscalUnit,
      fiscalCfop: product.fiscalCfop,
      fiscalOrigin: product.fiscalOrigin,
      fiscalCst: product.fiscalCst,
      fiscalCsosn: product.fiscalCsosn,
      fiscalPisCst: product.fiscalPisCst,
      fiscalCofinsCst: product.fiscalCofinsCst,
      fiscalBenefitCode: product.fiscalBenefitCode,
    },
  });
}

export async function issueFoodFiscalDocument(database: PrismaService, input: FoodFiscalIssueInput) {
  if (!env.NOTAAS_API_KEY) throw new FoodFiscalError("FISCAL_PROVIDER_NOT_CONFIGURED", "Configure NOTAAS_API_KEY antes de emitir uma nota.", 503);

  const data = await sourceData(database, input);
  if (data.product.id !== input.productId) throw new FoodFiscalError("PRODUCT_SOURCE_MISMATCH", "O produto selecionado não pertence à venda escolhida.");
  if (data.paymentStatus !== "paid") throw new FoodFiscalError("SOURCE_NOT_PAID", "A venda precisa estar paga antes da emissão manual.");
  if (data.quantity <= 0 || data.unitPriceCents <= 0) throw new FoodFiscalError("INVALID_SOURCE_VALUE", "A linha selecionada não possui valor fiscal positivo.");
  const quantity = input.quantity ?? data.quantity;
  if (quantity > data.quantity) throw new FoodFiscalError("QUANTITY_EXCEEDS_SOURCE", "A quantidade fiscal não pode ser maior que a quantidade vendida.");

  const product = data.product as FiscalProduct;
  const missing = fiscalIssues(product);
  if (missing.length) throw new FoodFiscalError("FISCAL_PROFILE_INCOMPLETE", "Complete o perfil fiscal do produto antes de emitir.", 422, missing);
  validateBuyer(input.buyer, env.FOOD_FISCAL_MODEL);
  if (input.sourceSnapshot) await ensureFiscalProduct(database, product);

  const previous = await database.foodFiscalDocument.findUnique({ where: { sourceType_sourceId: { sourceType: input.sourceType, sourceId: input.sourceId } } });
  if (previous) {
    if (previous.status === "issued") return previous;
    if (previous.status !== "error") {
      throw new FoodFiscalError("FISCAL_DOCUMENT_ALREADY_STARTED", "Esta linha já possui uma emissão fiscal iniciada. Consulte o status antes de tentar novamente.");
    }
  }

  const totalCents = data.unitPriceCents * quantity;
  const now = new Date();
  const document = previous
    ? await database.foodFiscalDocument.update({
      where: { id: previous.id },
      data: {
        quantity, unitPriceCents: data.unitPriceCents, totalCents, model: env.FOOD_FISCAL_MODEL, environment: env.FOOD_FISCAL_ENVIRONMENT,
        status: "pending", providerInvoiceId: null, accessKey: null, protocol: null, number: null, series: null, qrCode: null,
        publicUrl: null, pdfUrl: null, xmlUrl: null, errorCode: null, errorMessage: null, issuedAt: null, updatedAt: now,
      },
    })
    : await database.foodFiscalDocument.create({
      data: {
        id: randomUUID(), sourceType: input.sourceType, sourceId: input.sourceId, productId: product.id, productName: product.name,
        quantity, unitPriceCents: data.unitPriceCents, totalCents, model: env.FOOD_FISCAL_MODEL, environment: env.FOOD_FISCAL_ENVIRONMENT,
        status: "pending", provider: "notaas", createdAt: now, updatedAt: now,
      },
    });

  try {
    const payload = buildPayload(input, product, quantity, data.unitPriceCents, input.paymentMethod ?? data.paymentMethod, data.fulfillment);
    const queued = asRecord(await notaasFetch("/nfe/emitir", { method: "POST", body: JSON.stringify(payload) }));
    const providerInvoiceId = String(queued.invoiceId ?? "");
    if (!providerInvoiceId) throw new FoodFiscalError("FISCAL_PROVIDER_INVALID_RESPONSE", "O provedor não retornou o identificador da nota.", 502);
    await database.foodFiscalDocument.update({ where: { id: document.id }, data: { providerInvoiceId } });
    const status = asRecord(await pollNotaas(providerInvoiceId));
    const state = String(status.status ?? "pending");
    if (state !== "issued") {
      const errorMessage = String(status.errorMessage ?? status.motivo ?? status.xMotivo ?? "A nota não foi autorizada.").slice(0, 500);
      const failed = await database.foodFiscalDocument.update({ where: { id: document.id }, data: { status: state === "queued" || state === "processing" ? "pending" : "error", errorCode: status.codigoStatus ? String(status.codigoStatus) : null, errorMessage } });
      if (state === "queued" || state === "processing") return failed;
      throw new FoodFiscalError("FISCAL_REJECTED", errorMessage, 422);
    }
    return database.foodFiscalDocument.update({
      where: { id: document.id },
      data: {
        status: "issued", accessKey: String(status.chaveAcesso ?? "") || null, protocol: String(status.protocolo ?? status.nProt ?? "") || null,
        number: typeof status.numero === "number" ? status.numero : typeof status.nNf === "number" ? status.nNf : null,
        series: typeof status.serie === "number" ? status.serie : null, qrCode: String(status.qrCode ?? "") || null,
        publicUrl: String(status.urlChave ?? "") || null, pdfUrl: String(status.pdfUrl ?? "") || null, xmlUrl: String(status.xmlUrl ?? "") || null,
        errorCode: null, errorMessage: null, issuedAt: new Date(),
      },
    });
  } catch (error) {
    const message = error instanceof FoodFiscalError ? error.message : error instanceof Error ? error.message : "Falha no provedor fiscal.";
    await database.foodFiscalDocument.update({ where: { id: document.id }, data: { status: error instanceof FoodFiscalError && error.status === 422 ? "error" : "pending", errorMessage: message.slice(0, 500) } });
    throw error;
  }
}

export async function getFoodFiscalStatus() {
  return {
    configured: Boolean(env.NOTAAS_API_KEY),
    provider: "notaas",
    model: env.FOOD_FISCAL_MODEL,
    environment: env.FOOD_FISCAL_ENVIRONMENT,
    uf: env.FOOD_FISCAL_UF,
    crt: env.FOOD_FISCAL_CRT,
    automaticIssuance: false,
  };
}

export async function listFoodFiscalDocuments(database: PrismaService) {
  return database.foodFiscalDocument.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
}
