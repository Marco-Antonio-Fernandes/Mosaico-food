import { Controller, Post, Req, Res } from "@nestjs/common";
import type { FoodProduct } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import { PrismaService } from "../lib/prisma.service";
import { databaseUnavailable, jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { consumeLoss, consumePreparation, missingPreparationDependencies, preparationCapacity, productFamilyName } from "../lib/food-stock";
import { recordCounterSale } from "../lib/counter-sale";
import { recordSaleReceipt, salePaymentSchema } from "../lib/financial-movement";

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s,.;]/g, " ").replace(/\s+/g, " ").trim();
const normalizeProductText = (text: string) => normalize(text)
  .replace(/,/g, " ")
  .replace(/\s+/g, " ")
  .replace(/\b(apes|paes|pais)\b/g, "pao")
  .replace(/\b(cochinha|cochinhas)\b/g, "coxinha");
const transcriptionCorrections: Record<string, string> = {
  rendi: "vendi",
  mendi: "vendi",
  evndi: "vendi",
  vndi: "vendi",
  vnde: "vendi",
  vendei: "vendi",
  vende: "vendi",
  combrei: "comprei",
  conprei: "comprei",
  adionei: "adicionei",
  adiconei: "adicionei",
  addicionei: "adicionei",
  frutei: "fritei",
  fritai: "fritei",
  fritando: "fritei",
  ascei: "assei",
  assai: "assei",
  asei: "assei",
  acei: "assei",
  asse: "assei",
  assando: "assei",
  frago: "frango",
  quejo: "queijo",
  preparando: "preparei",
};
const correctTranscription = (text: string) => {
  let corrected = normalize(text)
    .replace(/\bcada\s+astrim\b/g, "cadastrar")
    .replace(/\b(cadastriri|cadastrir|cadastri|cadastr[ae]ri)\b/g, "cadastrar")
    .replace(/\b(?:a\s+sei|a\s+se|a\s+cei)\b/g, "assei");
  for (const [wrong, right] of Object.entries(transcriptionCorrections)) corrected = corrected.replace(new RegExp(`\\b${wrong}\\b`, "g"), right);
  return corrected;
};
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

function singularProductWord(word: string) {
  if (word === "pasteis") return "pastel";
  if (word.length > 4 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

const productMatchIgnored = new Set(["de", "da", "do", "dos", "das", "e", "com"]);
function productMatchTokens(text: string) {
  return normalizeProductText(text)
    .split(" ")
    .map(singularProductWord)
    .filter(token => token && !productMatchIgnored.has(token));
}

function containsPhraseTokens(textTokens: string[], phraseTokens: string[]) {
  if (!phraseTokens.length || phraseTokens.length > textTokens.length) return false;
  return textTokens.some((_, index) => phraseTokens.every((token, offset) => textTokens[index + offset] === token));
}

function parseAliases(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function splitCommands(text: string): string[] {
  const actionStart = new RegExp(`\\b(?:${actionWords})\\b`);
  const chunks = text
    .replace(/[.!?;]+/g, "|")
    .split(new RegExp(`,\\s*(?=${actionStart.source})|\\s+e\\s+(?:(?:depois|entao|tambem|ai)\\s+)?(?=${actionStart.source})|\\|`, "g"))
    .map(item => item.trim())
    .filter(Boolean);
  return chunks.flatMap(chunk => {
    const cleanedChunk = chunk.replace(/,\s*/g, " ").trim();
    const operationSegments = cleanedChunk.split(/\s+(?=(?:vendi|venda|vender|vendeu|fritei|fritou|assei|assou|preparei|preparou|cozinhei|cozinhou|produzi|produziu|fiz|fez|finalizei|finalizou|terminei|perdi|descartei|descartado|recebi|entrei|chegou|chegaram|comprei|inclui|adicionei|adicione|adicionei|coloquei|lancei|acrescentei)\b)/i);
    if (operationSegments.length > 1) return operationSegments.flatMap(segment => splitCommands(segment));
    const action = cleanedChunk.match(actionStart)?.[0];
    if (!action) return [cleanedChunk];
    const implicitItemSeparator = new RegExp(`((?:${quantityPattern})\\s+(?:e\\s+)?[a-z]+(?:\\s+(?:de|da|do|com)\\s+[a-z]+){0,3})\\s+(?=(?:${quantityPattern})\\b)`, "g");
    const separatedChunk = cleanedChunk.replace(implicitItemSeparator, "$1|");
    const items = separatedChunk.split(new RegExp(`\\s+e\\s+(?=(?:tambem\\s+)?(?:${quantityPattern})\\b)|\\|`, "g")).map(item => item.trim()).filter(Boolean);
    return items.map((item, index) => index === 0 ? item : `${action} ${item}`);
  });
}

function productTokens(text: string) {
  const ignored = new Set([
    ...actionWords.split("|"),
    ...Object.keys(quantityWords),
    "no", "na", "nos", "nas", "por", "pix", "dinheiro", "cartao", "credito", "debito", "crediario", "fiado", "prazo", "reais", "real", "total",
    "estoque", "stock", "stocks", "em", "ao", "a", "o", "os", "as", "tambem", "tbm", "mais", "pode", "podem", "por", "favor", "quero", "queria", "gostaria", "preciso", "tem", "como", "consegue", "conseguem", "vamos", "faca", "faz", "fora", "todo", "toda", "todos", "todas", "tudo",
    "pronto", "prontos", "pronta", "prontas", "assado", "assados", "assada", "assadas", "frito", "fritos", "frita", "fritas", "pedido", "pedidos", "encomenda", "encomendas", "crie", "criar", "monte", "montar", "faca", "fazer", "mim",
    "cru", "crus", "crua", "cruas", "congelado", "congelados", "congelada", "congeladas", "congelos", "sem", "para", "fritar", "frita", "fritas", "assar", "cozinhar", "finalizar", "finalizado", "finalizados", "novo", "novos", "nova", "novas", "sistema", "como", "cadastrar",
  ]);
  return normalizeProductText(text).split(" ").map(singularProductWord).filter(token => !/^\d+$/.test(token) && !ignored.has(token));
}

function chooseProduct(text: string, catalog: FoodProduct[], requestedId?: string) {
  if (requestedId) return catalog.find(product => product.id === requestedId) ?? null;
  const exactMatches = catalog.flatMap(product => [product.name, ...parseAliases(product.aliasesJson)].map(name => ({ product, phrase: normalizeProductText(name) })))
    .filter(row => containsPhraseTokens(productMatchTokens(text), productMatchTokens(row.phrase)));
  if (exactMatches.length) {
    const longestPhrase = Math.max(...exactMatches.map(row => productMatchTokens(row.phrase).length));
    const exactProducts = [...new Map(exactMatches.filter(row => productMatchTokens(row.phrase).length === longestPhrase).map(row => [row.product.id, row.product])).values()];
    const stockedProducts = exactProducts.filter(product => product.stockQuantity > 0 || product.unpreparedQuantity > 0);
    if (stockedProducts.length === 1) return stockedProducts[0];
    return exactProducts.length === 1 ? exactProducts[0] : exactProducts.map(product => ({ product, score: 0 }));
  }
  const tokens = productTokens(text);
  if (!tokens.length) return null;
  const familyCandidates = catalog.filter(product => {
    const familyTokens = productMatchTokens(productFamilyName(product));
    return familyTokens.length === tokens.length && familyTokens.every((token, index) => token === tokens[index]);
  });
  if (familyCandidates.length > 1) return familyCandidates.map(product => ({ product, score: 0 }));
  const ranked = catalog.map(product => {
    const aliases = parseAliases(product.aliasesJson);
    const score = Math.min(...[product.name, ...aliases].map(name => {
      const expected = productMatchTokens(name);
      const fullScore = (expected.reduce((sum, word) => sum + Math.min(...tokens.map(token => distance(word, token))), 0) / Math.max(expected.join("").length, 1))
        + Math.max(0, tokens.length - expected.length) * 0.15;
      const matched = expected.filter(word => Math.min(...tokens.map(token => distance(word, token))) <= Math.max(1, Math.floor(word.length * 0.35))).length;
      const overlapScore = matched ? 0.44 + (1 - matched / Math.max(expected.length, 1)) * 0.12 + Math.max(0, tokens.length - expected.length) * 0.03 : Infinity;
      const shortScore = tokens.length === 1 && expected[0].length >= 3
        ? distance(expected[0], tokens[0]) / expected[0].length
        : Infinity;
      return Math.min(fullScore, overlapScore, shortScore);
    }));
    return { product, score };
  }).filter(row => row.score <= 0.55).sort((a, b) => a.score - b.score);
  if (!ranked.length) return null;
  const candidates = ranked.filter(row => row.score <= (ranked[0]?.score ?? 0) + 0.1);
  const stockedCandidates = candidates.filter(row => row.product.stockQuantity > 0 || row.product.unpreparedQuantity > 0);
  if (stockedCandidates.length === 1) return stockedCandidates[0].product;
  return candidates.length === 1 ? candidates[0].product : candidates;
}

function rewriteExistingStockRegistration(text: string, catalog: FoodProduct[]) {
  const pattern = new RegExp(`(?:\\b(?:pedi\\s+(?:para|pra)\\s+))?\\b(?:cadastre|cadastrar|cadastra|registre|registrar|registra)\\s+(${quantityPattern})\\s+([^.;]+)$`, "i");
  return text.replace(pattern, (match, quantity: string, productText: string) => {
    if (!preparationStateWords.test(productText)) return match;
    const selected = chooseProduct(productText, catalog);
    return selected && !Array.isArray(selected) ? `adicione ${quantity} ${productText}` : match;
  });
}

function parseCommand(text: string, catalog: FoodProduct[], allProducts: FoodProduct[], requestedId?: string): CommandParseResult {
  const sale = saleWords.test(text);
  const order = orderWords.test(text) && !sale;
  const loss = lossWords.test(text);
  const prepare = hasPreparationAction(text);
  const receive = !loss && (receiveWords.test(text) || (!sale && !prepare && stockWords.test(text)));
  if (Number(order) + Number(sale) + Number(loss) + Number(prepare) + Number(receive) !== 1) {
    return { message: "Diga o que aconteceu: vendi, comprei, preparei, adicionei ao estoque ou dei baixa como perda. Você pode falar várias ações na mesma mensagem." };
  }

  const quantityToken = text.match(new RegExp(`\\b(?:${actionWords})\\b(?:\\s+(?:ao|a|o|os|as|no|na|nos|nas|em|estoque|stock|de|do|da|dos|das|para|tambem|tbm|mais))*\\s+(${quantityPattern})\\b`))?.[1]
    ?? (order ? text.match(new RegExp(`\\b(${quantityPattern})\\b`))?.[1] : undefined)
    ?? text.match(new RegExp(`\\b(${quantityPattern})\\s+(?:unidades?|itens?)?\\s*(?:de|do|da|dos|das)?\\s*`))?.[1];
  const allRequested = loss && /\b(todo|toda|todos|todas|tudo)\b/.test(text);
  let quantity = quantityToken ? quantityWords[quantityToken] ?? Number(quantityToken) : order ? 1 : 0;
  if (!allRequested && (!Number.isInteger(quantity) || quantity <= 0 || quantity > 100000)) {
    return { message: "Quantas unidades? Diga, por exemplo: assei 50 pães." };
  }
  if (sale && /\b(cada|unidade por|unitario)\b/.test(text)) {
    return { message: "Informe o valor total da venda, por exemplo: vendi 5 pães por 30 reais no total." };
  }

  const hasPreparationState = preparationStateWords.test(text);

  let action: AssistantAction = order
      ? "order"
      : sale
      ? "sale"
      : loss
        ? "loss"
      : prepare
        ? "prepare"
      : (unpreparedStateWords.test(text) || (receive && !hasPreparationState))
        ? "receive_unprepared"
        : "receive_ready";
  const availableCatalog = action === "order" || action === "sale" || action === "loss" || action === "receive_ready" || action === "receive_unprepared"
    ? catalog
    : catalog.filter(product => product.productionMode !== "ingredient");
  const selected = chooseProduct(text, availableCatalog, requestedId);
  if (Array.isArray(selected)) {
    return { message: "Qual produto você quis dizer?", choices: selected.map(row => ({ id: row.product.id, name: row.product.name, stockQuantity: row.product.stockQuantity, unpreparedQuantity: row.product.unpreparedQuantity })) };
  }
  if (!selected) return { message: action === "receive_unprepared"
    ? `Qual é o produto dessas ${quantity} unidades para preparar? Diga, por exemplo: “${quantity} pastéis de carne congelados”.`
    : "Não encontrei esse produto. Cadastre o nome ou um alias no catálogo." };
  const product = selected;
  if (action === "receive_unprepared" && product.productionMode === "ingredient") action = "receive_ready";
  if (allRequested) quantity = product.stockQuantity;
  if (allRequested && quantity <= 0) return { message: `${product.name} está sem estoque pronto para dar baixa.` };
  if ((sale || order || prepare) && product.productionMode === "ingredient") return { message: "Esse item é um insumo. Escolha o produto que ele ajuda a fazer." };
  if (sale && quantity > product.stockQuantity) return { message: `Há ${product.stockQuantity} unidades prontas de ${product.name}. Registre o preparo ou a entrada antes da venda.` };
  if (prepare && quantity > preparationCapacity(product, allProducts)) {
    const available = preparationCapacity(product, allProducts);
    const missing = missingPreparationDependencies(product, allProducts);
    const dependencyMessage = missing.length ? ` Faltam: ${missing.map(item => item.name).join(", ")}.` : "";
    return { message: `Entendi “preparar ${quantity} ${product.name}”, mas só há ${available} ${available === 1 ? "unidade disponível" : "unidades disponíveis"} separadas para fritar/assar.${dependencyMessage} Adicione primeiro ao estoque; depois use “Fritar / assar” ou confira os insumos da receita.` };
  }
  if (loss && quantity > product.stockQuantity + product.unpreparedQuantity) return { message: `Há ${product.stockQuantity + product.unpreparedQuantity} unidade${product.stockQuantity + product.unpreparedQuantity === 1 ? "" : "s"} de ${product.name} para dar baixa.` };

  const amount = text.match(/(?:r\$\s*|por\s+)(\d+(?:[.,]\d{1,2})?)|\b(\d+(?:[.,]\d{1,2})?)\s*reais\b/i);
  const spokenAmount = text.match(/\b(um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+reais\b/)?.[1];
  if (sale && product.salePriceCents <= 0 && !amount && !spokenAmount) return { message: `Qual foi o valor total da venda de ${product.name}?` };
  const totalCents = sale || order
    ? amount
      ? Math.round(Number((amount[1] ?? amount[2]).replace(",", ".")) * 100)
      : spokenAmount
        ? quantityWords[spokenAmount] * 100
        : product.salePriceCents * quantity
    : 0;
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > 100000000) return { message: "Confira o valor total da venda." };
  const paymentMethod = /\bpix\b/.test(text) ? "pix" : /\bdinheiro\b/.test(text) ? "cash" : /\b(credito|crédito)\b/.test(text) ? "card_credit" : /\b(debito|débito|cartao|cartão)\b/.test(text) ? "card_debit" : /\b(vale|alimentacao|alimentação)\b/.test(text) ? "meal_voucher" : /\b(crediario|fiado|a\s+prazo)\b/.test(text) ? "crediario" : /\b(brinde|cortesia|gratuito|gratis|grátis)\b/.test(text) ? "brinde" : null;
  return { command: { action, quantity, product, totalCents, paymentMethod } };
}

function draftView(draft: { id: string; action: string; quantity: number; totalCents: number; unitPriceCents: number; paymentMethod: string | null }, productName: string) {
  return { id: draft.id, action: draft.action, quantity: draft.quantity, productName, totalCents: draft.totalCents, baseUnitPriceCents: draft.unitPriceCents, paymentMethod: draft.paymentMethod };
}
const registrationWords = /\b(cadastre|cadastrar|cadastra|registre|registrar|registra)\b/;
type RegistrationQuestion = { kind: "quantity" | "unit" | "name"; name?: string; quantity?: number; stockUnit?: "un" | "g" | "ml" };
type RegistrationParseResult =
  | { registration: { name: string; quantity: number; stockUnit: "un" | "g" | "ml" } }
  | { message: string; registrationQuestion: RegistrationQuestion };

function parseRegistration(text: string): RegistrationParseResult | null {
  if (!registrationWords.test(text)) return null;
  const body = text.replace(registrationWords, "").trim().replace(/^(um|uma|o|a)\s+/, "");
  const measuredAmountMatch = body.match(/\b(\d+)\s*(kg|quilogramas?|g|gramas?|l|litros?|ml|mililitros?)\b/);
  if (measuredAmountMatch) {
    const name = body.slice((measuredAmountMatch.index ?? 0) + measuredAmountMatch[0].length).replace(/^\s*(de|do|da|dos|das)\s+/, "").trim();
    if (!name) return { message: "Qual é o nome desse insumo? Cadastre sempre por unidades." , registrationQuestion: { kind: "name" } };
    return { message: `Aqui o estoque é contado por unidades. Quantas unidades de ${name} você tem?`, registrationQuestion: { kind: "quantity", name } };
  }
  const amountMatch = body.match(/\b(\d+)\s*(unidades?|un|unid)\b/);
  if (amountMatch) {
    const quantity = Number(amountMatch[1]);
    const name = body.slice((amountMatch.index ?? 0) + amountMatch[0].length).replace(/^\s*(de|do|da|dos|das)\s+/, "").trim();
    if (!name) return { message: "Qual é o nome desse insumo?", registrationQuestion: { kind: "name", quantity, stockUnit: "un" } };
    return { registration: { name, quantity, stockUnit: "un" } };
  }
  const numberMatch = body.match(/\b(\d+)\b/);
  if (numberMatch) {
    const name = body.slice((numberMatch.index ?? 0) + numberMatch[0].length).replace(/^\s*(de|do|da|dos|das)\s+/, "").trim();
    if (!name) return { message: "Qual é o nome desse insumo?", registrationQuestion: { kind: "name", quantity: Number(numberMatch[1]), stockUnit: "un" } };
    return { registration: { name, quantity: Number(numberMatch[1]), stockUnit: "un" } };
  }
  if (!body) return { message: "Qual insumo você quer cadastrar?", registrationQuestion: { kind: "name" } };
  return { message: `Quantas unidades de ${body} você tem?`, registrationQuestion: { kind: "quantity", name: body } };
}

function exactProduct(name: string, catalog: FoodProduct[]) {
  const normalizedName = normalizeProductText(name);
  return catalog.find(product => normalizeProductText(product.name) === normalizedName || parseAliases(product.aliasesJson).some(alias => normalizeProductText(alias) === normalizedName));
}

const paymentSchema = salePaymentSchema.nullable();
const quantityWords: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezassete: 17, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100 };
const quantityPattern = `\\d+|${Object.keys(quantityWords).join("|")}`;
const actionWords = "vendi|venda|vender|vendeu|fritei|frito|fritou|fritar|fritando|assei|asso|assou|assar|assando|cozinhei|cozinhar|cozinhou|preparei|preparou|preparar|preparando|produzi|produzir|produziu|fiz|fazer|fez|finalizei|finalizar|finalizando|finalizou|terminei|terminar|perdi|perder|perda|perdas|descartar|descartei|descartado|descartada|descartados|descartadas|vencido|vencida|venceram|estragou|estragado|estragada|sobrou|sobraram|baixa|baixar|joguei|jogar|recebi|receber|entrei|entrou|entrada|dar|dei|chegou|chegaram|comprar|comprei|inclui|inclua|incluir|incluido|adicionei|adicione|adiciono|adicionar|coloquei|coloque|colocar|lancei|lance|lancar|acrescentei|acrescente|acrescentar|tenho|tem|possuo|possui";
const saleWords = /\b(vendi|venda|vender|vendeu)\b/;
const orderWords = /\b(pedido|pedidos|encomenda|encomendas)\b|\b(?:crie|criar|monte|montar|faca|fazer)\s+(?:para\s+mim|um|uma)?\s*(?:pedido|encomenda)\b/i;
const lossWords = /\b(perdi|perder|perda|perdas|descartar|descartei|descartad\w*|vencid\w*|venceram|estrag\w*|sobrou|sobraram|baixa|baixar|joguei|jogar)\b|\bjogar\s+fora\b|\bjoguei\s+fora\b/;
const prepareWords = /\b(fritei|fritou|fritando|assei|asso|assou|assando|cozinhei|cozinhou|preparei|preparou|preparando|produzi|produziu|fiz|fez|finalizei|finalizando|finalizou|terminei)\b/;
const preparationInfinitiveWords = /\b(fritar|assar|cozinhar|preparar|produzir|fazer|finalizar|terminar)\b/;
const preparationStatePhrase = /\bpara\s+(?:fritar|assar|cozinhar|preparar|finalizar)\b/;
const hasPreparationAction = (text: string) => prepareWords.test(text) || (preparationInfinitiveWords.test(text) && !preparationStatePhrase.test(text) && !receiveWords.test(text));
const receiveWords = /\b(recebi|receber|entrei|entrou|entrada|dar|dei|chegou|chegaram|comprar|comprei|inclui|inclua|incluir|incluido|adicionei|adicione|adiciono|adicionar|coloquei|coloque|colocar|lancei|lance|lancar|acrescentei|acrescente|acrescentar|tenho|tem|possuo|possui)\b/;
const stockWords = /\b(estoque|stock)\b/;
const preparationStateWords = /\b(pronto|prontos|pronta|prontas|assado|assados|assada|assadas|frito|fritos|frita|fritas|cozido|cozidos|cozida|cozidas|cru|crus|crua|cruas|congelado|congelados|congelada|congeladas|congelos|para\s+(?:fritar|assar|cozinhar|finalizar|preparar)|fritar|frita|fritas|assar|cozinhar|finalizar)\b|\bnao\s+vem\s+pront\w*\b/;
const unpreparedStateWords = /\b(para|cru\w*|congelad\w*|fritar|assar|cozinhar|finalizar)\b|\bnao\s+vem\s+pront\w*\b|\b(?:precisa|necessita|tem\s+que)\s+(?:fritar|assar|cozinhar|finalizar|preparar)\b/;

type AssistantAction = "order" | "sale" | "prepare" | "loss" | "receive_ready" | "receive_unprepared";
type ParsedAssistantCommand = {
  action: AssistantAction;
  quantity: number;
  product: FoodProduct;
  totalCents: number;
  paymentMethod: "pix" | "cash" | "card_credit" | "card_debit" | "meal_voucher" | "crediario" | "brinde" | null;
};
type CommandParseResult = { command: ParsedAssistantCommand } | { message: string; choices?: { id: string; name: string }[] };

@Controller("api/v1/food/assistant")
export class FoodAssistantController {
  constructor(private readonly database: PrismaService) {}

  @Post("preview")
  async preview(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const parsed = z.object({ text: z.string().trim().min(1).max(3000), productId: z.string().uuid().optional() }).safeParse(request.body);
    if (!parsed.success) return response.status(400).json(jsonError("INVALID_COMMAND", "Escreva o que aconteceu.", 400));
    const text = correctTranscription(parsed.data.text);
    if (/\b(cancelar|cancela|desfazer|pare|parar)\b/.test(text) || /\bnao\s+(?:registre|registra|quero|pode|faca|fazer)\b/.test(text)) return response.json(jsonData({ message: "Nenhuma operação registrada. Diga somente o que deseja registrar agora." }));
    const hasOperation = orderWords.test(text) || saleWords.test(text) || lossWords.test(text) || hasPreparationAction(text) || receiveWords.test(text) || stockWords.test(text) || registrationWords.test(text);
    if (!hasOperation && /^(oi|ola|bom dia|boa tarde|boa noite|tudo bem)(?: assistente)?\b/.test(text)) {
      return response.json(jsonData({ message: "Olá! Posso registrar entradas, vendas, preparos e cadastrar insumos. Você pode escrever ou falar normalmente." }));
    }
    if (!hasOperation && /\b(ajuda|como funciona|o que voce pode fazer|o que vc pode fazer)\b/.test(text)) {
      return response.json(jsonData({ message: "Posso registrar estoque, vendas e preparos, cadastrar insumos e montar produtos. Exemplo: “adicione 20 pães”, “vendi 5 coxinhas por 30 reais” ou “cadastre 5 pacotes de presunto”." }));
    }
    if (!hasOperation && /\b(obrigad[oa]|valeu|beleza|perfeito|entendi)\b/.test(text)) {
      return response.json(jsonData({ message: "Por nada. Quando quiser, me diga o que aconteceu no estoque." }));
    }
    const catalog = await this.database.foodProduct.findMany({ where: { active: true } });
    const commandText = rewriteExistingStockRegistration(text, catalog);
    const hasInventoryOperation = orderWords.test(commandText) || saleWords.test(commandText) || lossWords.test(commandText) || hasPreparationAction(commandText) || receiveWords.test(commandText) || stockWords.test(commandText);
    const registration = hasInventoryOperation ? null : parseRegistration(commandText);
    if (registration) {
      if (!("registration" in registration)) return response.json(jsonData(registration));
      const existing = exactProduct(registration.registration.name, catalog);
      if (existing) {
        if (existing.productionMode !== "ingredient") return response.json(jsonData({ message: `${existing.name} já existe como produto. Para cadastrar um insumo separado, use outro nome.` }));
        if (existing.stockUnit !== registration.registration.stockUnit) return response.json(jsonData({ message: `${existing.name} já está controlado em ${existing.stockUnit === "un" ? "unidades" : existing.stockUnit === "g" ? "gramas" : "mililitros"}. Quer adicionar nessa unidade ou editar o cadastro?` }));
        const draft = await this.database.foodAssistantDraft.create({ data: { productId: existing.id, action: "receive_ready", quantity: registration.registration.quantity, totalCents: 0, unitPriceCents: existing.salePriceCents, paymentMethod: null } });
        const view = draftView(draft, existing.name);
        return response.json(jsonData({ drafts: [view], draft: view }));
      }
      const draft = await this.database.foodAssistantRegistrationDraft.create({ data: { name: registration.registration.name, quantity: registration.registration.quantity, stockUnit: registration.registration.stockUnit } });
      return response.json(jsonData({ registration: { id: draft.id, name: draft.name, quantity: draft.quantity, stockUnit: draft.stockUnit, unitWeightGrams: draft.unitWeightGrams, unitVolumeMl: draft.unitVolumeMl } }));
    }
    const parts = splitCommands(commandText);
    const globalPreparationState = commandText.match(preparationStateWords)?.[0];
    let previousProduct: FoodProduct | null = null;
    const commands = parts.map((part, index) => {
      const commandText = globalPreparationState && !preparationStateWords.test(part)
        ? `${part} ${globalPreparationState}`
        : part;
      let result = parseCommand(commandText, catalog, catalog, index === 0 ? parsed.data.productId : undefined);
      if (!("command" in result) && previousProduct && /\b(de|da|do|dos|das)\b/.test(commandText) && result.message === "Não encontrei esse produto. Cadastre o nome ou um alias no catálogo.") {
        const sharedPrefix = previousProduct.name.split(/\s+de\s+/i)[0] || previousProduct.name;
        result = parseCommand(`${sharedPrefix} ${commandText}`, catalog, catalog, index === 0 ? parsed.data.productId : undefined);
      }
      if (!("command" in result) && previousProduct && !productTokens(commandText).length) {
        result = parseCommand(`${commandText} ${previousProduct.name}`, catalog, catalog, index === 0 ? parsed.data.productId : undefined);
      }
      if ("command" in result) previousProduct = result.command.product;
      return result;
    });
    const failed = commands.find(result => !("command" in result));
    const validCommands = commands.flatMap(result => "command" in result ? [result.command] : []);
    if (failed && !validCommands.length) return response.json(jsonData(failed));
    const drafts = await this.database.$transaction(async tx => Promise.all(validCommands.map(command => tx.foodAssistantDraft.create({
      data: {
        productId: command.product.id,
        action: command.action,
        quantity: command.quantity,
        totalCents: command.totalCents,
        unitPriceCents: command.product.salePriceCents,
        paymentMethod: command.paymentMethod,
      },
    }))));
    const views = drafts.map((draft, index) => draftView(draft, validCommands[index].product.name));
    const pendingMessage = failed && !("command" in failed) ? `Encontrei ${views.length} operaç${views.length === 1 ? "ão" : "ões"}. Uma parte ficou pendente: ${failed.message}` : undefined;
    return response.json(jsonData({ drafts: views, ...(views.length === 1 ? { draft: views[0] } : {}), ...(pendingMessage ? { message: pendingMessage } : {}) }));
  }

  @Post("confirm")
  async confirm(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!this.database.isConfigured) return databaseUnavailable(response);
    const confirmationItem = z.object({ draftId: z.string().uuid(), totalCents: z.number().int().min(0).max(100000000), paymentMethod: paymentSchema, creditCustomerId: z.string().uuid().optional(), adjustmentNote: z.string().trim().max(240).nullable().optional() });
    const registrationItem = z.object({ draftId: z.string().uuid() });
    const parsed = z.object({
      draftId: z.string().uuid().optional(),
      totalCents: z.number().int().min(0).max(100000000).optional(),
      paymentMethod: paymentSchema.optional(),
      creditCustomerId: z.string().uuid().optional(),
      adjustmentNote: z.string().trim().max(240).nullable().optional(),
      drafts: z.array(confirmationItem).min(1).max(20).optional(),
      registrations: z.array(registrationItem).min(1).max(20).optional(),
    }).refine(value => Boolean(value.drafts?.length || value.registrations?.length || value.draftId), "Informe a operação.").safeParse(request.body);
    if (!parsed.success) return response.status(400).json(jsonError("INVALID_CONFIRMATION", "Confira os dados antes de confirmar.", 400));
    const confirmations = parsed.data.drafts ?? (parsed.data.draftId ? [{ draftId: parsed.data.draftId, totalCents: parsed.data.totalCents ?? 0, paymentMethod: parsed.data.paymentMethod ?? null, creditCustomerId: parsed.data.creditCustomerId, adjustmentNote: parsed.data.adjustmentNote }] : []);
    const registrations = parsed.data.registrations ?? [];
    try {
      const result = await this.database.$transaction(async tx => {
        let completed = 0;
        let sales = 0;
        let orders = 0;
        let stockChanges = 0;
        let registeredProducts = 0;
        for (const input of confirmations) {
          const draft = await tx.foodAssistantDraft.findUniqueOrThrow({ where: { id: input.draftId } });
          if (draft.completed) continue;
          if (Date.now() - draft.createdAt.getTime() > 15 * 60_000) throw new Error("Essa confirmação expirou. Envie o comando novamente.");
          const product = await tx.foodProduct.findUniqueOrThrow({ where: { id: draft.productId } });
          if (!product.active) throw new Error(`O produto ${product.name} está inativo.`);
          if (draft.action === "sale" && !input.paymentMethod) throw new Error("SALE_PAYMENT_REQUIRED");
          if (draft.action === "sale" && input.paymentMethod === "brinde" && input.totalCents !== 0) throw new Error("GIFT_PAYMENT_MUST_BE_ZERO");
          const saleUnitPriceCents = draft.action === "sale"
            ? input.paymentMethod === "brinde" ? 0 : input.totalCents % draft.quantity === 0 ? input.totalCents / draft.quantity : -1
            : draft.unitPriceCents;
          const saleAdjustmentCents = saleUnitPriceCents - draft.unitPriceCents;
          if (draft.action === "sale" && (saleUnitPriceCents < 0 || (saleAdjustmentCents !== 0 && !input.adjustmentNote?.trim()))) throw new Error("ASSISTANT_ADJUSTMENT_NOTE_REQUIRED");
          if (draft.action === "order") {
            await tx.foodOrder.create({
              data: {
                status: "confirmed",
                fulfillment: "pickup",
                totalCents: input.totalCents,
                source: "balcao",
                items: {
                  create: {
                    productId: product.id,
                    productName: product.name,
                    quantity: draft.quantity,
                    unitPriceCents: draft.unitPriceCents,
                    totalCents: input.totalCents,
                    fryNow: false,
                  },
                },
              },
            });
            orders += 1;
          } else if (draft.action === "prepare") {
            await consumePreparation(tx, product.id, draft.quantity);
            await tx.foodProduct.update({ where: { id: product.id }, data: { stockQuantity: { increment: draft.quantity } } });
            await tx.foodStockOperation.create({ data: { id: draft.id, productId: product.id, action: "prepare", quantity: draft.quantity } });
            stockChanges += 1;
          } else if (draft.action === "loss") {
            await consumeLoss(tx, product.id, draft.quantity);
            await tx.foodStockOperation.create({ data: { id: draft.id, productId: product.id, action: "loss", quantity: draft.quantity } });
            stockChanges += 1;
          } else if (draft.action === "receive_ready" || draft.action === "receive_unprepared") {
            if (draft.action === "receive_unprepared" && product.productionMode === "ingredient") throw new Error(`${product.name} é um insumo e não pode ficar para finalizar.`);
            await tx.foodProduct.update({ where: { id: product.id }, data: draft.action === "receive_unprepared" ? { unpreparedQuantity: { increment: draft.quantity } } : { stockQuantity: { increment: draft.quantity } } });
            await tx.foodStockOperation.create({ data: { id: draft.id, productId: product.id, action: draft.action, quantity: draft.quantity } });
            stockChanges += 1;
          } else if (draft.action === "sale") {
            if (product.productionMode === "ingredient") throw new Error("Insumo não pode ser vendido pelo assistente.");
            const account = input.paymentMethod === "crediario"
              ? input.creditCustomerId ? await tx.creditAccount.findUnique({ where: { customerId: input.creditCustomerId } }) : null
              : null;
            if (input.paymentMethod === "crediario" && !input.creditCustomerId) throw new Error("CREDIT_CUSTOMER_REQUIRED");
            if (input.paymentMethod === "crediario" && !account) throw new Error("CREDIT_ACCOUNT_NOT_FOUND");
            if (account?.creditLimitCents !== null && account && account.balanceCents + input.totalCents > account.creditLimitCents) throw new Error("CREDIT_LIMIT_EXCEEDED");
            await recordCounterSale(tx, { id: draft.id, operationId: draft.id, source: "assistant", productId: product.id, quantity: draft.quantity, unitPriceCents: saleUnitPriceCents, totalCents: input.totalCents, paymentMethod: input.paymentMethod, adjustmentCents: saleAdjustmentCents, adjustmentNote: input.adjustmentNote, isGift: input.paymentMethod === "brinde" });
            await recordSaleReceipt(tx, { referenceType: "assistant_sale", referenceId: draft.id, source: "assistant", totalCents: input.totalCents, paymentMethod: input.paymentMethod });
            if (account) {
              await tx.creditEntry.create({ data: { creditAccountId: account.id, type: "charge", amountCents: input.totalCents, note: `Venda pelo assistente ${draft.id}`, occurredAt: new Date(), operationId: draft.id, referenceType: "food_sale", referenceId: draft.id } });
              await tx.creditAccount.update({ where: { id: account.id }, data: { balanceCents: { increment: input.totalCents }, version: { increment: 1 } } });
            }
            sales += 1;
          } else {
            throw new Error("Operação de estoque desconhecida.");
          }
          await tx.foodAssistantDraft.update({ where: { id: draft.id }, data: { completed: true } });
          completed += 1;
        }
        for (const input of registrations) {
          const draft = await tx.foodAssistantRegistrationDraft.findUniqueOrThrow({ where: { id: input.draftId } });
          if (draft.completed) continue;
          if (Date.now() - draft.createdAt.getTime() > 15 * 60_000) throw new Error("Esse cadastro expirou. Diga o comando novamente.");
          const product = await tx.foodProduct.create({
            data: {
              name: draft.name,
              normalizedName: draft.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(),
              category: "Insumos",
              aliasesJson: "[]",
              variantsJson: "[]",
              salePriceCents: 0,
              stockQuantity: draft.quantity,
              unpreparedQuantity: 0,
              productionMode: "ingredient",
              stockUnit: draft.stockUnit,
              unitWeightGrams: draft.unitWeightGrams,
              unitVolumeMl: draft.unitVolumeMl,
              recipeJson: "[]",
              allowOnDemand: false,
              fryToOrder: false,
              active: true,
            },
          });
          await tx.foodStockOperation.create({ data: { id: draft.id, productId: product.id, action: "receive_ready", quantity: draft.quantity } });
          await tx.foodAssistantRegistrationDraft.update({ where: { id: draft.id }, data: { completed: true } });
          registeredProducts += 1;
        }
        if (!completed && !registeredProducts) return { message: "Essas operações já foram registradas." };
        if (registeredProducts && (completed || sales || stockChanges || orders)) return { message: `${registeredProducts} insumo${registeredProducts === 1 ? "" : "s"} cadastrado${registeredProducts === 1 ? "" : "s"} e ${completed} operação${completed === 1 ? "" : "ões"} registrada${completed === 1 ? "" : "s"}.` };
        if (registeredProducts) return { message: `${registeredProducts} insumo${registeredProducts === 1 ? "" : "s"} cadastrado${registeredProducts === 1 ? "" : "s"} com estoque inicial.` };
        if (orders && sales) return { message: `${orders} pedido${orders === 1 ? "" : "s"} criado${orders === 1 ? "" : "s"} e ${sales} venda${sales === 1 ? "" : "s"} registrada${sales === 1 ? "" : "s"}.` };
        if (orders) return { message: `${orders} pedido${orders === 1 ? "" : "s"} criado${orders === 1 ? "" : "s"} em Recebido.` };
        if (sales && stockChanges) return { message: `${completed} operações registradas: vendas e estoque atualizados.` };
        if (sales) return { message: `${sales} venda${sales === 1 ? "" : "s"} registrada${sales === 1 ? "" : "s"} e estoque atualizado.` };
        return { message: `${stockChanges} movimentaç${stockChanges === 1 ? "ão" : "ões"} registradas e estoque atualizado.` };
      });
      return response.json(jsonData(result));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const messages: Record<string, [number, string, string]> = {
        SALE_PAYMENT_REQUIRED: [400, "SALE_PAYMENT_REQUIRED", "Escolha a forma de pagamento antes de confirmar a venda."],
        GIFT_PAYMENT_MUST_BE_ZERO: [400, "GIFT_PAYMENT_MUST_BE_ZERO", "Uma venda como brinde precisa ter valor total zero."],
        ASSISTANT_ADJUSTMENT_NOTE_REQUIRED: [400, "ASSISTANT_ADJUSTMENT_NOTE_REQUIRED", "Escolha uma justificativa para o preço diferente do cadastro."],
        CREDIT_CUSTOMER_REQUIRED: [400, "CREDIT_CUSTOMER_REQUIRED", "Selecione o cliente do crediário."],
        CREDIT_ACCOUNT_NOT_FOUND: [404, "CREDIT_ACCOUNT_NOT_FOUND", "O cliente não possui conta de crediário."],
        CREDIT_LIMIT_EXCEEDED: [409, "CREDIT_LIMIT_EXCEEDED", "O limite de crédito seria ultrapassado."],
      };
      const result = messages[code];
      return response.status(result?.[0] ?? 409).json(jsonError(result?.[1] ?? "OPERATION_CONFLICT", result?.[2] ?? (error instanceof Error ? error.message : "Não foi possível registrar."), result?.[0] ?? 409));
    }
  }
}
