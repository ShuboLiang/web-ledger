import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { createLedgerAiConversationManager } from "../../../lib/ai.mjs";
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { DashboardService, currentDate } from "../dashboard/dashboard.service.js";
import { AiSettingsService } from "./ai-settings.service.js";
import { CurrentUserService } from "../auth/current-user.service.js";

@Injectable()
export class AiService implements OnModuleDestroy {
  private readonly conversations: ReturnType<typeof createLedgerAiConversationManager>;

  constructor(
    private readonly ledger: LedgerService,
    private readonly dashboard: DashboardService,
    private readonly settings: AiSettingsService,
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserService,
  ) {
    this.conversations = createLedgerAiConversationManager({
      ledger: this.ledger,
      dashboard: (anchor: string) => this.dashboard.build(anchor),
      getToday: currentDate,
      getConfig: () => this.settings.runtime(),
    });
  }

  private conversationId(value: unknown) {
    const id = String(value || "").trim();
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new BadRequestException("会话标识无效");
    return id;
  }

  async listConversations() {
    const rows = await this.prisma.aiConversation.findMany({ where: { userId: this.currentUser.userId }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { messages: true } } } });
    return rows.map((row) => ({ id: row.id, title: row.title, messageCount: row._count.messages, createdAt: row.createdAt, updatedAt: row.updatedAt }));
  }

  async createConversation(value: unknown, title = "新对话") {
    const id = this.conversationId(value);
    const existing = await this.prisma.aiConversation.findFirst({ where: { id, userId: this.currentUser.userId } });
    const row = existing || await this.prisma.aiConversation.create({ data: { id, userId: this.currentUser.userId, title: String(title || "新对话").trim().slice(0, 80) || "新对话" } });
    return { id: row.id, title: row.title, messages: [], proposals: [] };
  }

  async getConversation(value: unknown) {
    const id = this.conversationId(value);
    const row = await this.prisma.aiConversation.findFirst({ where: { id, userId: this.currentUser.userId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    if (!row) throw new NotFoundException("对话不存在");
    return { id: row.id, title: row.title, messages: row.messages.map((item) => ({ id: item.id, role: item.role, content: item.content, createdAt: item.createdAt })), proposals: Array.isArray(row.pendingProposals) ? row.pendingProposals : [] };
  }

  async run(conversationId: string | undefined, text: string) {
    const id = this.conversationId(conversationId);
    const input = String(text || "").trim();
    let conversation = await this.prisma.aiConversation.findFirst({ where: { id, userId: this.currentUser.userId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    if (!conversation) { await this.createConversation(id); conversation = await this.prisma.aiConversation.findFirst({ where: { id, userId: this.currentUser.userId }, include: { messages: { orderBy: { createdAt: "asc" } } } }); }
    const history = conversation!.messages.map((item) => ({ role: item.role, content: item.content }));
    const pending = Array.isArray(conversation!.pendingProposals) ? conversation!.pendingProposals : [];
    await this.prisma.aiMessage.create({ data: { conversationId: id, role: "user", content: input } });
    const result = await this.conversations.run({ conversationId: id, text: input, history, pending });
    const title = conversation!.title === "新对话" ? input.slice(0, 24) || "账本对话" : conversation!.title;
    await this.prisma.$transaction([
      this.prisma.aiMessage.create({ data: { conversationId: id, role: "assistant", content: result.message } }),
      this.prisma.aiConversation.update({ where: { id }, data: { title, pendingProposals: result.proposals || [] } }),
    ]);
    return result;
  }

  async execute(conversationId: string | undefined, proposals: any[]) {
    const id = this.conversationId(conversationId);
    const stored = await this.prisma.aiConversation.findFirst({ where: { id, userId: this.currentUser.userId } });
    if (!stored) throw new NotFoundException("对话不存在");
    const pending = Array.isArray(stored.pendingProposals) ? stored.pendingProposals as any[] : [];
    const operations = pending;
    if (!operations.length) throw new Error("没有待执行操作");
    const results: any[] = [];
    for (const proposal of operations) {
      if (proposal.type === "create") results.push({ type: "create", records: await this.ledger.addMany(proposal.records || []) });
      else if (proposal.type === "update") results.push({ type: "update", record: await this.ledger.update(proposal.id, proposal.changes || {}) });
      else if (proposal.type === "delete") results.push({ type: "delete", id: proposal.id, deleted: Boolean(await this.ledger.delete(proposal.id)) });
      else throw new Error("包含未知操作");
    }
    this.conversations.notifyOutcome(id, "confirmed");
    await this.prisma.$transaction([
      this.prisma.aiMessage.create({ data: { conversationId: id, role: "assistant", content: "待确认操作已执行，相关统计也已更新。" } }),
      this.prisma.aiConversation.update({ where: { id }, data: { pendingProposals: [] } }),
    ]);
    return { results };
  }

  async saveSettings(input: Record<string, unknown>) {
    const saved = await this.settings.save(input);
    this.conversations.clear();
    return saved;
  }

  async outcome(value: string, outcome: "confirmed" | "cancelled") {
    const id = this.conversationId(value);
    const exists = await this.prisma.aiConversation.findFirst({ where: { id, userId: this.currentUser.userId } });
    if (!exists) throw new NotFoundException("对话不存在");
    const notified = this.conversations.notifyOutcome(id, outcome);
    if (outcome === "cancelled") await this.prisma.$transaction([
      this.prisma.aiMessage.create({ data: { conversationId: id, role: "assistant", content: "已取消待确认操作，没有修改账本。" } }),
      this.prisma.aiConversation.update({ where: { id }, data: { pendingProposals: [] } }),
    ]);
    return notified;
  }
  async remove(value: string) { const id = this.conversationId(value); this.conversations.remove(id); await this.prisma.aiConversation.deleteMany({ where: { id, userId: this.currentUser.userId } }); return true; }
  clear() { this.conversations.clear(); }
  onModuleDestroy() { this.clear(); }
}
