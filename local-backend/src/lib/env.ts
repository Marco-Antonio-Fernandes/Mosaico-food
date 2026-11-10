import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).optional(),
  MOSAICO_API_KEY: z.string().min(16).optional(),
  MOSAICO_REQUIRE_API_KEY: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1"),
  MOSAICO_RELAY_ONLY: z
    .enum(["0", "1"])
    .default("1")
    .transform((value) => value === "1"),
  CORS_ORIGIN: z
    .string()
    .optional()
    .refine(
      (value) =>
        !value ||
        value.split(",").every((origin) => {
          try {
            new URL(origin.trim());
            return true;
          } catch {
            return false;
          }
        }),
      "CORS_ORIGIN deve conter uma ou mais URLs separadas por vírgula.",
    ),
  WA_AKG_BASE_URL: z.string().url().default("https://wa-akg.app"),
  WA_AKG_API_KEY: z.string().min(1).optional(),
  WA_AKG_SESSION_ID: z.string().min(1).optional(),
  WA_AKG_WEBHOOK_SECRET: z.string().min(16).optional(),
  WA_AKG_MEDIA_DIR: z.string().min(1).optional(),
  FOOD_AUTOMATION_BUSINESS_NAME: z.string().trim().min(1).max(120).default("Japa Lanches"),
  FOOD_AUTOMATION_ALLOW_ON_DEMAND: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  FOOD_AUTOMATION_MAX_MESSAGE_AGE_MINUTES: z.coerce.number().int().positive().default(30),
  FOOD_AUTOMATION_CONVERSATION_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(60),
  NOTAAS_API_KEY: z.string().min(1).optional(),
  NOTAAS_BASE_URL: z.string().url().default("https://platform.notaas.com.br/api/v1"),
  NOTASEMTUPE_BASE_URL: z.string().url().default("http://127.0.0.1:4173"),
  NOTASEMTUPE_TOKEN: z.string().min(1).optional(),
  NOTASEMTUPE_PROVISION_KEY: z.string().min(16).optional(),
  FOOD_FISCAL_MODEL: z.coerce.number().int().refine((value) => value === 65 || value === 55, "FOOD_FISCAL_MODEL deve ser 55 ou 65.").default(65),
  FOOD_FISCAL_ENVIRONMENT: z.enum(["homologation", "production"]).default("homologation"),
  FOOD_FISCAL_UF: z.string().length(2).transform((value) => value.toUpperCase()).default("PR"),
  FOOD_FISCAL_CRT: z.coerce.number().int().refine((value) => [1, 2, 3, 4].includes(value), "FOOD_FISCAL_CRT inválido.").default(4),
  FOOD_FISCAL_NATUREZA: z.string().trim().min(1).max(60).default("Venda de mercadoria"),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  MOSAICO_API_KEY: process.env.MOSAICO_API_KEY,
  MOSAICO_REQUIRE_API_KEY: process.env.MOSAICO_REQUIRE_API_KEY,
  MOSAICO_RELAY_ONLY: process.env.MOSAICO_RELAY_ONLY,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  WA_AKG_BASE_URL: process.env.WA_AKG_BASE_URL,
  WA_AKG_API_KEY: process.env.WA_AKG_API_KEY || undefined,
  WA_AKG_SESSION_ID: process.env.WA_AKG_SESSION_ID,
  WA_AKG_WEBHOOK_SECRET: process.env.WA_AKG_WEBHOOK_SECRET || undefined,
  WA_AKG_MEDIA_DIR: process.env.WA_AKG_MEDIA_DIR || undefined,
  FOOD_AUTOMATION_BUSINESS_NAME: process.env.FOOD_AUTOMATION_BUSINESS_NAME,
  FOOD_AUTOMATION_ALLOW_ON_DEMAND: process.env.FOOD_AUTOMATION_ALLOW_ON_DEMAND,
  FOOD_AUTOMATION_MAX_MESSAGE_AGE_MINUTES: process.env.FOOD_AUTOMATION_MAX_MESSAGE_AGE_MINUTES,
  FOOD_AUTOMATION_CONVERSATION_TIMEOUT_MINUTES: process.env.FOOD_AUTOMATION_CONVERSATION_TIMEOUT_MINUTES,
  NOTAAS_API_KEY: process.env.NOTAAS_API_KEY || undefined,
  NOTAAS_BASE_URL: process.env.NOTAAS_BASE_URL,
  NOTASEMTUPE_BASE_URL: process.env.NOTASEMTUPE_BASE_URL,
  NOTASEMTUPE_TOKEN: process.env.NOTASEMTUPE_TOKEN || undefined,
  NOTASEMTUPE_PROVISION_KEY: process.env.NOTASEMTUPE_PROVISION_KEY || undefined,
  FOOD_FISCAL_MODEL: process.env.FOOD_FISCAL_MODEL,
  FOOD_FISCAL_ENVIRONMENT: process.env.FOOD_FISCAL_ENVIRONMENT,
  FOOD_FISCAL_UF: process.env.FOOD_FISCAL_UF,
  FOOD_FISCAL_CRT: process.env.FOOD_FISCAL_CRT,
  FOOD_FISCAL_NATUREZA: process.env.FOOD_FISCAL_NATUREZA,
});
