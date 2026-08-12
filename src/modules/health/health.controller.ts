import { Controller, Get } from "@nestjs/common";
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js";
import { AiSettingsService } from "../ai/ai-settings.service.js";

@Controller("api/health")
export class HealthController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly settings: AiSettingsService,
  ) {}

  @Get()
  async check() {
    const ai = await this.settings.get();
    return {
      ok: true,
      service: "qing-zhang-api",
      architecture: "nestjs-modular-monolith",
      aiConfigured: ai.configured === true,
      aiProvider: "providerId" in ai ? ai.providerId : null,
      aiModel: "modelId" in ai ? ai.modelId : null,
      database: this.ledger.path,
    };
  }
}
