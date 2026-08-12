import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { createLedgerAiConversationManager } from "../../../lib/ai.mjs";
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js";
import { DashboardService, currentDate } from "../dashboard/dashboard.service.js";
import { AiSettingsService } from "./ai-settings.service.js";

@Injectable()
export class AiService implements OnModuleDestroy {
  private readonly conversations: ReturnType<typeof createLedgerAiConversationManager>;

  constructor(
    private readonly ledger: LedgerService,
    private readonly dashboard: DashboardService,
    private readonly settings: AiSettingsService,
  ) {
    this.conversations = createLedgerAiConversationManager({
      ledger: this.ledger,
      dashboard: (anchor: string) => this.dashboard.build(anchor),
      getToday: currentDate,
      getConfig: () => this.settings.runtime(),
    });
  }

  run(conversationId: string | undefined, text: string) {
    return this.conversations.run({ conversationId, text });
  }

  async execute(conversationId: string | undefined, proposals: any[]) {
    if (!Array.isArray(proposals) || !proposals.length) throw new Error("没有待执行操作");
    const results: any[] = [];
    for (const proposal of proposals) {
      if (proposal.type === "create") results.push({ type: "create", records: await this.ledger.addMany(proposal.records || []) });
      else if (proposal.type === "update") results.push({ type: "update", record: await this.ledger.update(proposal.id, proposal.changes || {}) });
      else if (proposal.type === "delete") results.push({ type: "delete", id: proposal.id, deleted: Boolean(await this.ledger.delete(proposal.id)) });
      else throw new Error("包含未知操作");
    }
    this.conversations.notifyOutcome(conversationId, "confirmed");
    return { results };
  }

  async saveSettings(input: Record<string, unknown>) {
    const saved = await this.settings.save(input);
    this.conversations.clear();
    return saved;
  }

  outcome(id: string, outcome: "confirmed" | "cancelled") { return this.conversations.notifyOutcome(id, outcome); }
  remove(id: string) { this.conversations.remove(id); }
  clear() { this.conversations.clear(); }
  onModuleDestroy() { this.clear(); }
}
