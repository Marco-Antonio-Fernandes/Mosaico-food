import { FoodFinanceController } from "./controllers/food-finance.controller";
import { FoodFiscalController } from "./controllers/food-fiscal.controller";
import { FoodAccountsController } from "./controllers/food-accounts.controller";
import { Module } from "@nestjs/common";

import { CreditEntriesController } from "./controllers/credit-entries.controller";
import { CustomersController } from "./controllers/customers.controller";
import { FoodAutomationController } from "./controllers/food-automation.controller";
import { FoodCustomersController } from "./controllers/food-customers.controller";
import { FoodConversationsController } from "./controllers/food-conversations.controller";
import { FoodOrdersController } from "./controllers/food-orders.controller";
import { FoodOrderSchedulesController } from "./controllers/food-order-schedules.controller";
import { FoodProductsController } from "./controllers/food-products.controller";
import { FoodSpeechController } from "./controllers/food-speech.controller";
import { FoodAssistantController } from "./controllers/food-assistant.controller";
import { FoodSalesController } from "./controllers/food-sales.controller";
import { FoodStockNotificationsController } from "./controllers/food-stock-notifications.controller";
import { FoodBackupController } from "./controllers/food-backup.controller";
import { FoodCashController } from "./controllers/food-cash.controller";
import { FoodAutomationWorker } from "./lib/food-automation-worker";
import {
  HealthController,
  SaudeHealthController,
} from "./controllers/health.controller";
import { SyncController } from "./controllers/sync.controller";
import { WhatsappLocalController } from "./controllers/whatsapp-local.controller";
import { FoodRelayController } from "./controllers/food-relay.controller";
import { PrismaService } from "./lib/prisma.service";
import { WaAkgClient } from "./lib/wa-akg";
import { env } from "./lib/env";

const foodBusinessControllers = [
  FoodAutomationController,
  FoodCustomersController,
  FoodConversationsController,
  FoodProductsController,
  FoodSpeechController,
  FoodAssistantController,
  FoodSalesController,
  FoodStockNotificationsController,
  FoodOrdersController,
  FoodOrderSchedulesController,
  FoodBackupController,
  FoodCashController,
  FoodFinanceController,
];

@Module({
  controllers: [
    HealthController,
    SaudeHealthController,
    FoodAccountsController,
    CustomersController,
    CreditEntriesController,
    SyncController,
    ...(env.MOSAICO_RELAY_ONLY ? [] : foodBusinessControllers),
    WhatsappLocalController,
    FoodRelayController,
    // O modo relay-only mantém as rotas de operação fora do servidor remoto,
    // mas o desktop precisa consultar o status e emitir notas por este backend.
    FoodFiscalController,
  ],
  providers: [PrismaService, WaAkgClient, FoodAutomationWorker],
})
export class AppModule {}
