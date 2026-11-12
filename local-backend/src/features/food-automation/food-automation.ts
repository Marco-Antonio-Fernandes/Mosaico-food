import { randomUUID } from "node:crypto";

import { z } from "zod";
import type { PrismaClient } from "@prisma/client";

import { env } from "../../lib/env";
import { WaAkgClient } from "../../lib/wa-akg";
import { consumePreparation, preparationCapacity, recipeOf, recipeProgressOf } from "../../lib/food-stock";
import { salePaymentSchema } from "../../lib/financial-movement";
import { audioFallback } from "../../lib/speech";

const stateSchema = z.enum([
  "idle",
  "awaiting_variant",
  "awaiting_fry_confirmation",
  "awaiting_fulfillment",
  "awaiting_stock_confirmation",
  "awaiting_payment",
  "awaiting_cash_change",
  "awaiting_order_confirmation",
  "awaiting_address",
  "completed",
]);

const cartItemSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  onDemand: z.boolean().default(false),
  variantId: z.string().min(1).optional(),
  variantName: z.string().min(1).optional(),
  fryNow: z.boolean().default(false),
  fryAsked: z.boolean().default(false),
});

type ProductVariant = {
  id: string;
  name: string;
  aliases: string[];
  priceDeltaCents: number;
};

type AutomationState = z.infer<typeof stateSchema>;
type CartItem = z.infer<typeof cartItemSchema>;
type Product = {
  id: string;
  name: string;
  aliases: string[];
  salePriceCents: number;
  stockQuantity: number;
  preparationCapacity: number;
  allowOnDemand: boolean;
  fryToOrder: boolean;
  variants: ProductVariant[];
  active: boolean;
  productionMode: string;
  category: string;
  customizationJson: string;
  productName?: string;
  flavor?: string | null;
};
type ConversationRecord = {
  id: string;
  remoteJid: string;
  customerId: string | null;
  customerName: string | null;
  state: AutomationState;
  greetingSent: boolean;
  automationPaused: boolean;
  pendingItemsJson: string;
  pendingFulfillment: string | null;
  pendingAddress: string | null;
  pendingPaymentMethod: string | null;
  pendingCashReceivedCents: number | null;
  lastOrderId: string | null;
  lastOrderMessageId: string | null;
};
type IncomingMessage = {
  id: string;
  body: string | null;
  createdAt: Date;
  mediaType?: string | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationAddress?: string | null;
};

type AutomationOutcome = {
  reply: string | null;
  orderId: string | null;
  needsHuman?: boolean;
};

type RunOptions = {
  conversationId?: string;
  sessionId?: string;
  force?: boolean;
  latestOnly?: boolean;
  sendText?: (remoteJid: string, text: string) => Promise<{ providerMessageId?: string | null }>;
};

export type AutomationReply = {
  conversationId: string;
  remoteJid: string;
  body: string;
};

export type AutomationRunResult = {
  enabled: boolean;
  conversations: number;
  processedMessages: number;
  repliesSent: number;
  ordersCreated: number;
  replies: AutomationReply[];
  skipped: number;
  errors: string[];
  lastRunAt: string;
};

type AutomationStatus = {
  enabled: boolean;
  configured: boolean;
  webhookConfigured: boolean;
  sessionId: string | null;
  baseUrl: string;
  lastRunAt: string | null;
  lastError: string | null;
};

const confirmationWords = new Set([
  "sim",
  "s",
  "ss",
  "simm",
  "ok",
  "okay",
  "ta bom",
  "uhum",
  "aham",
  "yes",
  "y",
  "confirmo",
  "confirmado",
  "confirmar",
  "fechado",
  "fechou",
  "pode",
  "pode ser",
  "quero",
  "manda",
  "manda ver",
  "com certeza",
  "blz",
  "beleza",
  "perfeito",
  "bora",
  "isso",
  "frita",
  "fritar",
  "na hora",
]);

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\bq\b/g, "que")
    .replace(/\s+/g, " ")
    .trim();

const rejectionWords = new Set([
  "nao",
  "n",
  "nao quero",
  "cancelar",
  "cancela",
  "cancele",
  "desisti",
  "desistir",
  "deixa pra la",
  "negativo",
]);

const isConfirmation = (value: string) => {
  const normalized = normalizeText(value).replace(/[.!?,;:]+/g, " ").replace(/\s+/g, " ").trim();
  return confirmationWords.has(normalized) || /^(pode confirmar|pode fechar|esta certo|isso mesmo|tudo certo)$/.test(normalized);
};

const isRejection = (value: string) => {
  const normalized = normalizeText(value).replace(/[.!?,;:]+/g, " ").replace(/\s+/g, " ").trim();
  return rejectionWords.has(normalized) || /^(nao|n|cancelar|cancela|cancele|desisti|desistir|negativo)\b/.test(normalized);
};

const greetingForNow = () => {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
};

const greetingIntro = () => `${greetingForNow()}! Aqui é o ${env.FOOD_AUTOMATION_BUSINESS_NAME}. 🤖 Você será atendido por um robô.\nSe preferir falar com um funcionário, é só responder "quero falar com um atendente".`;

const requestsDelivery = (value: string) =>
  /\b(entrega|delivery|entregar|trazer|manda|mandar|leva|levar)\b/i.test(value);

const requestsPickup = (value: string) =>
  /\b(retirada|retirar|buscar|busco|balcao|balcão)\b/i.test(value) || /\b(aqui(?: mesmo| na loja)?|na loja)\b/i.test(value);

const requestsFresh = (value: string) =>
  /\b(frita|fritar|fritura|preparar|preparo|na hora|agora|quentinha|quente)\b/i.test(value);

const asksForVariant = (value: string) =>
  /\b(qual|quais|sabor|sabores|recheio|recheios|opcao|opcoes|opção|opções)\b/i.test(value);

const fulfillmentQuestion = () => "Perfeito! Você prefere receber por entrega ou retirar na loja? 😊";
const paymentQuestion = () => "Qual será a forma de pagamento? Pode ser Pix, dinheiro, cartão de crédito, cartão de débito, vale-alimentação ou crediário. 😊";
const paymentLabels: Record<string, string> = {
  pix: "Pix",
  cash: "dinheiro",
  card_credit: "cartão de crédito",
  card_debit: "cartão de débito",
  meal_voucher: "vale-alimentação",
  crediario: "crediário",
};

function cashReceivedFromText(value: string): number | null {
  const normalized = normalizeText(value);
  if (/(sem troco|nao precisa de troco|valor exato|certinho|exato)/.test(normalized)) return 0;
  const match = normalized.match(/(?:troco\s*(?:para|de)?|entrego|entregarei|dou|darei|pago(?:\s+com)?|pagar(?:\s+com)?)\s*(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
  if (!match) return null;
  const valueInReais = Number(match[1].replace(",", "."));
  return Number.isFinite(valueInReais) && valueInReais >= 0 ? Math.round(valueInReais * 100) : null;
}

function paymentMethodFromText(value: string): string | "card" | null {
  const text = normalizeText(value);
  if (/\b(crediario|fiado)\b/.test(text)) return "crediario";
  if (/\b(pix)\b/.test(text)) return "pix";
  if (/\b(dinheiro|especie|troco)\b/.test(text)) return "cash";
  if (/\b(credito|cartao de credito)\b/.test(text)) return "card_credit";
  if (/\b(debito|cartao de debito)\b/.test(text)) return "card_debit";
  if (/\b(vale alimentacao|vale refeicao|vr|va)\b/.test(text)) return "meal_voucher";
  if (/\b(cartao|maquininha)\b/.test(text)) return "card";
  return null;
}

function menuReply(body: string, products: Product[]) {
  const text = normalizeText(body);
  const asksWhatIsAvailable = /\b(?:(?:o\s+)?que(?:\s+que)?|oq)\s+(?:(?:voces?|vc|vcs)\s+)?(?:tem|ha|esta\s+pronto|pode\s+preparar)\b/.test(text);
  const asksForList = /\b(cardapio|carpadio|cardpio|carpaio|menu|quais\s+(?:sao\s+as\s+)?(?:salgados|lanches|produtos|opcoes)|tem\s+o\s+que|(?:voces?|vc|vcs)\s+tem\s+o\s*q(?:ue)?|o\s+que\s+da\s+(?:pra|para)\s+preparar)\b/.test(text);
  if (!asksWhatIsAvailable && !asksForList) return null;

  const available = products.filter(product => product.active && (product.stockQuantity > 0 || product.preparationCapacity > 0));
  const line = (product: Product, quantity: number) => {
    const prices = product.variants.length
      ? product.variants.map(variant => `${variant.name}: ${money(product.salePriceCents + variant.priceDeltaCents)}`).join(" · ")
      : money(product.salePriceCents);
    return `• ${product.name}${product.variants.length === 1 ? ` · ${product.variants[0].name}` : ""} — ${prices} · disponível`;
  };
  return `Claro! 😋 Olha o que temos agora:\n\n${available.length ? available.map(product => line(product, product.stockQuantity || product.preparationCapacity)).join("\n") : "No momento, não temos itens disponíveis."}\n\nÉ só me mandar a quantidade e o item. Se tiver sabor, pode mandar junto. 😊`;
}

const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const itemLabel = (item: CartItem) =>
  `${item.quantity}x ${item.name}${item.variantName ? ` de ${item.variantName}` : ""} (${money(item.unitPriceCents)} cada)`;

const cartTotal = (items: CartItem[]) =>
  items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);

function parseCart(value: string): CartItem[] {
  try {
    const parsed: unknown = JSON.parse(value);
    const result = z.array(cartItemSchema).safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

function parseAliases(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function parseVariants(value: string): ProductVariant[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
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
    });
  } catch {
    return [];
  }
}

function customizationReply(product: Product) {
  try {
    const customization = z.object({ label: z.string(), unit: z.string(), baseQuantity: z.number().int().nonnegative(), additionalUnitPriceCents: z.number().int().nonnegative(), allowRemoval: z.boolean() }).safeParse(JSON.parse(product.customizationJson));
    if (!customization.success) return "";
    const option = customization.data;
    return ` Inclui ${option.baseQuantity} ${option.unit} de ${option.label}; cada ${option.unit} extra custa ${money(option.additionalUnitPriceCents)}.${option.allowRemoval ? " Você pode pedir remoção; a equipe confere o ajuste." : " Não há remoção cadastrada para esta opção."}`;
  } catch { return ""; }
}

function editDistance(left: string, right: string) {
  const matrix = Array.from({ length: left.length + 1 }, (_, row) => {
    const values = Array.from({ length: right.length + 1 }, (_, column) => 0);
    values[0] = row;
    return values;
  });
  for (let column = 0; column <= right.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitution,
      );
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
}

type TextToken = { value: string; start: number; end: number };

function textTokens(value: string): TextToken[] {
  const tokens: TextToken[] = [];
  const expression = /[\p{L}\p{N}]+/gu;
  for (const match of value.matchAll(expression)) {
    const start = match.index ?? 0;
    tokens.push({ value: match[0], start, end: start + match[0].length });
  }
  return tokens;
}

function allowedTokenDistance(value: string) {
  if (value.length <= 1) return 0;
  if (value.length <= 5) return 2;
  return 3;
}

function findAliasMatch(text: string, alias: string) {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return null;

  const exactStart = text.indexOf(normalizedAlias);
  if (exactStart >= 0 && (exactStart === 0 || text[exactStart - 1] === " ")
    && (exactStart + normalizedAlias.length === text.length || text[exactStart + normalizedAlias.length] === " ")) {
    return { start: exactStart, end: exactStart + normalizedAlias.length, score: 0 };
  }

  const aliasTokens = textTokens(normalizedAlias);
  const messageTokens = textTokens(text);
  if (!aliasTokens.length || messageTokens.length < aliasTokens.length) return null;

  let best: { start: number; end: number; score: number } | null = null;
  for (let index = 0; index <= messageTokens.length - aliasTokens.length; index += 1) {
    let score = 0;
    let valid = true;
    for (let offset = 0; offset < aliasTokens.length; offset += 1) {
      const expected = aliasTokens[offset].value;
      const received = messageTokens[index + offset].value;
      const distance = editDistance(expected, received);
      if (distance > allowedTokenDistance(expected)) {
        valid = false;
        break;
      }
      score += distance / Math.max(expected.length, 1);
    }
    if (!valid) continue;
    const candidate = {
      start: messageTokens[index].start,
      end: messageTokens[index + aliasTokens.length - 1].end,
      score: score + 0.01,
    };
    if (!best || candidate.score < best.score) best = candidate;
  }
  return best;
}

function extractAddress(value: string): string | null {
  const text = value.trim().replace(/\s+/g, " ");
  const explicit = text.match(/(?:endereco|endereço)\s*[:\-]?\s*(.+)$/i)?.[1];
  if (explicit && explicit.length >= 8) return explicit.slice(0, 500);

  const street = text.match(
    /\b(?:rua|r\.?|avenida|av\.?|travessa|tv\.?|alameda|rodovia|estrada)\s+[^,;]+(?:,\s*\d+|\s+\d+)?.*/i,
  )?.[0];
  if (street && /\d/.test(street)) return street.slice(0, 500);

  const cep = text.match(/\b(?:cep\s*)?\d{5}-?\d{3}\b/i)?.[0];
  if (cep && text.length >= 12) return text.slice(0, 500);
  return null;
}

function quantityBefore(text: string, start: number) {
  const before = text.slice(0, start);
  const quantityWords: Record<string, number> = {
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    quatro: 4,
    cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20,
  };
  const match = before.match(
    new RegExp(
      `(?:^|[,;+]|\\b(?:quero|manda|mandar|separa|separe|separar|reserva|reserve|reservar|anota|anote|faz|faca|fazer|tem|me ve|adiciona|e|mais|com)\\b)(?:\\s+(?:pra|para)\\s+mim)?\\s*(\\d+|${Object.keys(quantityWords).join("|")})\\s*(?:x|un(?:idade)?s?)?\\s*$`,
      "i",
    ),
  );
  if (!match) return 1;
  const quantity = quantityWords[match[1].toLocaleLowerCase("pt-BR")] ?? Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
}

function quantityMentioned(value: string, fallback: number) {
  const normalized = normalizeText(value);
  const quantityWords: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
  const match = normalized.match(/\b(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/);
  if (!match) return fallback;
  const quantity = quantityWords[match[1]] ?? Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : fallback;
}

function refersToPendingItems(value: string) {
  const normalized = normalizeText(value);
  return /\b(esse|esses|essa|essas|desse|desses|dessa|dessas|isso|mesmo|mesmos|aqui)\b/.test(normalized);
}

function identifyItems(text: string, products: Product[]): CartItem[] {
  const normalized = normalizeText(text);
  const matches = products
    .filter((product) => product.active)
    .map((product) => {
      const productName = normalizeText(product.name);
      const aliases = [
        productName,
        ...product.aliases.map(normalizeText),
        ...(productName.split(" ")[0] && productName.split(" ")[0].length >= 4
          ? [productName.split(" ")[0]]
          : []),
        ...(productName.includes("batata") && productName.includes("frita")
          ? ["fritas"]
          : []),
      ];
      const match = [...new Set(aliases)]
        .map((name) => ({ name, result: findAliasMatch(normalized, name) }))
        .filter((item): item is { name: string; result: { start: number; end: number; score: number } } => Boolean(item.result))
        .sort((left, right) => left.result.score - right.result.score || right.name.length - left.name.length)[0];
      return {
        product,
        name: match?.name ?? productName,
        start: match?.result.start ?? -1,
        end: match?.result.end ?? -1,
      };
    })
    .filter((item) => item.start >= 0)
    .sort((left, right) => right.name.length - left.name.length);

  const usedRanges: Array<[number, number]> = [];
  const items: Array<{ item: CartItem; start: number }> = [];
  for (const match of matches) {
    const end = match.end;
    // A shared family/alias must never silently select one flavor from stock.
    if (matches.some(other => other.product.id !== match.product.id && other.start === match.start
      && other.end === match.end && other.name.length === match.name.length)) continue;
    if (usedRanges.some(([start, finish]) => match.start < finish && end > start)) continue;
    usedRanges.push([match.start, end]);
    items.push({
      start: match.start,
      item: {
        productId: match.product.id,
        name: match.product.name,
        quantity: quantityBefore(normalized, match.start),
        unitPriceCents: match.product.salePriceCents,
        onDemand: false,
        fryNow: requestsFresh(text) && match.product.allowOnDemand,
        fryAsked: requestsFresh(text) && match.product.allowOnDemand,
      },
    });
  }

  for (const { item } of items) {
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product?.variants.length) continue;
    const variantMatches = product.variants
      .map((variant) => {
        const aliases = [variant.name, ...variant.aliases];
        const result = aliases
          .map((alias) => ({ alias, match: findAliasMatch(normalized, alias) }))
          .filter((candidate): candidate is { alias: string; match: { start: number; end: number; score: number } } => Boolean(candidate.match))
          .sort((left, right) => left.match.score - right.match.score || right.alias.length - left.alias.length)[0];
        return result ? { variant, match: result.match } : null;
      })
      .filter((candidate): candidate is { variant: ProductVariant; match: { start: number; end: number; score: number } } => Boolean(candidate))
      .sort((left, right) => left.match.score - right.match.score || right.variant.name.length - left.variant.name.length);
    // Com uma única opção, o cadastro já é suficiente para completar o item;
    // com várias opções, só selecionamos quando o cliente mencionar uma delas.
    const selectedVariant = variantMatches[0]?.variant ?? (product.variants.length === 1 ? product.variants[0] : undefined);
    if (selectedVariant) {
      item.variantId = selectedVariant.id;
      item.variantName = selectedVariant.name;
      item.unitPriceCents += selectedVariant.priceDeltaCents;
    }
  }
  return items.sort((left, right) => left.start - right.start).map(({ item }) => item);
}

function findSelectedVariant(text: string, product: Product): ProductVariant | null {
  const normalized = normalizeText(text);
  return product.variants
    .flatMap((variant) => [variant.name, ...variant.aliases].map((alias) => ({ variant, result: findAliasMatch(normalized, alias) })))
    .filter((candidate): candidate is { variant: ProductVariant; result: { start: number; end: number; score: number } } => Boolean(candidate.result))
    .sort((left, right) => left.result.score - right.result.score || right.variant.name.length - left.variant.name.length)[0]?.variant ?? null;
}

function cashChangeQuestion(totalCents: number) {
  return `O total ficou em ${money(totalCents)}. Vai pagar em dinheiro. Precisa de troco? Se sim, responda “troco para 50”, por exemplo. Se for o valor exato, diga “sem troco”. 😊`;
}

function summary(items: CartItem[], fulfillment: string | null, address: string | null, paymentMethod: string | null, cashReceivedCents: number | null = null) {
  const lines = items.map(itemLabel).join(", ");
  const destination = fulfillment === "delivery"
    ? `Entrega${address ? ` em ${address}` : ""}`
    : "Retirada na loja";
  const payment = paymentMethod ? ` Pagamento: ${paymentLabels[paymentMethod] ?? paymentMethod}.` : "";
  const totalCents = cartTotal(items);
  const cash = paymentMethod === "cash" && cashReceivedCents !== null
    ? cashReceivedCents > totalCents
      ? ` Dinheiro entregue: ${money(cashReceivedCents)}. Troco: ${money(cashReceivedCents - totalCents)}.`
      : " Pagamento em dinheiro no valor exato, sem troco."
    : "";
  return `Perfeito! Separei ${lines}. ${destination}. Os produtos somam ${money(totalCents)}.${payment}${cash}${fulfillment === "delivery" ? " A loja confirma a taxa e o prazo de entrega." : ""} Se estiver tudo certinho, responda “confirmo” que eu registro o pedido. 😊`;
}

function variantQuestion(product: Product) {
  const options = product.variants.map((variant) => variant.name).join(" ou ");
  return `Qual sabor você prefere para o ${product.name.toLocaleLowerCase("pt-BR")}? Temos: ${options}. 😊`;
}

const getOrCreateConfig = async (database: PrismaClient) =>
  database.foodAutomationConfig.upsert({
    where: { id: "default" },
    create: { id: "default", enabled: true },
    update: {},
  });

const toConversationRecord = (record: {
  id: string;
  remoteJid: string;
  customerId: string | null;
  customer?: { name: string } | null;
  state: string;
  greetingSent: boolean;
  automationPaused: boolean;
  pendingItemsJson: string;
  pendingFulfillment: string | null;
  pendingAddress: string | null;
  pendingPaymentMethod: string | null;
  pendingCashReceivedCents: number | null;
  lastOrderId: string | null;
  lastOrderMessageId: string | null;
}): ConversationRecord => ({
  ...record,
  customerName: record.customer?.name ?? null,
  state: stateSchema.catch("idle").parse(record.state),
});

async function saveConversationState(
  database: PrismaClient,
  conversationId: string,
  input: {
    state: AutomationState;
    items: CartItem[];
    fulfillment: string | null;
    address: string | null;
    paymentMethod?: string | null;
    cashReceivedCents?: number | null;
    orderId: string | null;
    lastOrderMessageId: string | null;
  },
) {
  return database.foodConversation.update({
    where: { id: conversationId },
    data: {
      state: input.state,
      pendingItemsJson: JSON.stringify(input.items),
      pendingFulfillment: input.fulfillment,
      pendingAddress: input.address,
      ...(input.paymentMethod !== undefined ? { pendingPaymentMethod: input.paymentMethod } : {}),
      ...(input.cashReceivedCents !== undefined ? { pendingCashReceivedCents: input.cashReceivedCents } : {}),
      lastOrderId: input.orderId,
      lastOrderMessageId: input.lastOrderMessageId,
    },
  });
}

async function createOrder(
  database: PrismaClient,
  conversation: ConversationRecord,
  items: CartItem[],
  fulfillment: string,
  address: string | null,
  paymentMethod: string | null,
  cashReceivedCents: number | null,
  confirmationMessageId: string,
) {
  const totalCents = cartTotal(items);
  if (paymentMethod === "cash" && (cashReceivedCents === null || cashReceivedCents < totalCents)) {
    throw new Error("CASH_RECEIVED_BELOW_TOTAL");
  }
  return database.$transaction(async (transaction) => {
    const previous = await transaction.foodConversation.findUniqueOrThrow({ where: { id: conversation.id } });
    if (previous.lastOrderMessageId === confirmationMessageId && previous.lastOrderId) {
      return transaction.foodOrder.findUniqueOrThrow({ where: { id: previous.lastOrderId } });
    }
    const orderItems: Array<{
      productId: string;
      productName: string;
      variantName: string | null;
      quantity: number;
      unitPriceCents: number;
      totalCents: number;
      fryNow: boolean;
      stockReservationJson: string | null;
    }> = [];
    for (const item of items) {
      const product = await transaction.foodProduct.findUnique({ where: { id: item.productId } });
      const variant = product ? parseVariants(product.variantsJson).find(option => option.id === item.variantId) : undefined;
      if (!product?.active || product.productionMode === "ingredient" || (item.variantId && !variant)
        || item.unitPriceCents !== product.salePriceCents + (variant?.priceDeltaCents ?? 0)) {
        throw new Error("O catálogo mudou. Confira o pedido novamente.");
      }
      const readyQuantity = Math.min(product.stockQuantity, item.quantity);
      const prepareQuantity = item.quantity - readyQuantity;
      let preparationConsumption: Awaited<ReturnType<typeof consumePreparation>> = { unpreparedQuantity: 0, ingredientDeltas: [], recipeProgressBeforeJson: null, recipeProgressAfterJson: null };
      if (readyQuantity > 0) {
        const updated = await transaction.foodProduct.updateMany({
          where: { id: item.productId, active: true, stockQuantity: { gte: readyQuantity } },
          data: { stockQuantity: { decrement: readyQuantity } },
        });
        if (updated.count !== 1) throw new Error(`O estoque pronto de ${item.name} mudou enquanto o pedido era confirmado.`);
      }
      if (prepareQuantity > 0) preparationConsumption = await consumePreparation(transaction, item.productId, prepareQuantity);
      const common = {
        productId: item.productId,
        productName: item.name,
        variantName: item.variantName ?? null,
        unitPriceCents: item.unitPriceCents,
      };
      if (readyQuantity > 0) orderItems.push({ ...common, quantity: readyQuantity, totalCents: readyQuantity * item.unitPriceCents, fryNow: false, stockReservationJson: JSON.stringify({ readyQuantity }) });
      if (prepareQuantity > 0) orderItems.push({ ...common, quantity: prepareQuantity, totalCents: prepareQuantity * item.unitPriceCents, fryNow: true, stockReservationJson: JSON.stringify(preparationConsumption) });
    }

    if (conversation.customerId && address) {
      await transaction.foodCustomer.update({
        where: { id: conversation.customerId },
        data: { address },
      });
    }

    const order = await transaction.foodOrder.create({
      data: {
        customerId: conversation.customerId,
        conversationId: conversation.id,
        customerName: conversation.customerName,
        status: "confirmed",
        fulfillment,
        deliveryAddress: address,
        totalCents,
        cashReceivedCents: paymentMethod === "cash" ? cashReceivedCents : null,
        cashChangeCents: paymentMethod === "cash" && cashReceivedCents !== null ? Math.max(0, cashReceivedCents - totalCents) : null,
        source: "whatsapp",
        paymentMethod,
        stockReserved: true,
        items: {
          create: orderItems.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            variantName: item.variantName,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            totalCents: item.totalCents,
            fryNow: item.fryNow,
          })),
        },
      },
    });

    await transaction.foodConversation.update({
      where: { id: conversation.id },
      data: {
        state: "completed",
        pendingItemsJson: JSON.stringify(items),
        pendingFulfillment: fulfillment,
        pendingAddress: address,
        pendingPaymentMethod: paymentMethod,
        lastOrderId: order.id,
        lastOrderMessageId: confirmationMessageId,
      },
    });

    return order;
  });
}

async function processIncomingMessage(
  database: PrismaClient,
  conversation: ConversationRecord,
  message: IncomingMessage,
  products: Product[],
): Promise<AutomationOutcome> {
  const body = message.body?.trim() ?? "";
  const currentItems = parseCart(conversation.pendingItemsJson);
  const currentAddress = conversation.pendingAddress;
  const currentFulfillment = conversation.pendingFulfillment;
  const currentPaymentMethod = conversation.pendingPaymentMethod;
  const currentCashReceivedCents = conversation.pendingCashReceivedCents;
  const firstReplyPrefix = conversation.greetingSent ? "" : `${greetingIntro()} `;
  const locationAddress = message.locationAddress
    || (message.locationLatitude !== null && message.locationLatitude !== undefined && message.locationLongitude !== null && message.locationLongitude !== undefined
      ? `Localização GPS: https://www.google.com/maps?q=${message.locationLatitude},${message.locationLongitude}`
      : null);
  const messageAddress = extractAddress(body) ?? locationAddress ?? currentAddress;
  const explicitItems = identifyItems(body, products);
  const refersToCurrentItems = !explicitItems.length && currentItems.length > 0 && refersToPendingItems(body);
  const identifiedItems = explicitItems.length
    ? explicitItems
    : refersToCurrentItems
      ? currentItems.map(item => ({ ...item, quantity: quantityMentioned(body, item.quantity) }))
      : [];
  const pendingItems = refersToCurrentItems ? identifiedItems : currentItems;
  const confirmation = isConfirmation(body);
  const rejection = isRejection(body);
  const paymentInput = paymentMethodFromText(body);
  const parsedPayment = paymentInput && paymentInput !== "card" ? salePaymentSchema.safeParse(paymentInput) : null;
  const requestedPaymentMethod = parsedPayment?.success ? parsedPayment.data : currentPaymentMethod;
  const requestedFulfillment = requestsPickup(body)
    ? "pickup"
    : requestsDelivery(body)
      ? "delivery"
    : currentFulfillment;
  const cashInput = cashReceivedFromText(body);
  const cashReceivedCents = cashInput ?? currentCashReceivedCents;

  const humanWaitingReply = "Aguarde um momento, por favor. Um atendente vai responder pelo WhatsApp.";
  if (!body && !locationAddress) {
    await database.foodConversation.update({ where: { id: conversation.id }, data: { automationPaused: true } });
    return { reply: humanWaitingReply, orderId: null, needsHuman: true };
  }
  const text = normalizeText(body);
  const conversationEnded = /^(?:bl|blz|obg|obrigad[oa]|obgdo|valeu|vlw|tmj|tamo junto|show|obrigado mesmo|obrigada mesmo)$/.test(text);
  if (conversationEnded) {
    await database.foodConversation.update({ where: { id: conversation.id }, data: { state: "completed", automationPaused: true } });
    return { reply: null, orderId: null };
  }
  const handoff = async (reply: string) => {
    await database.foodConversation.update({ where: { id: conversation.id }, data: { automationPaused: true } });
    return { reply: `${reply}\n\n${humanWaitingReply}`, orderId: null, needsHuman: true };
  };
  if (/\b(atendente|humano|pessoa|funcionario|funcionaria|operador|equipe|robo|bot|reclamacao|alergia|alergico|intolerancia|sem gluten|sem lactose)\b/.test(text)) {
    return handoff("Vou deixar a conversa com a equipe para te ajudar com cuidado. Seu pedido e suas mensagens ficam aqui para ela conferir.");
  }
  if (/\b(sem|tirar|extra|adicional|acrescentar|trocar)\b/.test(text)
    && (identifiedItems.length > 0 || currentItems.length > 0)) {
    return handoff("Entendi que você quer ajustar o pedido. Vou pedir à equipe para conferir os ingredientes, as opções e o valor antes de confirmar essa alteração.");
  }
  if (conversation.state === "completed" && /\b(cancel|alter|trocar|mudar)/.test(text)) {
    return handoff("Vou deixar a equipe conferir sua alteração ou cancelamento. O pedido continua registrado até ela confirmar a mudança.");
  }
  if (/\b(meu pedido|pedido chegou|saiu para entrega|ja esta pronto|demora|andamento)\b/.test(text) && !/\b(quero|pedir|confirmar)\b/.test(text)) {
    const order = await database.foodOrder.findFirst({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" } });
    const labels: Record<string, string> = { confirmed: "confirmado", preparing: "confirmado", ready: "confirmado", out_for_delivery: "a caminho", delivered: "entregue", cancelled: "cancelado" };
    return { reply: order ? `Seu último pedido está ${labels[order.status] ?? "sendo conferido pela equipe"}. Os produtos somam ${money(order.totalCents)}. ${order.status === "out_for_delivery" ? "Ele está a caminho." : "Se precisar de uma previsão de horário, posso chamar a equipe."}` : "Ainda não encontrei um pedido registrado nesta conversa. Quer montar um comigo?", orderId: null };
  }
  if (/\b(paguei|comprovante)\b/.test(text) && !paymentInput) {
    return handoff("A equipe pode combinar a forma de pagamento e conferir valores, troco ou comprovante com você. Vou deixar sua mensagem com ela; o pagamento só é confirmado depois dessa conferência.");
  }
  if (/\b(horario|abre|fecha|taxa|frete|prazo|quanto tempo|agendar|amanha|encomenda|desconto|promocao)\b/.test(text)) {
    return handoff("Vou pedir à loja para confirmar isso com você, incluindo disponibilidade, horário e valores. Assim você combina tudo antes de fechar o pedido.");
  }
  if (/\b(personalizar|personalizacao|opcoes de adicional|o que vem|vem com|inclui)\b/.test(text) && identifiedItems.length) {
    const selected = products.filter(product => identifiedItems.some(item => item.productId === product.id));
    return { reply: selected.map(product => `${product.name}:${customizationReply(product) || " não tenho a composição completa cadastrada. Peça um atendente para conferir os ingredientes com você."}`).join("\n"), orderId: null };
  }
  if (/\b(recomenda|sugere|sugestao|indica|mais barato)\b/.test(text)) {
    const available = products.filter(product => product.active && (product.stockQuantity > 0 || product.allowOnDemand && product.preparationCapacity > 0));
    const suggestions = text.includes("barato") ? [...available].sort((a, b) => a.salePriceCents - b.salePriceCents) : available;
    return { reply: suggestions.length ? `Algumas opções disponíveis agora:\n${suggestions.slice(0, 4).map(product => `• ${product.name}: ${money(product.salePriceCents)}${product.variants.length ? " (o valor pode variar com o sabor)" : ""}`).join("\n")}\nAlguma te agradou? Me diga o nome, o sabor e a quantidade.` : "No momento não encontrei itens disponíveis. Posso chamar a equipe para conferir uma alternativa com você.", orderId: null };
  }
  if (/\b(preco|quanto custa|qual valor|quanto e|tem|sabores|recheios|disponivel)\b/.test(text) && identifiedItems.length) {
    const selected = products.filter(product => identifiedItems.some(item => item.productId === product.id));
    return { reply: `Olha só:\n${selected.map(product => `• ${product.name}: ${product.variants.length ? product.variants.map(variant => `${variant.name} por ${money(product.salePriceCents + variant.priceDeltaCents)}`).join("; ") : money(product.salePriceCents)}. ${product.stockQuantity > 0 || product.preparationCapacity > 0 ? "Está disponível." : "Está indisponível agora."}`).join("\n")}\nQuer pedir? Me diga o produto, o sabor e a quantidade.`, orderId: null };
  }
  if (/^(oi|ola|bom dia|boa tarde|boa noite|tudo bem)$/.test(text)) {
    const greetings = ["Como posso te ajudar hoje? Posso mostrar o cardápio ou anotar seu pedido.", "Que bom falar com você! Quer ver o que temos ou já sabe o que vai pedir?"];
    return { reply: `${firstReplyPrefix}${greetings[message.id.charCodeAt(0) % greetings.length]}`, orderId: null };
  }
  const menu = menuReply(body, products);
  if (menu) return { reply: `${firstReplyPrefix}${menu}`, orderId: null };
  if (!identifiedItems.length && !confirmation && !rejection) {
    const options = products.filter(product => product.active && (
      (product.category && text.includes(normalizeText(product.category)))
      || (normalizeText(product.name).split(" ")[0].length >= 4 && text.split(" ").includes(normalizeText(product.name).split(" ")[0]))));
    if (options.length) return { reply: `Temos estas opções no catálogo:\n${options.slice(0, 15).map(product => `• ${product.name} — ${money(product.salePriceCents)}${product.stockQuantity > 0 || product.preparationCapacity > 0 ? " · disponível" : " · indisponível agora"}`).join("\n")}\nQual delas você quer e em qual quantidade?`, orderId: null };
  }

  if (rejection && conversation.state !== "awaiting_fry_confirmation" && conversation.state !== "completed") {
    await saveConversationState(database, conversation.id, {
      state: "idle",
      items: [],
      fulfillment: null,
      address: null,
      paymentMethod: null,
      cashReceivedCents: null,
      orderId: null,
      lastOrderMessageId: null,
    });
    return { reply: "Tudo bem, cancelei por aqui. Quando quiser, é só me chamar que a gente monta outro pedido.", orderId: null };
  }

  const confirmOrder = async (items: CartItem[], fulfillment: string, address: string | null, paymentMethod: string, receivedCash: number | null) => {
    const order = await createOrder(database, conversation, items, fulfillment, address, paymentMethod, receivedCash, message.id).catch(() => null);
    if (!order) return { reply: "Não consegui confirmar seu pedido. O estoque pode ter mudado ou houve uma falha ao registrar. Nenhuma confirmação foi concluída; vamos conferir os itens antes de tentar novamente.", orderId: null };
    await saveConversationState(database, conversation.id, {
      state: "completed",
      items,
      fulfillment,
      address,
      paymentMethod,
      cashReceivedCents: paymentMethod === "cash" ? receivedCash : null,
      orderId: order.id,
      lastOrderMessageId: message.id,
    });
    return {
      reply: `Fechou! Seu pedido foi registrado 😊 Produtos: ${money(order.totalCents)}. Pagamento: ${paymentLabels[paymentMethod] ?? paymentMethod}.${paymentMethod === "cash" && receivedCash !== null && receivedCash > order.totalCents ? ` Troco: ${money(receivedCash - order.totalCents)}.` : ""}${fulfillment === "delivery" ? ` Endereço: ${address}. A loja confirma a taxa e o prazo de entrega.` : " A loja vai avisar quando estiver pronto para retirada."}`,
      orderId: order.id,
    };
  };

  const continueWithItems = async (items: CartItem[]) => {
    // O atendimento nunca aceita a escolha "pronto ou preparar". A origem é
    // decidida na confirmação: prontas primeiro, preparo somente no restante.
    items = items.map(item => ({ ...item, onDemand: false, fryNow: false, fryAsked: true }));
    // Allocate the same ingredient balance only once across this cart.
    const stockCatalog = await database.foodProduct.findMany({ where: { active: true } });
    const simulated = stockCatalog.map(product => ({ ...product }));
    for (const item of items) {
      const product = simulated.find(candidate => candidate.id === item.productId);
      if (!product) return { reply: `${item.name} não está disponível agora. Vamos escolher outro item?`, orderId: null };
      const readyQuantity = Math.min(product.stockQuantity, item.quantity);
      product.stockQuantity -= readyQuantity;
      const prepareQuantity = item.quantity - readyQuantity;
      if (prepareQuantity > 0) {
        if (preparationCapacity(product, simulated) < prepareQuantity) return { reply: `Não temos quantidade suficiente de ${item.name} para este pedido.`, orderId: null };
        const fromUnprepared = Math.min(product.unpreparedQuantity, prepareQuantity);
        product.unpreparedQuantity -= fromUnprepared;
        const recipeQuantity = prepareQuantity - fromUnprepared;
        for (const row of recipeOf(product)) {
          const ingredient = simulated.find(candidate => candidate.id === row.ingredientId);
          if (ingredient) {
            const progress = recipeProgressOf(product);
            const used = (progress[row.ingredientId] ?? 0) + recipeQuantity;
            ingredient.stockQuantity -= Math.floor(used / row.quantity);
            progress[row.ingredientId] = used % row.quantity;
            product.recipeProgressJson = JSON.stringify(progress);
          }
        }
      }
    }
    const missingVariantItem = items.find((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      return Boolean(product && product.variants.length > 1 && !item.variantId);
    });
    if (missingVariantItem) {
      const product = products.find((candidate) => candidate.id === missingVariantItem.productId)!;
      await saveConversationState(database, conversation.id, {
        state: "awaiting_variant",
        items,
        fulfillment: requestedFulfillment,
        address: messageAddress,
        paymentMethod: requestedPaymentMethod,
        cashReceivedCents: requestedPaymentMethod === "cash" ? (cashReceivedCents === 0 ? cartTotal(items) : cashReceivedCents) : null,
        orderId: null,
        lastOrderMessageId: null,
      });
      return { reply: `${firstReplyPrefix}${variantQuestion(product)}`, orderId: null };
    }

    const unavailable = items.filter((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      return !product || product.stockQuantity + product.preparationCapacity < item.quantity;
    });
    if (unavailable.length) {
      return { reply: `${firstReplyPrefix}${unavailable.map((item) => `${item.name}${item.variantName ? ` de ${item.variantName}` : ""}`).join(" e ")} não está disponível agora. Quer escolher outro item?`, orderId: null };
    }

    if (!requestedFulfillment) {
      await saveConversationState(database, conversation.id, {
        state: "awaiting_fulfillment",
        items,
        fulfillment: null,
        address: messageAddress,
        paymentMethod: requestedPaymentMethod,
        cashReceivedCents: requestedPaymentMethod === "cash" ? (cashReceivedCents === 0 ? cartTotal(items) : cashReceivedCents) : null,
        orderId: null,
        lastOrderMessageId: null,
      });
      return { reply: `${firstReplyPrefix}${fulfillmentQuestion()}`, orderId: null };
    }

    if (requestedFulfillment === "delivery" && !messageAddress) {
      await saveConversationState(database, conversation.id, {
        state: "awaiting_address",
        items,
        fulfillment: "delivery",
        address: null,
        paymentMethod: requestedPaymentMethod,
        orderId: null,
        lastOrderMessageId: null,
      });
      return { reply: `${firstReplyPrefix}Certo, vou mandar por entrega. Agora envie sua localização atual pelo WhatsApp para eu colocar o endereço correto no pedido.`, orderId: null };
    }

    if (!requestedPaymentMethod || paymentInput === "card") {
      await saveConversationState(database, conversation.id, {
        state: "awaiting_payment",
        items,
        fulfillment: requestedFulfillment,
        address: messageAddress,
        paymentMethod: null,
        cashReceivedCents: null,
        orderId: null,
        lastOrderMessageId: null,
      });
      return { reply: `${firstReplyPrefix}${paymentInput === "card" ? "Você prefere cartão de crédito ou débito?" : paymentQuestion()}`, orderId: null };
    }

    const receivedCash = requestedPaymentMethod === "cash"
      ? cashReceivedCents === 0 ? cartTotal(items) : cashReceivedCents
      : null;
    if (requestedPaymentMethod === "cash" && receivedCash === null) {
      await saveConversationState(database, conversation.id, {
        state: "awaiting_cash_change",
        items,
        fulfillment: requestedFulfillment,
        address: messageAddress,
        paymentMethod: "cash",
        cashReceivedCents: null,
        orderId: null,
        lastOrderMessageId: null,
      });
      return { reply: `${firstReplyPrefix}${cashChangeQuestion(cartTotal(items))}`, orderId: null };
    }
    if (requestedPaymentMethod === "cash" && receivedCash !== null && receivedCash < cartTotal(items)) {
      return { reply: `O total é ${money(cartTotal(items))} e o valor informado é ${money(receivedCash)}. Informe um valor igual ou maior que o total, por exemplo “troco para 50”.`, orderId: null };
    }
    await saveConversationState(database, conversation.id, {
      state: "awaiting_order_confirmation",
      items,
      fulfillment: requestedFulfillment,
      address: messageAddress,
      paymentMethod: requestedPaymentMethod,
      cashReceivedCents: receivedCash,
      orderId: null,
      lastOrderMessageId: null,
    });
    return { reply: `${firstReplyPrefix}${summary(items, requestedFulfillment, messageAddress, requestedPaymentMethod, receivedCash)}`, orderId: null };
  };

  if (conversation.state === "awaiting_variant") {
    const pendingItem = currentItems.find((item) => !item.variantId && products.some(product => product.id === item.productId && product.variants.length > 1));
    const product = pendingItem ? products.find((candidate) => candidate.id === pendingItem.productId) : null;
    const selectedVariant = product ? findSelectedVariant(body, product) : null;
    if (!pendingItem || !product || !selectedVariant) {
      return { reply: product ? variantQuestion(product) : "Qual opção você prefere?", orderId: null };
    }
    const selectedItems = currentItems.map((item) => item.productId !== product.id ? item : {
      ...item,
      variantId: selectedVariant.id,
      variantName: selectedVariant.name,
      unitPriceCents: product.salePriceCents + selectedVariant.priceDeltaCents,
    });
    return continueWithItems(selectedItems);
  }

  if (conversation.state === "awaiting_fry_confirmation") {
    return continueWithItems(currentItems);
  }

  if (conversation.state === "awaiting_stock_confirmation") {
    return continueWithItems(currentItems);
  }

  if (conversation.state === "awaiting_fulfillment") {
    if (!requestedFulfillment) return { reply: fulfillmentQuestion(), orderId: null };
    return continueWithItems(pendingItems);
  }

  if (conversation.state === "awaiting_address") {
    if (requestedFulfillment !== "delivery") return continueWithItems(pendingItems);
    if (!messageAddress) return { reply: "Só falta sua localização atual pelo WhatsApp para eu colocar o endereço correto no pedido.", orderId: null };
    return continueWithItems(pendingItems);
  }

  if (conversation.state === "awaiting_payment") {
    if (paymentInput === "card") return { reply: "Você prefere cartão de crédito ou débito?", orderId: null };
    if (!parsedPayment?.success) return { reply: paymentQuestion(), orderId: null };
    return continueWithItems(pendingItems);
  }

  if (conversation.state === "awaiting_cash_change") {
    const receivedCash = cashInput === 0 ? cartTotal(currentItems) : cashInput;
    if (receivedCash === null) return { reply: cashChangeQuestion(cartTotal(currentItems)), orderId: null };
    if (receivedCash < cartTotal(currentItems)) {
      return { reply: `O total é ${money(cartTotal(currentItems))} e o valor informado é ${money(receivedCash)}. Informe um valor igual ou maior que o total, por exemplo “troco para 50”.`, orderId: null };
    }
    await saveConversationState(database, conversation.id, {
      state: "awaiting_order_confirmation",
      items: currentItems,
      fulfillment: currentFulfillment,
      address: currentAddress,
      paymentMethod: "cash",
      cashReceivedCents: receivedCash,
      orderId: null,
      lastOrderMessageId: null,
    });
    return { reply: summary(currentItems, currentFulfillment, currentAddress, "cash", receivedCash), orderId: null };
  }

  if (conversation.state === "awaiting_order_confirmation") {
    if (explicitItems.length && !confirmation) {
      return handoff("Você quer ajustar os itens antes de confirmar? Vou deixar a equipe conferir sua última mensagem junto com o resumo para não registrar uma quantidade ou sabor diferente do que você quer.");
    }
    if (refersToCurrentItems && !confirmation) return continueWithItems(pendingItems);
    if (!requestedPaymentMethod) {
      await saveConversationState(database, conversation.id, {
        state: "awaiting_payment",
        items: pendingItems,
        fulfillment: requestedFulfillment,
        address: messageAddress,
        paymentMethod: null,
        cashReceivedCents: null,
        orderId: null,
        lastOrderMessageId: null,
      });
      return { reply: paymentQuestion(), orderId: null };
    }
    const receivedCash = requestedPaymentMethod === "cash"
      ? cashReceivedCents === 0 ? cartTotal(pendingItems) : cashReceivedCents
      : null;
    if (requestedPaymentMethod === "cash" && receivedCash === null) {
      await saveConversationState(database, conversation.id, {
        state: "awaiting_cash_change",
        items: pendingItems,
        fulfillment: requestedFulfillment,
        address: messageAddress,
        paymentMethod: "cash",
        cashReceivedCents: null,
        orderId: null,
        lastOrderMessageId: null,
      });
      return { reply: cashChangeQuestion(cartTotal(pendingItems)), orderId: null };
    }
    if (requestedPaymentMethod === "cash" && receivedCash !== null && receivedCash < cartTotal(pendingItems)) {
      return { reply: `O total é ${money(cartTotal(pendingItems))} e o valor informado é ${money(receivedCash)}. Informe um valor igual ou maior que o total, por exemplo “troco para 50”.`, orderId: null };
    }
    if (!confirmation) return { reply: summary(pendingItems, requestedFulfillment, messageAddress, requestedPaymentMethod, receivedCash), orderId: null };
    return confirmOrder(pendingItems, requestedFulfillment || "pickup", messageAddress, requestedPaymentMethod, receivedCash);
  }

  if (conversation.state === "completed" && !identifiedItems.length) {
    if (/\b(obrigad[oa]|valeu|tmj)\b/i.test(body)) {
      return { reply: "Por nada! Se precisar, é só me chamar. 🙂", orderId: null };
    }
    if (rejection) {
      return { reply: "Tudo bem! Seu pedido continua registrado. Se precisar de mais alguma coisa, é só me chamar.", orderId: null };
    }
    if (confirmation || /\b(mais|tambem|também|acrescentar|adicionar|outro|outra)\b/i.test(body)) {
      return { reply: "Claro! Me diga a quantidade e o produto que você quer acrescentar.", orderId: null };
    }
    return handoff("Não consegui entender o que você precisa agora.");
  }

  if (!identifiedItems.length) {
    return handoff("Não consegui identificar uma resposta segura para essa mensagem.");
  }

  return continueWithItems(identifiedItems);
}

async function sendReply(
  database: PrismaClient,
  conversationId: string,
  remoteJid: string,
  body: string,
  sendText: (remoteJid: string, text: string) => Promise<{ providerMessageId?: string | null }>,
  sessionId: string,
  sourceMessageId: string,
) {
  const sent = await sendText(remoteJid, body);
  await database.foodMessage.create({
    data: {
      conversationId,
      sessionId,
      providerMessageId: sent.providerMessageId ?? `outbound:${sourceMessageId}:${randomUUID()}`,
      direction: "outbound",
      source: "bot",
      body,
      processedAt: new Date(),
    },
  });
  await database.foodConversation.update({
    where: { id: conversationId },
    data: { greetingSent: true },
  });
}

/**
 * Registra no estado do diálogo as informações objetivas que o atendente
 * informou manualmente. Assim, quando o cliente responder "sim" ou continuar
 * o pedido, o bot não volta para a pergunta que o humano já resolveu.
 */
export async function recordHumanMessageContext(database: PrismaClient, conversationId: string, body: string | null) {
  const text = body?.trim() ?? "";
  if (!text) return;

  const conversation = await database.foodConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return;

  const fulfillment = requestsPickup(text) ? "pickup" : requestsDelivery(text) ? "delivery" : null;
  const payment = paymentMethodFromText(text);
  const address = extractAddress(text);
  const catalog = await database.foodProduct.findMany({ where: { active: true } });
  const products = catalog
    .filter(product => product.productionMode !== "ingredient")
    .map(product => ({
      id: product.id,
      name: product.name,
      aliases: parseAliases(product.aliasesJson),
      salePriceCents: product.salePriceCents,
      stockQuantity: product.stockQuantity,
      preparationCapacity: preparationCapacity(product, catalog),
      allowOnDemand: product.allowOnDemand,
      fryToOrder: product.fryToOrder,
      productionMode: product.productionMode,
      category: product.category,
      customizationJson: product.customizationJson,
      variants: parseVariants(product.variantsJson),
      active: product.active,
    } satisfies Product));
  const items = identifyItems(text, products);

  const data: {
    pendingFulfillment?: string;
    pendingPaymentMethod?: string;
    pendingAddress?: string;
    pendingItemsJson?: string;
    state?: AutomationState;
  } = {};
  if (fulfillment) data.pendingFulfillment = fulfillment;
  if (payment && payment !== "card") data.pendingPaymentMethod = payment;
  if (address) data.pendingAddress = address;
  if (items.length) {
    data.pendingItemsJson = JSON.stringify(items);
    if (conversation.state === "completed") data.state = "awaiting_fulfillment";
  }
  if (!Object.keys(data).length) return;
  await database.foodConversation.update({ where: { id: conversationId }, data });
}

let activeRun: Promise<AutomationRunResult> | null = null;

export async function getFoodAutomationStatus(database: PrismaClient): Promise<AutomationStatus> {
  const config = await getOrCreateConfig(database);
  return {
    enabled: config.enabled,
    configured: env.MOSAICO_RELAY_ONLY || Boolean(env.WA_AKG_API_KEY && env.WA_AKG_SESSION_ID),
    webhookConfigured: Boolean(env.WA_AKG_WEBHOOK_SECRET && env.WA_AKG_SESSION_ID),
    sessionId: env.WA_AKG_SESSION_ID ?? null,
    baseUrl: env.WA_AKG_BASE_URL,
    lastRunAt: config.lastRunAt?.toISOString() ?? null,
    lastError: config.lastError,
  };
}

export async function setFoodAutomationEnabled(database: PrismaClient, enabled: boolean) {
  return database.foodAutomationConfig.upsert({
    where: { id: "default" },
    create: { id: "default", enabled },
    update: { enabled },
  });
}

export async function runFoodAutomation(
  database: PrismaClient,
  options: RunOptions = {},
): Promise<AutomationRunResult> {
  if (activeRun) return activeRun;
  activeRun = runFoodAutomationInternal(database, options).finally(() => {
    activeRun = null;
  });
  return activeRun;
}

async function runFoodAutomationInternal(
  database: PrismaClient,
  options: RunOptions,
): Promise<AutomationRunResult> {
  const startedAt = new Date();
  const config = await getOrCreateConfig(database);
  const result: AutomationRunResult = {
    enabled: config.enabled && !env.MOSAICO_RELAY_ONLY,
    conversations: 0,
    processedMessages: 0,
    repliesSent: 0,
    ordersCreated: 0,
    replies: [],
    skipped: 0,
    errors: [],
    lastRunAt: startedAt.toISOString(),
  };

  if (env.MOSAICO_RELAY_ONLY) return result;
  if (!config.enabled) return result;
  if (!options.sendText && (!env.WA_AKG_API_KEY || !env.WA_AKG_SESSION_ID)) {
    result.errors.push("WA-AKG não está configurado no .env do Mosaico.");
    return result;
  }

  const waAkg = options.sendText ? null : new WaAkgClient();
  const sendText = options.sendText ?? ((remoteJid: string, body: string) => waAkg!.sendText(remoteJid, body));
  const sessionId = options.sessionId ?? env.WA_AKG_SESSION_ID ?? "local";
  const conversations = await database.foodConversation.findMany({
    where: {
      ...(options.conversationId ? { id: options.conversationId } : {}),
      customer: { is: { automationEnabled: true } },
      automationPaused: false,
      messages: { some: { direction: "inbound", processedAt: null } },
    },
    orderBy: { lastMessageAt: "asc" },
    include: { customer: true },
  });
  const catalog = await database.foodProduct.findMany({ where: { active: true } });
  const products = catalog.filter(product => product.productionMode !== "ingredient").map((product) => ({
    id: product.id,
    name: product.name,
    aliases: parseAliases(product.aliasesJson),
    salePriceCents: product.salePriceCents,
    stockQuantity: product.stockQuantity,
    preparationCapacity: preparationCapacity(product, catalog),
    allowOnDemand: product.allowOnDemand,
    fryToOrder: product.fryToOrder,
    productionMode: product.productionMode,
    category: product.category,
    customizationJson: product.customizationJson,
    variants: parseVariants(product.variantsJson),
    active: product.active,
    productName: product.productName,
    flavor: product.flavor,
  } satisfies Product));
  result.conversations = conversations.length;

  for (const rawConversation of conversations) {
    let conversation = toConversationRecord(rawConversation);
    let currentMessageId: string | null = null;
    try {
      const messages = await database.foodMessage.findMany({
        where: { conversationId: conversation.id, direction: "inbound", processedAt: null },
        orderBy: { createdAt: "asc" },
      });
      const pendingMessages = options.latestOnly && messages.length > 1 ? messages.slice(-1) : messages;
      for (const rawMessage of pendingMessages) {
        currentMessageId = rawMessage.id;
        const mode = await database.foodConversation.findUnique({ where: { id: conversation.id }, include: { customer: true } });
        if (!mode || mode.automationPaused || !mode.customer?.automationEnabled) break;
        const freshCatalog = await database.foodProduct.findMany({ where: { active: true } });
        products.splice(0, products.length, ...freshCatalog.filter(product => product.productionMode !== "ingredient").map(product => ({
          id: product.id, name: product.name, aliases: parseAliases(product.aliasesJson),
          salePriceCents: product.salePriceCents, stockQuantity: product.stockQuantity,
          preparationCapacity: preparationCapacity(product, freshCatalog), allowOnDemand: product.allowOnDemand,
          fryToOrder: product.fryToOrder, productionMode: product.productionMode, category: product.category,
          customizationJson: product.customizationJson, variants: parseVariants(product.variantsJson), active: product.active,
          productName: product.productName, flavor: product.flavor,
        })));
        if (!options.force && Date.now() - rawMessage.createdAt.getTime() > env.FOOD_AUTOMATION_MAX_MESSAGE_AGE_MINUTES * 60_000) {
          await database.foodMessage.update({ where: { id: rawMessage.id }, data: { processedAt: new Date() } });
          result.skipped += 1;
          continue;
        }

        let incoming: IncomingMessage = rawMessage;
        if (rawMessage.mediaType === "audio" && rawMessage.transcriptionStatus !== "completed") {
          // O desktop baixa o áudio e usa o Whisper local. Enquanto a transcrição
          // não chegar, deixe a mensagem pendente para não responder antes da hora.
          break;
        }
        const latestMode = await database.foodConversation.findUnique({ where: { id: conversation.id }, include: { customer: true } });
        if (!latestMode || latestMode.automationPaused || !latestMode.customer?.automationEnabled) break;
        const outcome = incoming.mediaType === "audio" && !incoming.body
          ? { reply: audioFallback, orderId: null, needsHuman: true }
          : await processIncomingMessage(database, conversation, incoming, products);
        if (outcome.reply) {
          await sendReply(database, conversation.id, conversation.remoteJid, outcome.reply, sendText, sessionId, rawMessage.id);
          result.replies.push({ conversationId: conversation.id, remoteJid: conversation.remoteJid, body: outcome.reply });
          result.repliesSent += 1;
        }
        await database.foodMessage.update({
          where: { id: rawMessage.id },
          data: { processedAt: new Date(), needsHuman: outcome.needsHuman ?? false },
        });
        currentMessageId = null;
        result.processedMessages += 1;
        if (outcome.orderId) result.ordersCreated += 1;

        const refreshed = await database.foodConversation.findUnique({ where: { id: conversation.id } });
        if (refreshed) conversation = toConversationRecord(refreshed);
      }
    } catch (error) {
      if (currentMessageId) {
        await database.foodMessage.update({ where: { id: currentMessageId }, data: { needsHuman: true } }).catch(() => undefined);
      }
      result.errors.push(
        `${conversation.remoteJid}: ${error instanceof Error ? error.message : "erro desconhecido"}`,
      );
    }
  }

  await database.foodAutomationConfig.update({
    where: { id: "default" },
    data: {
      lastRunAt: new Date(),
      lastError: result.errors.length ? result.errors.join(" | ").slice(0, 1000) : null,
    },
  });
  return result;
}

export type OrderSuggestionDraft = {
  items: Array<{
    productId: string;
    name: string;
    variantId: string | null;
    variantName: string | null;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
  fulfillment: "pickup" | "delivery" | null;
  paymentMethod: string | null;
  customerName?: string | null;
  totalCents: number;
  intent: "sale" | "order";
};

/**
 * Interpreta um texto de conversa e devolve apenas uma sugestão de pedido.
 * Não envia mensagens, não altera o estado do diálogo e não cria pedidos.
 */
function resolveFlavorProduct(product: Product, text: string, end: number, products: Product[]) {
  const base = normalizeText(product.productName || product.name.split(" · ")[0]);
  const family = products.filter(candidate => normalizeText(candidate.productName || candidate.name.split(" · ")[0]) === base);
  const after = normalizeText(text.slice(end, Math.min(text.length, end + 30)));
  const flavorWord = after.match(/(?:de|do|da|com|sabor)\s+([a-z0-9]+)/)?.[1] ?? null;
  const productFlavor = product.flavor ? normalizeText(product.flavor) : null;
  if (flavorWord) {
    const sibling = family.find(candidate => candidate.flavor && normalizeText(candidate.flavor) === flavorWord);
    if (sibling) return sibling;
    if (productFlavor && flavorWord !== productFlavor) return null;
  }
  return product;
}

export async function suggestOrderFromText(database: PrismaClient, text: string): Promise<OrderSuggestionDraft> {
  const normalizedText = normalizeText(text);
  const hasQuantity = /\b\d+\b|\b(um|uma)\b/.test(normalizedText);
  const hasSaleIntent = /\b(vendi|vendeu|vendendo|vendo|venda|vender)\b/.test(normalizedText);
  const hasOrderIntent = /\b(quero|queria|vou\s+querer|me\s+ve|me\s+manda|manda|mandar|pedir|pedido|pedidos|separa|separe|traz|trazer|vou\s+de|coloca|faca|faz|fazer|me\s+faz|me\s+traga|quero\s+dois|quero\s+duas|quero\s+um|quero\s+uma)\b/.test(normalizedText);
  if (!hasQuantity) {
    return { items: [], fulfillment: null, paymentMethod: null, totalCents: 0, intent: "order" as const };
  }
  const catalog = await database.foodProduct.findMany({ where: { active: true } });
  const products = catalog.filter(product => product.productionMode !== "ingredient").map((product) => ({
    id: product.id,
    name: product.name,
    aliases: parseAliases(product.aliasesJson),
    salePriceCents: product.salePriceCents,
    stockQuantity: product.stockQuantity,
    preparationCapacity: preparationCapacity(product, catalog),
    allowOnDemand: product.allowOnDemand,
    fryToOrder: product.fryToOrder,
    productionMode: product.productionMode,
    category: product.category,
    customizationJson: product.customizationJson,
    variants: parseVariants(product.variantsJson),
    active: product.active,
    productName: product.productName,
    flavor: product.flavor,
  } satisfies Product));

  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches: Array<{ product: Product; start: number; end: number; quantity: number; explicit: boolean }> = [];
  for (const product of products) {
    const firstWord = normalizeText(product.name).split(" ")[0];
    const baseAliases = [
      normalizeText(product.name),
      ...product.aliases.map(normalizeText),
      ...(firstWord && firstWord.length >= 4 ? [firstWord] : []),
    ].filter(Boolean);
    const aliases = [...new Set(baseAliases.flatMap(alias => [
      alias,
      alias.replace(/\bpastel\b/g, "pasteis"),
      alias.replace(/\bao\b/g, "aes"),
      alias.replace(/ao(?=\s|$)/g, "aes"),
    ]))].sort((left, right) => right.length - left.length);
    for (const alias of aliases) {
      const regex = new RegExp(`(^|[^a-z0-9])(${escape(alias)})(s|es)?(?=$|[^a-z0-9])`, "g");
      let result: RegExpExecArray | null;
      while ((result = regex.exec(normalizedText))) {
        const start = result.index + result[1].length;
        const end = start + result[2].length + (result[3]?.length ?? 0);
        const before = normalizedText.slice(0, start);
        const beforeMatch = before.match(/(\d+|um|uma)\s*(?:x|un|unidades?|und)?\s*$/i);
        const after = normalizedText.slice(end, Math.min(normalizedText.length, end + 12));
        const afterMatch = after.match(/^\s*(?:x|de)?\s*(\d+)\b/i);
        const quantity = beforeMatch && /^\d+$/.test(beforeMatch[1])
          ? Number(beforeMatch[1])
          : afterMatch
            ? Number(afterMatch[1])
            : beforeMatch
              ? 1
              : 1;
        const explicit = Boolean(beforeMatch || afterMatch);
        const resolvedProduct = resolveFlavorProduct(product, normalizedText, end, products);
        if (!resolvedProduct) continue;
        matches.push({
          product: resolvedProduct,
          start,
          end,
          quantity: Math.max(1, quantity),
          explicit,
        });
      }
    }
  }
  matches.sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start));
  const selected: typeof matches = [];
  let lastEnd = -1;
  for (const match of matches) {
    if (match.start < lastEnd) continue;
    selected.push(match);
    lastEnd = match.end;
  }
  if (!hasSaleIntent && !hasOrderIntent && !selected.some(match => match.explicit)) {
    return { items: [], fulfillment: null, paymentMethod: null, totalCents: 0, intent: "order" as const };
  }

  const grouped = new Map<string, { productId: string; name: string; variantId: string | null; variantName: string | null; quantity: number; unitPriceCents: number; totalCents: number }>();
  for (const match of selected) {
    let unitPriceCents = match.product.salePriceCents;
    let variantId: string | null = null;
    let variantName: string | null = null;
    const near = normalizedText.slice(match.start, Math.min(normalizedText.length, match.end + 40));
    const variant = match.product.variants.length === 1
      ? match.product.variants[0]
      : match.product.variants.find(candidate => [candidate.name, ...candidate.aliases].some(alias => near.includes(normalizeText(alias))));
    if (variant) {
      variantId = variant.id;
      variantName = variant.name;
      unitPriceCents += variant.priceDeltaCents;
    }
    const key = `${match.product.id}:${variantId ?? ""}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += match.quantity;
      existing.totalCents = existing.quantity * existing.unitPriceCents;
    } else {
      grouped.set(key, {
        productId: match.product.id,
        name: match.product.name,
        variantId,
        variantName,
        quantity: match.quantity,
        unitPriceCents,
        totalCents: unitPriceCents * match.quantity,
      });
    }
  }
  const items = [...grouped.values()];
  const accountMatch = text.match(/\b(?:conta|fiado|crediario|crediário)\s+(?:d[oa]s?|para|pra)\s+([\p{L}][\p{L}\s]{2,60})/iu);
  let customerName = accountMatch ? accountMatch[1].trim() : null;
  if (customerName) {
    customerName = customerName.replace(/\b(?:no|na|de|do|da|por|em|pix|dinheiro|cartao|cartão|crediario|crediário|fiado|total|deu|que|e|pra|para)\b.*$/i, "").trim();
    if (!customerName) customerName = null;
  }
  const totalMatch = text.match(/\b(?:deu|total|ficou|fechou|foi|valor)\s*(?:em|de|por)?\s*(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i)
    ?? text.match(/\b(\d+(?:[.,]\d{1,2})?)\s*reais\b/i);
  const informedTotal = totalMatch ? Math.round(Number(totalMatch[1].replace(",", ".")) * 100) : null;
  const payment = accountMatch ? "crediario" : paymentMethodFromText(text);
  return {
    items,
    fulfillment: requestsDelivery(text) ? "delivery" : requestsPickup(text) ? "pickup" : null,
    paymentMethod: payment === "card" ? null : payment,
    customerName,
    totalCents: informedTotal ?? items.reduce((sum, item) => sum + item.totalCents, 0),
    intent: hasSaleIntent ? "sale" as const : "order" as const,
  };
}
