export type FoodProduct = {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  variants: FoodProductVariant[];
  salePriceCents: number;
  stockQuantity: number;
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

export type ProductInput = {
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

const apiBaseUrl = (import.meta.env.VITE_MOSAICO_BACKEND_URL || "https://mosaico.rotatix.com.br").replace(/\/$/, "");
const apiKey = import.meta.env.VITE_MOSAICO_API_KEY || "";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function errorMessage(payload: unknown, fallback: string) {
  const error = asRecord(asRecord(payload).error);
  return typeof error.message === "string" ? error.message : fallback;
}

async function foodApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (apiKey) headers.set("X-API-Key", apiKey);

  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, "Não foi possível acessar o backend do Mosaico Food."));

  const data = asRecord(payload).data;
  return data as T;
}

export async function getFoodProducts(options: { activeOnly?: boolean } = {}) {
  const query = options.activeOnly ? "?active=true" : "";
  const data = await foodApi<{ products: FoodProduct[] }>(`/api/v1/food/products${query}`);
  return data.products;
}

export async function createFoodProduct(input: ProductInput) {
  const data = await foodApi<{ product: FoodProduct }>("/api/v1/food/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.product;
}

export async function updateFoodProduct(id: string, input: Partial<ProductInput>) {
  const data = await foodApi<{ product: FoodProduct }>(`/api/v1/food/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return data.product;
}

export async function getFoodConversations() {
  const data = await foodApi<{ conversations: FoodConversation[] }>("/api/v1/food/conversations");
  return data.conversations;
}

export async function getFoodMessages(conversationId: string) {
  const data = await foodApi<{ messages: FoodMessage[] }>(`/api/v1/food/conversations/${encodeURIComponent(conversationId)}/messages`);
  return data.messages;
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
  const data = await foodApi<{ order: FoodOrder }>(`/api/v1/food/orders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return data.order;
}

