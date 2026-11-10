import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";

import { env } from "../lib/env";
import { jsonData } from "../lib/http";
import { PrismaService } from "../lib/prisma.service";

@Controller("api")
export class HealthController {
  constructor(private readonly database: PrismaService) {}

  @Get("health")
  async health(@Res() response: Response) {
    if (!this.database.isConfigured) {
      return response.json(
        jsonData({
          service: "mosaico-back",
          status: "degraded",
          database: "not_configured",
          modules: { food: "available", saude: "available" },
        }),
      );
    }

    try {
      await this.database.$queryRaw`SELECT 1`;
      return response.json(
        jsonData({
          service: "mosaico-back",
          status: "ok",
          database: "connected",
          modules: { food: "available", saude: "available" },
        }),
      );
    } catch {
      return response.json(
        jsonData({
          service: "mosaico-back",
          status: "degraded",
          database: "unavailable",
          modules: { food: "available", saude: "available" },
        }),
      );
    }
  }
}

@Controller("api/v1/saude")
export class SaudeHealthController {
  constructor(private readonly database: PrismaService) {}

  @Get("health")
  async health(@Res() response: Response) {
    if (!this.database.isConfigured) {
      return response.json(
        jsonData({
          service: "mosaico-back",
          module: "saude",
          status: "degraded",
          database: "not_configured",
          authentication: env.NODE_ENV === "production" ? "enabled" : "disabled",
        }),
      );
    }

    try {
      await this.database.$queryRaw`SELECT 1`;
      return response.json(
        jsonData({
          service: "mosaico-back",
          module: "saude",
          status: "ok",
          database: "connected",
          authentication: env.NODE_ENV === "production" ? "enabled" : "disabled",
        }),
      );
    } catch {
      return response.json(
        jsonData({
          service: "mosaico-back",
          module: "saude",
          status: "degraded",
          database: "unavailable",
          authentication: env.NODE_ENV === "production" ? "enabled" : "disabled",
        }),
      );
    }
  }
}
