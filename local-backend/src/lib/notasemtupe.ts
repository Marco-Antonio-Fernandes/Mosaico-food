import { z } from "zod";

import { env } from "./env";

const syncInputSchema = z.object({
  externalId: z.string().trim().min(1).max(180),
  productName: z.string().trim().min(1).max(160),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  client: z.string().trim().min(1).max(160).default("Consumidor final"),
  clientDocument: z.string().trim().max(18).nullable().optional(),
  status: z.enum(["Rascunho", "Autorizada", "Cancelada"]).default("Autorizada"),
  environment: z.string().trim().max(40).default("homologation"),
  protocol: z.string().trim().max(120).nullable().optional(),
  accessKey: z.string().trim().max(120).nullable().optional(),
});

const provisionInputSchema = z.object({
  externalId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  cnpj: z.string().trim().regex(/^\d{14}$/, "CNPJ deve ter 14 dígitos."),
  city: z.string().trim().max(120).optional().default(""),
  state: z.string().trim().length(2).optional().default(""),
});

export const notasemtupeSyncSchema = syncInputSchema;
export type NotasemtupeSyncInput = z.infer<typeof syncInputSchema>;

type NotasemtupeCompany = { id: string; name: string; cnpj: string };

export type NotasemtupeStatus = {
  configured: boolean;
  reachable: boolean;
  authenticated: boolean;
  baseUrl: string;
  company: NotasemtupeCompany | null;
  error: string | null;
};

export type NotasemtupeSyncResult = {
  configured: boolean;
  synced: boolean;
  skipped: boolean;
  duplicate?: boolean;
  invoice?: Record<string, unknown>;
  message: string;
};

export type NotasemtupeProvisionInput = z.infer<typeof provisionInputSchema>;

export type NotasemtupeProvisionResult = {
  configured: boolean;
  provisioned: boolean;
  created: boolean;
  companyId: string | null;
  company: NotasemtupeCompany | null;
  token: string | null;
  message: string;
};

function baseUrl() {
  return env.NOTASEMTUPE_BASE_URL.replace(/\/+$/, "");
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : "Falha de comunicação com o not@sem tupe.";
}

async function notasemtupeFetch(path: string, init: RequestInit = {}, token = env.NOTASEMTUPE_TOKEN) {
  if (!token) throw new Error("Token do not@sem tupe não configurado.");
  const response = await fetch(`${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("json") ? await response.json().catch(() => ({})) : await response.text().catch(() => "");
  if (!response.ok) {
    const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const detail = typeof payload === "string" ? payload : String(body.error ?? body.message ?? "resposta inválida");
    throw new Error(`not@sem tupe respondeu HTTP ${response.status}: ${detail}`.slice(0, 400));
  }
  return payload;
}

export async function getNotasemtupeStatus(token = env.NOTASEMTUPE_TOKEN): Promise<NotasemtupeStatus> {
  const configured = Boolean(token);
  if (!configured) return { configured: false, reachable: false, authenticated: false, baseUrl: baseUrl(), company: null, error: "A empresa ainda não foi provisionada no not@sem tupe." };
  try {
    const payload = await notasemtupeFetch("/api/v1/me", {}, token) as Record<string, unknown>;
    const company = payload.company && typeof payload.company === "object" ? payload.company as Record<string, unknown> : {};
    return {
      configured: true,
      reachable: true,
      authenticated: payload.authenticated === true,
      baseUrl: baseUrl(),
      company: typeof company.id === "string" && typeof company.name === "string" && typeof company.cnpj === "string" ? { id: company.id, name: company.name, cnpj: company.cnpj } : null,
      error: payload.authenticated === true ? null : "Token recusado pelo not@sem tupe.",
    };
  } catch (error) {
    return { configured: true, reachable: false, authenticated: false, baseUrl: baseUrl(), company: null, error: safeError(error) };
  }
}

export async function provisionNotasemtupeCompany(input: NotasemtupeProvisionInput): Promise<NotasemtupeProvisionResult> {
  if (!env.NOTASEMTUPE_PROVISION_KEY) {
    return { configured: false, provisioned: false, created: false, companyId: null, company: null, token: null, message: "Chave de provisionamento do not@sem tupe não configurada." };
  }
  const response = await fetch(`${baseUrl()}/api/v1/provision/companies`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Mosaico-Provision-Key": env.NOTASEMTUPE_PROVISION_KEY,
    },
    body: JSON.stringify(input),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    throw new Error(String(body.error ?? body.message ?? `not@sem tupe respondeu HTTP ${response.status}`).slice(0, 400));
  }
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const companyValue = body.company && typeof body.company === "object" ? body.company as Record<string, unknown> : null;
  const company = companyValue && typeof companyValue.id === "string" && typeof companyValue.name === "string" && typeof companyValue.cnpj === "string"
    ? { id: companyValue.id, name: companyValue.name, cnpj: companyValue.cnpj }
    : null;
  return {
    configured: true,
    provisioned: company !== null,
    created: body.created === true,
    companyId: company?.id ?? null,
    company,
    token: typeof body.token === "string" ? body.token : null,
    message: typeof body.message === "string" ? body.message : "Empresa provisionada no not@sem tupe.",
  };
}

export async function syncNotasemtupeNote(input: NotasemtupeSyncInput, token = env.NOTASEMTUPE_TOKEN): Promise<NotasemtupeSyncResult> {
  if (!token) {
    return { configured: false, synced: false, skipped: true, message: "Centralização no not@sem tupe ignorada: a empresa ainda não foi provisionada." };
  }
  const payload = await notasemtupeFetch("/api/v1/notas", {
    method: "POST",
    body: JSON.stringify({
      externalId: input.externalId,
      client: input.clientDocument ? `${input.client} · ${input.clientDocument}` : input.client,
      type: "Produto",
      item: input.productName,
      quantity: input.quantity,
      unitValue: Number((input.unitPriceCents / 100).toFixed(2)),
      status: input.status,
      source: "mosaico-food",
      environment: input.environment,
      protocol: input.protocol,
      accessKey: input.accessKey,
    }),
  }, token) as Record<string, unknown>;
  const invoice = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : undefined;
  return {
    configured: true,
    synced: true,
    skipped: false,
    duplicate: payload.duplicate === true,
    invoice,
    message: payload.duplicate === true ? "Nota já estava sincronizada no not@sem tupe." : "Nota sincronizada no not@sem tupe.",
  };
}
