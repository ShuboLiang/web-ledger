import { Module } from "@nestjs/common"
import { DashboardModule } from "../dashboard/dashboard.module.js"
import { AiController } from "./ai.controller.js"
import { AiService } from "./ai.service.js"
import { AiSettingsService } from "./ai-settings.service.js"

@Module({
  imports: [DashboardModule],
  controllers: [AiController],
  providers: [AiService, AiSettingsService],
  exports: [AiService, AiSettingsService],
})
export class AiModule {}
