export type FoodProduct = {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  variants: FoodProductVariant[];
  salePriceCents: number;
  stockQuantity: number;
  unpreparedQuantity: number;
  preparationCapacity: number;
  productionMode: "resale" | "recipe" | "ingredient";
  stockUnit: "un" | "g" | "ml";
  recipe: { ingredientId: string; quantity: number }[];
  allowOnDemand: boolean;
  fryToOrder: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
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
};

export type ProductInput = {
  productionMode: FoodProduct["productionMode"];
  stockUnit: FoodProduct["stockUnit"];
  recipe: FoodProduct["recipe"];
  unpreparedQuantity: number;
  name: string;
  category: string;
  aliases: string[];
  variants: FoodProductVariant[];
  salePriceCents: number;
  stockQuantity: number;
  allowOnDemand: boolean;
  fryToOrder: boolean;
  active: boolean;
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
};

export type FoodOrder = {
  id: string;
  status: string;
  fulfillment: "pickup" | "delivery" | string;
  deliveryAddress: string | null;
  totalCents: number;
  source: string;
  createdAt: string;
  updatedAt: string;
  customer: FoodCustomer | null;
  items: FoodOrderItem[];
};

const configuredApiBaseUrl = (import.meta.env.VITE_MOSAICO_BACKEND_URL || "https://mosaico.rotatix.com.br").replace(/\/$/, "");
const apiKey = import.meta.env.VITE_MOSAICO_API_KEY || "";
let apiBaseUrlPromise: Promise<string> | null = null;

function getApiBaseUrl() {
  if (!apiBaseUrlPromise) {
    const bridge = window.mosaicoDesktop;
    apiBaseUrlPromise = bridge
      ? bridge.getBackendUrl().then((url) => url.replace(/\/$/, "")).catch(() => configuredApiBaseUrl)
      : Promise.resolve(configuredApiBaseUrl);
  }
  return apiBaseUrlPromise;
}

export type AssistantDraft = { id: string; action: "sale" | "prepare"; quantity: number; productName: string; totalCents: number; paymentMethod: "pix" | "cash" | "card" | null };
export function assistantPreview(text: string, productId?: string) {
  return foodApi<{ draft?: AssistantDraft; message?: string; choices?: { id: string; name: string }[] }>("/api/v1/food/assistant/preview", { method: "POST", body: JSON.stringify({ text, productId }) });
}
export function assistantConfirm(draftId: string, totalCents: number, paymentMethod: "pix" | "cash" | "card" | null) {
  return foodApi<{ message: string }>("/api/v1/food/assistant/confirm", { method: "POST", body: JSON.stringify({ draftId, totalCents, paymentMethod }) });
}
export function transcribeFoodAudio(audio: Blob) {
  const localTranscriber = window.mosaicoDesktop?.transcribeAudio;
  if (localTranscriber) {
    return audio.arrayBuffer().then((buffer) => localTranscriber(buffer, audio.type || "audio/wav")).then((localResult) => {
      if (localResult.available) return { text: localResult.text, understood: localResult.understood };
      return { text: null, understood: false };
    });
  }
  return foodApi<{ text: string | null; understood: boolean }>("/api/v1/food/speech", { method: "POST", headers: { "Content-Type": audio.type || "application/octet-stream" }, body: audio });
}

export function registerCounterSale(input: { operationId: string; paymentMethod: "pix" | "cash" | "card" | null; items: { productId: string; quantity: number; unitPriceCents: number }[] }) {
  return foodApi<{ message: string }>("/api/v1/food/sales", { method: "POST", body: JSON.stringify(input) });
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
    category: typeof product.category === "string" ? product.category : "Geral",
    aliases: stringArray(product.aliases),
    variants,
    salePriceCents: typeof product.salePriceCents === "number" ? product.salePriceCents : 0,
    stockQuantity: typeof product.stockQuantity === "number" ? product.stockQuantity : 0,
    unpreparedQuantity: typeof product.unpreparedQuantity === "number" ? product.unpreparedQuantity : 0,
    preparationCapacity: typeof product.preparationCapacity === "number" ? product.preparationCapacity : 0,
    productionMode: product.productionMode === "recipe" || product.productionMode === "ingredient" ? product.productionMode : "resale",
    stockUnit: product.stockUnit === "g" || product.stockUnit === "ml" ? product.stockUnit : "un",
    recipe: Array.isArray(product.recipe) ? product.recipe.flatMap(value => {
      const row = asRecord(value);
      return typeof row.ingredientId === "string" && typeof row.quantity === "number" ? [{ ingredientId: row.ingredientId, quantity: row.quantity }] : [];
    }) : [],
    allowOnDemand: product.allowOnDemand === true,
    fryToOrder: product.fryToOrder === true,
    active: product.active !== false,
    createdAt: typeof product.createdAt === "string" ? product.createdAt : "",
    updatedAt: typeof product.updatedAt === "string" ? product.updatedAt : "",
  };
}

async function foodApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (apiKey) headers.set("X-API-Key", apiKey);

  const response = await fetch(`${await getApiBaseUrl()}${path}`, { ...init, headers });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, "Não foi possível acessar o backend do Mosaico Food."));

  const data = asRecord(payload).data;
  return data as T;
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

export async function updateFoodProduct(id: string, input: Partial<ProductInput>) {
  const data = await foodApi<{ product: FoodProduct }>(`/api/v1/food/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  const product = normalizeFoodProduct(data.product);
  if (!product) throw new Error("O backend devolveu um produto inválido.");
  return product;
}

export async function getFoodConversations() {
  const data = await foodApi<{ conversations: FoodConversation[] }>("/api/v1/food/conversations");
  return data.conversations;
}

export async function registerFoodStock(id: string, input: { operationId: string; action: "receive_ready" | "receive_unprepared" | "prepare"; quantity: number }) {
  return foodApi(`/api/v1/food/products/${encodeURIComponent(id)}/stock`, { method: "POST", body: JSON.stringify(input) });
}

export async function getFoodMessages(conversationId: string) {
  const data = await foodApi<{ messages: FoodMessage[] }>(`/api/v1/food/conversations/${encodeURIComponent(conversationId)}/messages`);
  return data.messages;
}

export async function getFoodNotifications(after?: string) {
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  const data = await foodApi<{ notifications: FoodNotification[] }>(`/api/v1/whatsapp/notifications${query}`);
  return Array.isArray(data.notifications) ? data.notifications : [];
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

export async function updateFoodOrderStatus(id: string, status: string) {
  const data = await foodApi<{ order: FoodOrder; notification?: { sent: boolean; skipped: boolean } }>(`/api/v1/food/orders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return data;
}
