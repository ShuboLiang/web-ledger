import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import path from "node:path";
import { LedgerModule } from "./infrastructure/ledger/ledger.module.js";
import { AiModule } from "./modules/ai/ai.module.js";
import { DashboardModule } from "./modules/dashboard/dashboard.module.js";
import { DictionariesModule } from "./modules/dictionaries/dictionaries.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { TransactionsModule } from "./modules/transactions/transactions.module.js";
import { ManagementModule } from "./modules/management/management.module.js";
import { FrontendController } from "./frontend.controller.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({ rootPath: path.join(process.cwd(), "dist-web") }),
    LedgerModule,
    DashboardModule,
    TransactionsModule,
    DictionariesModule,
    AiModule,
    HealthModule,
    ManagementModule,
  ],
  controllers: [FrontendController],
})
export class AppModule {}
