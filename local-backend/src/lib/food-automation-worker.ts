import { Injectable, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { runFoodAutomation } from "../features/food-automation/food-automation";
import { env } from "./env";

@Injectable()
export class FoodAutomationWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly database: PrismaService) {}
  onModuleInit() {
    // No modo ponte o servidor remoto apenas deixa mensagens disponíveis para
    // o aplicativo instalado; ele nunca executa automação nem cria pedidos.
    if (env.MOSAICO_RELAY_ONLY) return;
    // No aplicativo local o WA-AKG não fica configurado: quem processa as
    // mensagens é o ingest da ponte. Evita execuções inúteis a cada 5s.
    if (!env.WA_AKG_API_KEY || !env.WA_AKG_SESSION_ID) return;
    // Messages are persisted by the webhook. Drain pending work even without an open desktop.
    this.timer = setInterval(() => {
      if (this.database.isConfigured) void runFoodAutomation(this.database).catch(() => undefined);
    }, 5000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
