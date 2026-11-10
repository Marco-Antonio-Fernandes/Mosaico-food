import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

import { env } from "./env";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  readonly isConfigured = Boolean(env.DATABASE_URL);

  constructor() {
    super({
      datasources: {
        db: { url: env.DATABASE_URL ?? "file:./dev.db" },
      },
    });
  }

  async onModuleInit() {
    if (!this.isConfigured) {
      return;
    }

    try {
      await this.$connect();
    } catch {
      // The health endpoint reports the degraded state while the API stays up.
    }
  }

  async onModuleDestroy() {
    if (this.isConfigured) {
      await this.$disconnect();
    }
  }
}
