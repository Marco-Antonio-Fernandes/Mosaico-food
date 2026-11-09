export type FoodProduct = {
  id: string;
  name: string;
  productName: string;
  flavor: string | null;
  familyName: string;
  category: string;
  aliases: string[];
  variants: FoodProductVariant[];
  customization: FoodProductCustomization | null;
  costPriceCents: number;
  costBreakdown: FoodCostBreakdown | null;
  salePriceCents: number;
  stockQuantity: number;
  unpreparedQuantity: number;
  preparationCapacity: number;
  saleCapacity: number;
  productionMode: "frozen" | "ready" | "made_here" | "resale" | "recipe" | "ingredient";
  stockUnit: "un" | "g" | "ml";
  unitWeightGrams: number | null;
  unitVolumeMl: number | null;
  recipe: { ingredientId: string; quantity: number }[];
  ingredientDependencies: { ingredientId: string; name: string; stockQuantity: number; stockUnit: "un" | "g" | "ml"; available: boolean }[];
  allowOnDemand: boolean;
  fryToOrder: boolean;
  active: boolean;
  fiscalNcm: string | null;
  fiscalCest: string | null;
  fiscalGtin: string | null;
  fiscalUnit: "UN" | "KG" | "G" | "L" | "ML" | null;
  fiscalCfop: string | null;
  fiscalOrigin: number | null;
  fiscalCst: string | null;
  fiscalCsosn: string | null;
  fiscalPisCst: string | null;
  fiscalCofinsCst: string | null;
  fiscalBenefitCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FoodCostUnit = "g" | "kg" | "ml" | "l" | "un";

export type FoodCostBreakdownItem = {
  ingredientId?: string;
  name: string;
  packageQuantity: number;
  packageUnit: FoodCostUnit;
  packageCostCents: number;
  usedQuantity: number;
  usedUnit: FoodCostUnit;
};

export type FoodCostBreakdown = {
  yieldQuantity: number;
  items: FoodCostBreakdownItem[];
};

export type FoodProductCustomization = {
  label: string;
  unit: string;
  baseQuantity: number;
  additionalUnitPriceCents: number;
  allowRemoval: boolean;
};

export type FoodProductVariant = {
  id: string;
  name: string;
  aliases: string[];
  priceDeltaCents: number;
};

export type FoodMessage = {
  mediaType?: string | null;
  transcriptionStatus?: string | null;
  mediaUrl?: string | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationAddress?: string | null;
  needsHuman?: boolean;
  source?: string | null;
  id: string;
  conversationId: string;
  providerMessageId: string;
  direction: "inbound" | "outbound";
  body: string | null;
  createdAt: string;
  processedAt: string | null;
};

export type FoodCustomer = {
  id: string;
  name: string;
  phone: string;
  automationEnabled: boolean;
};

export type FoodConversation = {
  id: string;
  sessionId: string;
  remoteJid: string;
  state: string;
  automationPaused: boolean;
  lastMessageAt: string | null;
  customer: FoodCustomer | null;
  lastMessage: FoodMessage | null;
};

export type FoodNotification = {
  id: string;
  conversationId: string;
  providerMessageId: string;
  body: string | null;
  createdAt: string;
  customerName: string;
  remoteJid: string;
  automationPaused: boolean;
  needsHuman: boolean;
};

export type FoodStockNotification = {
  id: string;
  productName: string;
  ingredientName: string;
  quantity: number;
  yieldQuantity: number;
  createdAt: string;
};

export type FoodRelayMessage = {
  id: string;
  providerMessageId: string;
  sessionId: string;
  conversationId: string;
  remoteJid: string;
  customerName: string | null;
  body: string | null;
  mediaType: string | null;
  transcriptionStatus: string | null;
  locationLatitude: number | null;
  locationLongitude: number | null;
  locationAddress: string | null;
  direction: "inbound" | "outbound";
  source: string;
  createdAt: string;
};

export type FoodRelayReply = {
  conversationId: string;
  remoteJid: string;
  body: string;
};

export type ProductInput = {
  productionMode: FoodProduct["productionMode"];
  stockUnit: FoodProduct["stockUnit"];
  unitWeightGrams: number | null;
  unitVolumeMl: number | null;
  recipe: FoodProduct["recipe"];
  unpreparedQuantity: number;
  name: string;
  productName?: string;
  flavor?: string | null;
  category: string;
  aliases: string[];
  variants: FoodProductVariant[];
  costPriceCents: number;
  costBreakdown?: FoodCostBreakdown | null;
  salePriceCents: number;
  stockQuantity: number;
  allowOnDemand: boolean;
  fryToOrder: boolean;
  active: boolean;
  customization?: FoodProductCustomization | null;
  fiscalNcm?: string | null;
  fiscalCest?: string | null;
  fiscalGtin?: string | null;
  fiscalUnit?: FoodProduct["fiscalUnit"];
  fiscalCfop?: string | null;
  fiscalOrigin?: number | null;
  fiscalCst?: string | null;
  fiscalCsosn?: string | null;
  fiscalPisCst?: string | null;
  fiscalCofinsCst?: string | null;
  fiscalBenefitCode?: string | null;
};

export type FoodFiscalFieldIssue = { field: string; message: string };

export type FoodFiscalStatus = {
  configured: boolean;
  provider: string;
  model: 55 | 65 | number;
  environment: "homologation" | "production" | string;
  uf: string;
  crt: number;
  automaticIssuance: boolean;
};

export type FoodFiscalDocument = {
  id: string;
  sourceType: "counter_sale" | "order_item" | string;
  sourceId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  model: number;
  environment: string;
  status: "pending" | "issued" | "error" | "cancelled" | string;
  provider: string;
  providerInvoiceId: string | null;
  accessKey: string | null;
  protocol: string | null;
  number: number | null;
  series: number | null;
  qrCode: string | null;
  publicUrl: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  issuedAt: string | null;
};

export type FoodFiscalSource = {
  sourceType: "counter_sale" | "order_item";
  sourceId: string;
  productId: string;
  productName: string;
  quantity: number;
  totalCents: number;
  paymentMethod: SalePaymentMethod | string | null;
  fulfillment?: string;
  createdAt: string;
  fiscal: { ready: boolean; missing: FoodFiscalFieldIssue[] };
  product?: FoodFiscalProductSnapshot;
  document: FoodFiscalDocument | null;
};

export type FoodFiscalProductSnapshot = Pick<FoodProduct, "id" | "name" | "fiscalNcm" | "fiscalCest" | "fiscalGtin" | "fiscalUnit" | "fiscalCfop" | "fiscalOrigin" | "fiscalCst" | "fiscalCsosn" | "fiscalPisCst" | "fiscalCofinsCst" | "fiscalBenefitCode">;

export type FoodFiscalBuyer = {
  document?: string;
  name?: string;
  email?: string;
  address?: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    ibge: number;
    uf: string;
    cep: string;
  };
};

export type FoodFiscalIssueInput = {
  sourceType: FoodFiscalSource["sourceType"];
  sourceId: string;
  productId: string;
  quantity?: number;
  paymentMethod?: string | null;
  buyer?: FoodFiscalBuyer;
  sourceSnapshot?: {
    product: FoodFiscalProductSnapshot;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    paymentMethod: string | null;
    paymentStatus: string;
    fulfillment: string;
  };
};

export type FoodNotasemtupeStatus = {
  configured: boolean;
  reachable: boolean;
  authenticated: boolean;
  baseUrl: string;
  company: { id: string; name: string; cnpj: string } | null;
  error: string | null;
};

export type FoodNotasemtupeSyncResult = {
  configured: boolean;
  synced: boolean;
  skipped: boolean;
  duplicate?: boolean;
  invoice?: Record<string, unknown>;
  message: string;
};

export type FoodFiscalIssueResult = {
  document: FoodFiscalDocument;
  integration: FoodNotasemtupeSyncResult;
};

export type FoodOrderItem = {
  id: string;
  productId: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  fryNow: boolean;
  adjustmentCents: number;
  adjustmentNote: string | null;
  isGift: boolean;
};

export type FoodOrder = {
  id: string;
  customerName: string | null;
  status: string;
  fulfillment: "pickup" | "delivery" | string;
  deliveryAddress: string | null;
  totalCents: number;
  cashReceivedCents: number | null;
  cashChangeCents: number | null;
  source: string;
  paymentMethod: SalePaymentMethod | null;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
  customer: FoodCustomer | null;
  items: FoodOrderItem[];
};

export type FoodOrderScheduleItem = {
  id: string;
  scheduleId: string;
  productId: string | null;
  productName: string;
  flavor: string | null;
  quantity: number;
};

export type FoodOrderSchedule = {
  id: string;
  name: string;
  active: boolean;
  frequency: "daily" | "weekly" | string;
  weekdaysJson: string;
  timeLocal: string;
  fulfillment: "pickup" | "delivery" | string;
  deliveryAddress: string | null;
  nextRunAt: string;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  items: FoodOrderScheduleItem[];
};

// O Electron usa o backend local para produtos, estoque, vendas e banco.
// As rotas da integração do WhatsApp usam sempre o servidor remoto.
const remoteApiBaseUrl = (import.meta.env.VITE_MOSAICO_REMOTE_BACKEND_URL || import.meta.env.VITE_MOSAICO_BACKEND_URL || "https://mosaico.rotatix.com.br").replace(/\/$/, "");
const apiKey = import.meta.env.VITE_MOSAICO_API_KEY || "";
let apiBaseUrlPromise: Promise<string> | null = null;

function activeAccountId(): string | null {
  try {
    const raw = window.localStorage.getItem("mosaico-active-account");
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const id = (parsed as { id?: unknown }).id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

function addAccountHeader(headers: Headers): void {
  const accountId = activeAccountId();
  if (accountId) headers.set("X-Mosaico-Account-Id", accountId);
}

function getApiBaseUrl() {
  if (!apiBaseUrlPromise) {
    const bridge = window.mosaicoDesktop;
    apiBaseUrlPromise = bridge
      ? bridge.getBackendUrl().then((url) => url.replace(/\/$/, "")).catch(() => {
        apiBaseUrlPromise = null;
        throw new Error("Backend local do Mosaico Food indisponível.");
      })
      : Promise.resolve(remoteApiBaseUrl);
  }
  return apiBaseUrlPromise;
}

export type ReceivedPaymentMethod = "pix" | "cash" | "card_credit" | "card_debit" | "meal_voucher";
export type SalePaymentMethod = ReceivedPaymentMethod | "crediario" | "brinde";
export const PRICE_ADJUSTMENT_REASONS = ["Menos fresco", "Decisão do dono"] as const;
export type AssistantDraft = { id: string; action: "order" | "sale" | "prepare" | "loss" | "receive_ready" | "receive_unprepared"; quantity: number; productName: string; totalCents: number; baseUnitPriceCents?: number; paymentMethod: SalePaymentMethod | null };
export type AssistantRegistrationDraft = { id: string; name: string; quantity: number; stockUnit: "un" | "g" | "ml"; unitWeightGrams: number | null; unitVolumeMl: number | null };
export type AssistantRegistrationQuestion = { kind: "quantity" | "unit" | "name"; name?: string; quantity?: number; stockUnit?: "un" | "g" | "ml" };
export function assistantPreview(text: string, productId?: string) {
  return foodApi<{ draft?: AssistantDraft; drafts?: AssistantDraft[]; registration?: AssistantRegistrationDraft; registrationQuestion?: AssistantRegistrationQuestion; message?: string; choices?: { id: string; name: string; stockQuantity?: number; unpreparedQuantity?: number }[] }>("/api/v1/food/assistant/preview", { method: "POST", body: JSON.stringify({ text, productId }) });
}
export function assistantConfirm(draftId: string, totalCents: number, paymentMethod: SalePaymentMethod | null, creditCustomerId?: string, adjustmentNote?: string | null) {
  return foodApi<{ message: string }>("/api/v1/food/assistant/confirm", { method: "POST", body: JSON.stringify({ draftId, totalCents, paymentMethod, ...(creditCustomerId ? { creditCustomerId } : {}), ...(adjustmentNote ? { adjustmentNote } : {}) }) });
}
export function assistantConfirmBatch(drafts: { draftId: string; totalCents: number; paymentMethod: SalePaymentMethod | null; creditCustomerId?: string; adjustmentNote?: string | null }[], registrations: { draftId: string }[] = []) {
  return foodApi<{ message: string }>("/api/v1/food/assistant/confirm", { method: "POST", body: JSON.stringify({ ...(drafts.length ? { drafts } : {}), ...(registrations.length ? { registrations } : {}) }) });
}
export type FoodTranscriptionResult = {
  available: boolean;
  text: string | null;
  understood: boolean;
};

export function transcribeFoodAudio(audio: Blob, prompt = ""): Promise<FoodTranscriptionResult> {
  const localTranscriber = window.mosaicoDesktop?.transcribeAudio;
  if (localTranscriber) {
    return audio.arrayBuffer().then((buffer) => localTranscriber(buffer, audio.type || "audio/wav", prompt)).then((localResult) => {
      if (localResult.available) return { available: true, text: localResult.text, understood: localResult.understood };
      return { available: false, text: null, understood: false };
    });
  }
  return foodApi<FoodTranscriptionResult>("/api/v1/food/speech", { method: "POST", headers: { "Content-Type": audio.type || "application/octet-stream", ...(prompt ? { "X-Whisper-Prompt": prompt } : {}) }, body: audio });
}

export function interpretFoodText(text: string, products: FoodProduct[]): Promise<FoodTranscriptionResult> {
  const localInterpreter = window.mosaicoDesktop?.interpretText;
  if (!localInterpreter) return Promise.resolve({ available: false, text: null, understood: false });
  return localInterpreter(text, products.map(product => ({ name: product.name, aliases: product.aliases })))
    .then(result => ({ available: result.available, text: result.text, understood: result.understood }))
    .catch(() => ({ available: true, text: null, understood: false }));
}

export type CounterSaleItemInput = {
  productId: string;
  quantity: number;
  unitPriceCents: number;
  customization?: { selectedQuantity?: number; removedQuantity?: number; addedItems?: string[] } | null;
  adjustmentCents?: number;
  adjustmentNote?: string | null;
  isGift?: boolean;
};

export function registerCounterSale(input: { operationId: string; paymentMethod: SalePaymentMethod; creditCustomerId?: string | null; items: CounterSaleItemInput[] }) {
  return foodApi<{ message: string }>("/api/v1/food/sales", { method: "POST", body: JSON.stringify(input) });
}

export type FoodCashSnapshot = {
  session: {
    id: string;
    businessDate: string;
    status: "open" | "closed" | string;
    openingCashCents: number;
    expectedCashCents: number | null;
    countedCashCents: number | null;
    differenceCents: number | null;
    openedAt: string;
    closedAt: string | null;
    notes: string | null;
  } | null;
  totals: {
    pix: number;
    cash: number;
    card_credit: number;
    card_debit: number;
    meal_voucher: number;
    crediario: number;
  };
  expectedCashCents: number;
};

export function getFoodCashToday() {
  return foodApi<FoodCashSnapshot>("/api/v1/food/cash/today");
}

export function openFoodCash(openingCashCents: number) {
  return foodApi<FoodCashSnapshot>("/api/v1/food/cash/open", { method: "POST", body: JSON.stringify({ openingCashCents }) });
}

export function closeFoodCash(countedCashCents: number, notes?: string) {
  return foodApi<FoodCashSnapshot>("/api/v1/food/cash/close", { method: "POST", body: JSON.stringify({ countedCashCents, notes: notes?.trim() || null }) });
}

export function getFoodFiscalStatus() {
  return remoteFoodApi<FoodFiscalStatus>("/api/v1/food/fiscal/status", {}, "o módulo fiscal remoto");
}

export async function getFoodFiscalSources() {
  const data = await foodApi<{ sources: FoodFiscalSource[] }>("/api/v1/food/fiscal/sources");
  return Array.isArray(data.sources) ? data.sources : [];
}

export async function getFoodFiscalDocuments() {
  const data = await remoteFoodApi<{ documents: FoodFiscalDocument[] }>("/api/v1/food/fiscal/documents", {}, "o módulo fiscal remoto");
  return Array.isArray(data.documents) ? data.documents : [];
}

export function getFoodNotasemtupeStatus() {
  return foodApi<FoodNotasemtupeStatus>("/api/v1/food/fiscal/notasemtupe/status");
}

export function syncFoodFiscalDocumentWithNotasemtupe(input: FoodFiscalIssueInput, document: FoodFiscalDocument) {
  const snapshot = input.sourceSnapshot;
  return foodApi<FoodNotasemtupeSyncResult>("/api/v1/food/fiscal/notasemtupe/sync", {
    method: "POST",
    body: JSON.stringify({
      externalId: `mosaico-food:${input.sourceType}:${input.sourceId}`,
      productName: snapshot?.product.name || document.productName,
      quantity: input.quantity || snapshot?.quantity || document.quantity,
      unitPriceCents: snapshot?.unitPriceCents ?? document.unitPriceCents,
      client: input.buyer?.name?.trim() || "Consumidor final",
      clientDocument: input.buyer?.document?.trim() || null,
      status: document.status === "issued" ? "Autorizada" : "Rascunho",
      environment: document.environment,
      protocol: document.protocol,
      accessKey: document.accessKey,
    }),
  });
}

export async function issueFoodFiscalDocument(input: FoodFiscalIssueInput): Promise<FoodFiscalIssueResult> {
  const data = await remoteFoodApi<{ document: FoodFiscalDocument }>("/api/v1/food/fiscal/documents/issue", { method: "POST", body: JSON.stringify(input) }, "o módulo fiscal remoto");
  let integration: FoodNotasemtupeSyncResult;
  try {
    integration = await syncFoodFiscalDocumentWithNotasemtupe(input, data.document);
  } catch (error) {
    integration = {
      configured: true,
      synced: false,
      skipped: false,
      message: `Nota processada, mas a centralização falhou: ${error instanceof Error ? error.message : "erro desconhecido"}`,
    };
  }
  return { document: data.document, integration };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function errorMessage(payload: unknown, fallback: string) {
  const error = asRecord(asRecord(payload).error);
  return typeof error.message === "string" ? error.message : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeFoodProduct(value: unknown): FoodProduct | null {
  const product = asRecord(value);
  if (typeof product.id !== "string" || typeof product.name !== "string") return null;

  const variants = Array.isArray(product.variants)
    ? product.variants.flatMap((value) => {
        const variant = asRecord(value);
        if (typeof variant.id !== "string" || typeof variant.name !== "string") return [];
        return [{
          id: variant.id,
          name: variant.name,
          aliases: stringArray(variant.aliases),
          priceDeltaCents: typeof variant.priceDeltaCents === "number" ? variant.priceDeltaCents : 0,
        }];
      })
    : [];

  return {
    id: product.id,
    name: product.name,
    productName: typeof product.productName === "string" && product.productName.trim() ? product.productName : (typeof product.familyName === "string" && product.familyName.trim() ? product.familyName : product.name),
    flavor: typeof product.flavor === "string" && product.flavor.trim() ? product.flavor : null,
    familyName: typeof product.familyName === "string" && product.familyName.trim() ? product.familyName : product.name.split(/\s+(?:de|da|do|das|dos|com)\s+/i)[0].trim() || product.name,
    category: typeof product.category === "string" ? product.category : "Geral",
    aliases: stringArray(product.aliases),
    variants,
    customization: (() => {
      const customization = asRecord(product.customization);
      if (typeof customization.label !== "string" || typeof customization.unit !== "string" || typeof customization.baseQuantity !== "number" || typeof customization.additionalUnitPriceCents !== "number") return null;
      return {
        label: customization.label,
        unit: customization.unit,
        baseQuantity: customization.baseQuantity,
        additionalUnitPriceCents: customization.additionalUnitPriceCents,
        allowRemoval: customization.allowRemoval !== false,
      } satisfies FoodProductCustomization;
    })(),
    costPriceCents: typeof product.costPriceCents === "number" ? product.costPriceCents : 0,
    costBreakdown: (() => {
      const breakdown = asRecord(product.costBreakdown);
      const validUnits = new Set<FoodCostUnit>(["g", "kg", "ml", "l", "un"]);
      const items = Array.isArray(breakdown.items) ? breakdown.items.flatMap(value => {
        const item = asRecord(value);
        const packageUnit = item.packageUnit;
        const usedUnit = item.usedUnit;
        if (typeof item.name !== "string" || typeof item.packageQuantity !== "number" || typeof item.packageCostCents !== "number" || typeof item.usedQuantity !== "number" || typeof packageUnit !== "string" || typeof usedUnit !== "string" || !validUnits.has(packageUnit as FoodCostUnit) || !validUnits.has(usedUnit as FoodCostUnit)) return [];
        return [{
          name: item.name,
          packageQuantity: item.packageQuantity,
          packageUnit: packageUnit as FoodCostUnit,
          packageCostCents: item.packageCostCents,
          usedQuantity: item.usedQuantity,
          usedUnit: usedUnit as FoodCostUnit,
        } satisfies FoodCostBreakdownItem];
      }) : [];
      return typeof breakdown.yieldQuantity === "number" && breakdown.yieldQuantity > 0 && items.length > 0 ? { yieldQuantity: breakdown.yieldQuantity, items } satisfies FoodCostBreakdown : null;
    })(),
    salePriceCents: typeof product.salePriceCents === "number" ? product.salePriceCents : 0,
    stockQuantity: typeof product.stockQuantity === "number" ? product.stockQuantity : 0,
    unpreparedQuantity: typeof product.unpreparedQuantity === "number" ? product.unpreparedQuantity : 0,
    preparationCapacity: typeof product.preparationCapacity === "number" ? product.preparationCapacity : 0,
    saleCapacity: typeof product.saleCapacity === "number" ? product.saleCapacity : (typeof product.stockQuantity === "number" ? product.stockQuantity : 0),
    productionMode: typeof product.productionMode === "string" && ["frozen", "ready", "made_here", "resale", "recipe", "ingredient"].includes(product.productionMode) ? product.productionMode as FoodProduct["productionMode"] : "frozen",
    stockUnit: product.stockUnit === "g" || product.stockUnit === "ml" ? product.stockUnit : "un",
    unitWeightGrams: typeof product.unitWeightGrams === "number" ? product.unitWeightGrams : null,
    unitVolumeMl: typeof product.unitVolumeMl === "number" ? product.unitVolumeMl : null,
    recipe: Array.isArray(product.recipe) ? product.recipe.flatMap(value => {
      const row = asRecord(value);
      return typeof row.ingredientId === "string" && typeof row.quantity === "number" ? [{ ingredientId: row.ingredientId, quantity: row.quantity }] : [];
    }) : [],
    ingredientDependencies: Array.isArray(product.ingredientDependencies) ? product.ingredientDependencies.flatMap(value => {
      const dependency = asRecord(value);
      if (typeof dependency.ingredientId !== "string" || typeof dependency.name !== "string") return [];
      return [{
        ingredientId: dependency.ingredientId,
        name: dependency.name,
        stockQuantity: typeof dependency.stockQuantity === "number" ? dependency.stockQuantity : 0,
        stockUnit: dependency.stockUnit === "g" || dependency.stockUnit === "ml" ? dependency.stockUnit : "un" as const,
        available: dependency.available === true,
      }];
    }) : [],
    allowOnDemand: product.allowOnDemand === true,
    fryToOrder: product.fryToOrder === true,
    active: product.active !== false,
    fiscalNcm: typeof product.fiscalNcm === "string" && product.fiscalNcm.trim() ? product.fiscalNcm : null,
    fiscalCest: typeof product.fiscalCest === "string" && product.fiscalCest.trim() ? product.fiscalCest : null,
    fiscalGtin: typeof product.fiscalGtin === "string" && product.fiscalGtin.trim() ? product.fiscalGtin : null,
    fiscalUnit: product.fiscalUnit === "UN" || product.fiscalUnit === "KG" || product.fiscalUnit === "G" || product.fiscalUnit === "L" || product.fiscalUnit === "ML" ? product.fiscalUnit : null,
    fiscalCfop: typeof product.fiscalCfop === "string" && product.fiscalCfop.trim() ? product.fiscalCfop : null,
    fiscalOrigin: typeof product.fiscalOrigin === "number" ? product.fiscalOrigin : null,
    fiscalCst: typeof product.fiscalCst === "string" && product.fiscalCst.trim() ? product.fiscalCst : null,
    fiscalCsosn: typeof product.fiscalCsosn === "string" && product.fiscalCsosn.trim() ? product.fiscalCsosn : null,
    fiscalPisCst: typeof product.fiscalPisCst === "string" && product.fiscalPisCst.trim() ? product.fiscalPisCst : null,
    fiscalCofinsCst: typeof product.fiscalCofinsCst === "string" && product.fiscalCofinsCst.trim() ? product.fiscalCofinsCst : null,
    fiscalBenefitCode: typeof product.fiscalBenefitCode === "string" && product.fiscalBenefitCode.trim() ? product.fiscalBenefitCode : null,
    createdAt: typeof product.createdAt === "string" ? product.createdAt : "",
    updatedAt: typeof product.updatedAt === "string" ? product.updatedAt : "",
  };
}

export async function foodApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (apiKey) headers.set("X-API-Key", apiKey);
  addAccountHeader(headers);

  const response = await fetch(`${await getApiBaseUrl()}${path}`, { ...init, headers });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, "Não foi possível acessar o backend do Mosaico Food."));

  const data = asRecord(payload).data;
  return data as T;
}

async function remoteFoodApi<T>(path: string, init: RequestInit = {}, context = "o servidor remoto do Mosaico Food"): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (apiKey) headers.set("X-API-Key", apiKey);
  addAccountHeader(headers);

  let response: Response;
  try {
    response = await fetch(`${remoteApiBaseUrl}${path}`, { ...init, headers });
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
    throw new Error(`${context} indisponível em ${remoteApiBaseUrl}${detail}`);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = errorMessage(payload, `Não foi possível acessar ${context}.`);
    throw new Error(`${message} (HTTP ${response.status} em ${remoteApiBaseUrl}${path})`);
  }
  return asRecord(payload).data as T;
}

export type FoodRemoteWhatsappStatus = {
  state: "unknown" | "online" | "offline";
  label: string;
  message?: string;
};

export type MosaicoAccountInput = {
  id: string;
  name: string;
  cnpj: string;
  city?: string;
};

export type MosaicoAccountSyncResult = {
  account: { id: string; name: string; cnpj: string; city: string };
  integration: {
    configured: boolean;
    provisioned: boolean;
    companyId: string | null;
    message: string;
  };
};

export function upsertMosaicoAccount(input: MosaicoAccountInput) {
  return foodApi<MosaicoAccountSyncResult>("/api/v1/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

function normalizeRemoteWhatsappStatus(payload: unknown): FoodRemoteWhatsappStatus {
  const root = asRecord(payload);
  const nested = asRecord(root.data);
  const candidates = [
    root.status,
    root.state,
    root.connection,
    root.connectionState,
    nested.status,
    nested.state,
    nested.connection,
    nested.connectionState,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const rawStatus = candidates[0]?.trim() || "";
  const normalized = rawStatus.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const connected = [root.connected, root.isConnected, nested.connected, nested.isConnected].find(value => typeof value === "boolean");

  if (connected === false || /disconnected|desconectad|offline|closed|fechado|logout|logged.?out|not.?configured|unavailable|indisponivel|error|erro/.test(normalized)) {
    return {
      state: "offline",
      label: "WhatsApp remoto indisponível",
      message: rawStatus ? `O servidor informou: ${rawStatus}.` : undefined,
    };
  }
  if (connected === true || /connected|conectad|online|open|aberto|ready|pronto|authenticated|autenticad/.test(normalized)) {
    return { state: "online", label: "WhatsApp remoto conectado" };
  }
  return { state: "unknown", label: "WhatsApp remoto aguardando status" };
}

export async function getFoodRemoteWhatsappStatus() {
  const data = await remoteFoodApi<unknown>("/api/v1/whatsapp/status");
  return normalizeRemoteWhatsappStatus(data);
}

export async function getFoodRelayMessages() {
  const data = await remoteFoodApi<{ messages: FoodRelayMessage[] }>("/api/v1/whatsapp/relay/messages");
  return Array.isArray(data.messages) ? data.messages : [];
}

export async function getFoodRelayAudio(messageId: string) {
  const headers = new Headers({ Accept: "audio/*" });
  if (apiKey) headers.set("X-API-Key", apiKey);
  let response: Response;
  try {
    response = await fetch(`${remoteApiBaseUrl}/api/v1/whatsapp/relay/messages/${encodeURIComponent(messageId)}/audio`, { headers });
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
    throw new Error(`Servidor remoto do WhatsApp indisponível em ${remoteApiBaseUrl}${detail}`);
  }
  if (!response.ok) {
    throw new Error(`Não foi possível baixar o áudio do WhatsApp (HTTP ${response.status} em ${remoteApiBaseUrl}/api/v1/whatsapp/relay/messages/${encodeURIComponent(messageId)}/audio).`);
  }
  return response.blob();
}

export async function acknowledgeFoodRelayMessage(messageId: string) {
  return remoteFoodApi<{ ok: boolean }>(`/api/v1/whatsapp/relay/messages/${encodeURIComponent(messageId)}/ack`, { method: "POST" });
}

export async function sendFoodRelayMessage(remoteJid: string, text: string) {
  return remoteFoodApi<{ providerMessageId: string | null }>("/api/v1/whatsapp/relay/send", {
    method: "POST",
    body: JSON.stringify({ remoteJid, text }),
  });
}

export async function ingestFoodRelayMessage(input: {
  providerMessageId: string;
  sessionId: string;
  remoteJid: string;
  customerName?: string | null;
  body: string | null;
  mediaType?: string | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationAddress?: string | null;
  createdAt?: string;
  direction?: "inbound" | "outbound";
}) {
  return foodApi<{
    conversationId: string;
    message: FoodMessage;
    replies: FoodRelayReply[];
    errors?: string[];
  }>("/api/v1/food/relay/ingest", { method: "POST", body: JSON.stringify(input) });
}

export async function getFoodProducts(options: { activeOnly?: boolean; availableOnly?: boolean } = {}) {
  const params = new URLSearchParams();
  if (options.activeOnly) params.set("active", "true");
  if (options.availableOnly) params.set("available", "true");
  const query = params.toString() ? `?${params.toString()}` : "";
  const data = await foodApi<{ products: FoodProduct[] }>(`/api/v1/food/products${query}`);
  return (Array.isArray(data.products) ? data.products : [])
    .map(normalizeFoodProduct)
    .filter((product): product is FoodProduct => Boolean(product));
}

export async function createFoodProduct(input: ProductInput) {
  const data = await foodApi<{ product: FoodProduct }>("/api/v1/food/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const product = normalizeFoodProduct(data.product);
  if (!product) throw new Error("O backend devolveu um produto inválido.");
  return product;
}

export async function createFoodProducts(inputs: ProductInput[]) {
  const data = await foodApi<{ products: FoodProduct[] }>("/api/v1/food/products/batch", {
    method: "POST",
    body: JSON.stringify({ products: inputs }),
  });
  const products = (Array.isArray(data.products) ? data.products : [])
    .map(normalizeFoodProduct)
    .filter((product): product is FoodProduct => Boolean(product));
  if (products.length !== inputs.length) throw new Error("O backend devolveu produtos inválidos.");
  return products;
}

export async function updateFoodProduct(id: string, input: Partial<ProductInput>) {
  const data = await foodApi<{ product: FoodProduct }>(`/api/v1/food/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  const product = normalizeFoodProduct(data.product);
  if (!product) throw new Error("O backend devolveu um produto inválido.");
  return product;
}

export type FoodLossSummary = {
  productId: string;
  productName: string;
  lossQuantity: number;
  periodStart: string;
};

export async function getFoodProductLossSummary(id: string) {
  return foodApi<FoodLossSummary>(`/api/v1/food/products/${encodeURIComponent(id)}/loss-summary`);
}

export async function deleteFoodProduct(id: string) {
  const data = await foodApi<{ product: FoodProduct }>(`/api/v1/food/products/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const product = normalizeFoodProduct(data.product);
  if (!product) throw new Error("O backend devolveu um produto inválido.");
  return product;
}

export async function getFoodConversations() {
  const data = await foodApi<{ conversations: FoodConversation[] }>("/api/v1/food/conversations");
  return data.conversations;
}

export type FoodConversationLog = {
  format: "mosaico-food-conversation-log";
  version: number;
  exportedAt: string;
  period: { from: string; to: string; timezone: string };
  conversations: unknown[];
};

export async function exportFoodConversationLog(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString() ? `?${params.toString()}` : "";
  return foodApi<FoodConversationLog>(`/api/v1/food/conversations/export${query}`);
}

export async function registerFoodStock(id: string, input: { operationId: string; action: "receive_ready" | "receive_unprepared" | "prepare" | "loss" | "loss_ready" | "loss_unprepared" | "loss_split"; quantity?: number; readyQuantity?: number; unpreparedQuantity?: number }) {
  return foodApi(`/api/v1/food/products/${encodeURIComponent(id)}/stock`, { method: "POST", body: JSON.stringify(input) });
}

export async function getFoodMessages(conversationId: string) {
  const data = await foodApi<{ messages: FoodMessage[] }>(`/api/v1/food/conversations/${encodeURIComponent(conversationId)}/messages`);
  return data.messages;
}

export async function getFoodMessageAudio(conversationId: string, messageId: string) {
  const headers = new Headers({ Accept: "audio/*" });
  if (apiKey) headers.set("X-API-Key", apiKey);
  const response = await fetch(`${await getApiBaseUrl()}/api/v1/food/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/audio`, { headers });
  if (!response.ok) throw new Error("Não foi possível baixar o áudio do atendimento.");
  return response.blob();
}

export async function getFoodMessageMedia(conversationId: string, messageId: string) {
  const headers = new Headers({ Accept: "image/*, audio/*" });
  if (apiKey) headers.set("X-API-Key", apiKey);
  const response = await fetch(`${await getApiBaseUrl()}/api/v1/food/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/media`, { headers });
  if (!response.ok) throw new Error("Não foi possível carregar a mídia do WhatsApp.");
  return response.blob();
}

export async function submitFoodMessageTranscription(conversationId: string, messageId: string, text: string) {
  return foodApi<{ message: FoodMessage }>(`/api/v1/food/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/transcription`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function getFoodNotifications(after?: string) {
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  const data = await foodApi<{ notifications: FoodNotification[] }>(`/api/v1/whatsapp/notifications${query}`);
  return Array.isArray(data.notifications) ? data.notifications : [];
}

export async function getFoodStockNotifications() {
  const data = await foodApi<{ notifications: FoodStockNotification[] }>("/api/v1/food/stock-notifications");
  return Array.isArray(data.notifications) ? data.notifications : [];
}

export function confirmFoodStockNotification(id: string) {
  return foodApi<{ message: string }>(`/api/v1/food/stock-notifications/${encodeURIComponent(id)}/confirm`, { method: "POST", body: JSON.stringify({}) });
}

export function dismissFoodStockNotification(id: string) {
  return foodApi<{ message: string }>(`/api/v1/food/stock-notifications/${encodeURIComponent(id)}/dismiss`, { method: "POST", body: JSON.stringify({}) });
}

export async function sendFoodMessage(conversationId: string, body: string) {
  const data = await foodApi<{ message: FoodMessage }>(`/api/v1/food/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  return data.message;
}

export async function setFoodConversationMode(conversationId: string, automationPaused: boolean) {
  const data = await foodApi<{ conversation: FoodConversation }>(`/api/v1/food/conversations/${encodeURIComponent(conversationId)}/mode`, {
    method: "PATCH",
    body: JSON.stringify({ automationPaused }),
  });
  return data.conversation;
}

export type FoodAutomationRunResult = {
  enabled: boolean;
  conversations: number;
  processedMessages: number;
  repliesSent: number;
  ordersCreated: number;
  skipped: number;
  errors: string[];
  replies: Array<{ conversationId: string; remoteJid: string; body: string }>;
  lastRunAt: string;
};

export async function runFoodAutomation(conversationId?: string) {
  return foodApi<FoodAutomationRunResult>("/api/v1/food-automation/run", {
    method: "POST",
    body: JSON.stringify(conversationId ? { conversationId } : {}),
  });
}

export async function setFoodCustomerAutomation(customerId: string, enabled: boolean) {
  const data = await foodApi<{
    customer: FoodCustomer;
    conversations: number;
  }>(`/api/v1/food/customers/${encodeURIComponent(customerId)}/automation`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
  return data;
}

export async function getFoodOrders(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await foodApi<{ orders: FoodOrder[] }>(`/api/v1/food/orders${query}`);
  return data.orders;
}

export async function cancelFoodOrder(id: string) {
  return updateFoodOrderStatus(id, "cancelled");
}

export async function getFoodOrderSchedules() {
  const data = await foodApi<{ schedules: FoodOrderSchedule[] }>("/api/v1/food/order-schedules");
  return data.schedules;
}

export async function createFoodOrderSchedule(input: {
  name: string;
  frequency: "daily" | "weekly";
  weekdays: number[];
  timeLocal: string;
  fulfillment?: "pickup" | "delivery";
  deliveryAddress?: string | null;
  items: Array<{ productId: string; quantity: number }>;
}) {
  const data = await foodApi<{ schedule: FoodOrderSchedule }>("/api/v1/food/order-schedules", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.schedule;
}

export type FoodOrderScheduleInput = {
  name: string;
  frequency: "daily" | "weekly";
  weekdays: number[];
  timeLocal: string;
  fulfillment?: "pickup" | "delivery";
  deliveryAddress?: string | null;
  items: Array<{ productId: string; quantity: number }>;
};

export async function updateFoodOrderSchedule(id: string, input: FoodOrderScheduleInput | { active: boolean }) {
  const data = await foodApi<{ schedule: FoodOrderSchedule }>(`/api/v1/food/order-schedules/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return data.schedule;
}

export async function deleteFoodOrderSchedule(id: string) {
  return foodApi<{ deleted: boolean; id: string }>(`/api/v1/food/order-schedules/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export type FoodBackup = {
  format: "mosaico-food-backup";
  version: 1;
  exportedAt: string;
  tables: Record<string, unknown[]>;
};

export async function exportFoodBackup() {
  const data = await foodApi<{ backup: FoodBackup }>("/api/v1/food/backups/export");
  return data.backup;
}

export async function importFoodBackup(backup: FoodBackup) {
  return foodApi<{ summary: { inserted: number; updated: number; skipped: number } }>("/api/v1/food/backups/import", {
    method: "POST",
    body: JSON.stringify(backup),
  });
}

export type FoodOrderItemInput = {
  productId: string;
  quantity: number;
  unitPriceCents: number;
  variantName?: string | null;
  fryNow?: boolean;
  readyQuantity?: number;
  prepareQuantity?: number;
  adjustmentCents?: number;
  adjustmentNote?: string | null;
  isGift?: boolean;
};

export function createFoodOrder(input: { source?: string; customerName?: string | null; fulfillment?: "pickup" | "delivery"; deliveryAddress?: string | null; paymentMethod?: SalePaymentMethod | null; cashReceivedCents?: number | null; items: FoodOrderItemInput[] }) {
  return foodApi<{ order: FoodOrder }>("/api/v1/food/orders", {
    method: "POST",
    body: JSON.stringify(input),
  }).then(data => data.order);
}

export async function updateFoodOrderStatus(id: string, status: string) {
  const data = await foodApi<{ order: FoodOrder; notification?: { sent: boolean; skipped: boolean } }>(`/api/v1/food/orders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return data;
}

export async function finalizeFoodOrder(id: string, paymentMethod: SalePaymentMethod, creditCustomerId?: string | null, adjustmentCents = 0, adjustmentNote?: string | null, cashReceivedCents?: number | null) {
  const data = await foodApi<{ order: FoodOrder; notification?: { sent: boolean; skipped: boolean } }>(`/api/v1/food/orders/${encodeURIComponent(id)}/finalize`, {
    method: "POST",
    body: JSON.stringify({ paymentMethod, ...(creditCustomerId ? { creditCustomerId } : {}), adjustmentCents, ...(adjustmentNote?.trim() ? { adjustmentNote: adjustmentNote.trim() } : {}), ...(cashReceivedCents !== undefined ? { cashReceivedCents } : {}) }),
  });
  return data;
}

export type FoodCounterSale = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  baseUnitPriceCents: number;
  adjustmentCents: number;
  adjustmentNote: string | null;
  isGift: boolean;
  totalCents: number;
  paymentMethod: SalePaymentMethod | null;
  paymentStatus: string;
  createdAt: string;
};

export async function getFoodSales() {
  const data = await foodApi<{ sales: FoodCounterSale[] }>("/api/v1/food/sales");
  return data.sales;
}

export type CreditCustomerRecord = {
  id: string;
  name: string;
  phone: string | null;
  creditAccount: { id: string; balanceCents: number; creditLimitCents: number | null } | null;
  creditStatus?: "on_time" | "late";
  lateDays?: number;
  lastPaymentAt?: string | null;
};
export type CreditEntryRecord = { id: string; creditAccountId: string; type: string; amountCents: number; note: string | null; occurredAt: string; operationId: string; creditAccount?: { customer?: { id: string; name: string } } };
export async function getCreditLedger() {
  const data = await foodApi<{ customers?: CreditCustomerRecord[]; entries?: CreditEntryRecord[] }>("/api/v1/credit-entries");
  return {
    customers: Array.isArray(data.customers) ? data.customers : [],
    entries: Array.isArray(data.entries) ? data.entries : [],
  };
}
export async function receiveCreditPayment(customerId: string, amountCents: number, paymentMethod: ReceivedPaymentMethod = "cash", operationId = crypto.randomUUID()) {
  return foodApi("/api/v1/credit-entries", { method: "POST", headers: { "Idempotency-Key": operationId }, body: JSON.stringify({ customerId, type: "payment", amountCents, paymentMethod, note: "Recebimento de crediário" }) });
}
