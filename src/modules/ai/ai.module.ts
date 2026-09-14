import { Module } from "@nestjs/common"
import { DashboardModule } from "../dashboard/dashboard.module.js"
import { ShoppingModule } from "../shopping/shopping.module.js"
import { AiController } from "./ai.controller.js"
import { AiService } from "./ai.service.js"
import { AiSettingsService } from "./ai-settings.service.js"
import { AiConversationCoordinator } from "./ai-conversation-coordinator.service.js"

@Module({
  imports: [DashboardModule, ShoppingModule],
  controllers: [AiController],
  providers: [AiService, AiSettingsService, AiConversationCoordinator],
  exports: [AiService, AiSettingsService],
})
export class AiModule {}
