import { randomUUID } from "node:crypto";
import type { Request as ExpressRequest, Response } from "express";

import { env } from "./env";

interface ErrorField {
  field: string;
  message: string;
}

interface ResponseMeta {
  requestId: string;
  occurredAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields: ErrorField[];
    requestId: string;
  };
}

function responseMeta(): ResponseMeta {
  return {
    requestId: randomUUID(),
    occurredAt: new Date().toISOString(),
  };
}

export function jsonData<T>(data: T) {
  return {
    data,
    meta: responseMeta(),
  };
}

export function jsonError(
  code: string,
  message: string,
  _status: number,
  fields: ErrorField[] = [],
): ApiErrorBody {
  return {
    error: {
      code,
      message,
      fields,
      requestId: responseMeta().requestId,
    },
  };
}

export function requireApiKey(request: Pick<ExpressRequest, "headers">) {
  if (!env.MOSAICO_REQUIRE_API_KEY) {
    return null;
  }

  if (!env.MOSAICO_API_KEY) {
    return jsonError(
      "API_KEY_NOT_CONFIGURED",
      "Configure MOSAICO_API_KEY antes de usar a API privada.",
      503,
    );
  }

  const receivedHeader = request.headers["x-api-key"];
  const receivedApiKey = Array.isArray(receivedHeader)
    ? receivedHeader[0]
    : receivedHeader;

  if (receivedApiKey !== env.MOSAICO_API_KEY) {
    return jsonError("UNAUTHENTICATED", "API key inválida.", 401);
  }

  return null;
}

export function rejectUnauthorized(
  request: Pick<ExpressRequest, "headers">,
  response: Response,
) {
  const error = requireApiKey(request);
  if (!error) {
    return false;
  }

  const code = error.error.code;
  response.status(code === "API_KEY_NOT_CONFIGURED" ? 503 : 401).json(error);
  return true;
}

export function databaseUnavailable(response: Response) {
  response
    .status(503)
    .json(
      jsonError(
        "DATABASE_NOT_CONFIGURED",
        "Configure DATABASE_URL e aplique o schema antes de usar os dados.",
        503,
      ),
    );
  return true;
}
