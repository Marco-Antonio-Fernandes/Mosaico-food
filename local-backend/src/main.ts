import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { env } from "./lib/env";
import { json, raw } from "express";
import { rejectUnauthorized } from "./lib/http";

type CorsCallback = (error: Error | null, allow?: boolean) => void;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(json({ limit: "50mb" }));
  const configuredOrigins = (env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: CorsCallback) => {
      if (
        !origin ||
        origin === "null" ||
        origin === "file://" ||
        origin.startsWith("file://") ||
        env.NODE_ENV !== "production" ||
        configuredOrigins.includes(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin não autorizado pelo CORS."), false);
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-API-Key", "Idempotency-Key"],
  });

  app.enableShutdownHooks();
  app.use("/api/v1/food/speech", (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    if (!rejectUnauthorized(req, res)) next();
  }, raw({ type: ["audio/*", "application/octet-stream", "video/webm"], limit: "8mb" }));
  await app.listen(env.PORT, process.env.HOST ?? "0.0.0.0");
}

void bootstrap();
