import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { createLedgerAiConversationManager } from "../../../lib/ai.mjs";
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { DashboardService, currentDate } from "../dashboard/dashboard.service.js";
import { AiSettingsService } from "./ai-settings.service.js";
import { CurrentUserService } from "../auth/current-user.service.js";
import { normalizeRecord } from "../../../lib/db.mjs";

const EDITABLE_FIELDS = ["date", "direction", "amount", "item", "category1", "category2", "note"] as const;
const FIELD_LABELS: Record<(typeof EDITABLE_FIELDS)[number], string> = { date: "日期", direction: "收支", amount: "金额", item: "项目", category1: "一级分类", category2: "二级分类", note: "备注" };
const displayFieldValue = (field: (typeof EDITABLE_FIELDS)[number], value: unknown) => field === "direction" ? (value === "income" ? "收入" : "支出") : String(value || "空");

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

  private editableRecord(value: any, fallback: any = {}) {
    const source = { ...fallback, ...(value || {}) };
    const explicitDirection = value?.direction === "income" || value?.direction === "expense" ? value.direction : undefined;
    const fallbackDirection = fallback?.direction === "income" || fallback?.direction === "expense" ? fallback.direction : undefined;
    const direction = explicitDirection || fallbackDirection || (Number(fallback?.amount) > 0 ? "income" : Number(fallback?.amount) < 0 ? "expense" : Number(value?.amount) > 0 ? "income" : "expense");
    try {
      const normalized = normalizeRecord({ ...source, direction, amount: Math.abs(Number(source.amount)) });
      return { date: normalized.date, direction, amount: Math.abs(normalized.amount), item: normalized.item, category1: normalized.category1, category2: normalized.category2, note: normalized.note };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "待确认账目内容无效");
    }
  }

  private editedProposals(pending: any[], submitted: unknown) {
    if (!Array.isArray(submitted) || submitted.length !== pending.length) throw new BadRequestException("待确认操作已发生变化，请刷新后重试");
    return pending.map((stored, index) => {
      const edited: any = submitted[index];
      if (!edited || edited.type !== stored.type) throw new BadRequestException("待确认操作与原提案不一致");
      if (stored.type === "create") {
        if (!Array.isArray(edited.records) || edited.records.length !== (stored.records || []).length) throw new BadRequestException("新增账目数量不能修改");
        return {
          type: "create",
          records: edited.records.map((record: any, recordIndex: number) => this.editableRecord(record, stored.records[recordIndex])),
          _originalRecords: stored._originalRecords || stored.records,
          _humanEdited: true,
        };
      }
      if (stored.type === "update") {
        if (Number(edited.id) !== Number(stored.id)) throw new BadRequestException("不能更换待修改的账目");
        const proposed = this.editableRecord(stored.changes, stored.current);
        return {
          type: "update",
          id: stored.id,
          current: stored.current,
          changes: this.editableRecord(edited.changes, proposed),
          _originalChanges: stored._originalChanges || stored.changes,
          _humanEdited: true,
        };
      }
      if (stored.type === "delete") {
        if (Number(edited.id) !== Number(stored.id)) throw new BadRequestException("不能更换待删除的账目");
        return stored;
      }
      throw new BadRequestException("包含未知待确认操作");
    });
  }

  private editSummary(proposals: any[]) {
    const changes: string[] = [];
    const compare = (before: any, after: any, label: string, fallback: any = {}) => {
      const original = this.editableRecord(before, fallback);
      const edited = this.editableRecord(after, original);
      const fields = EDITABLE_FIELDS.filter((field) => String(original[field] ?? "") !== String(edited[field] ?? "")).map((field) => `${FIELD_LABELS[field]}“${displayFieldValue(field, original[field])}”→“${displayFieldValue(field, edited[field])}”`);
      if (fields.length) changes.push(`${label}：${fields.join("，")}`);
    };
    proposals.forEach((proposal, proposalIndex) => {
      if (proposal.type === "create" && proposal._originalRecords) proposal.records.forEach((record: any, recordIndex: number) => compare(proposal._originalRecords[recordIndex], record, `第 ${proposalIndex + 1} 项第 ${recordIndex + 1} 笔`));
      if (proposal.type === "update" && proposal._originalChanges) compare(proposal._originalChanges, proposal.changes, `第 ${proposalIndex + 1} 项`, proposal.current);
    });
    return changes;
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
    const pendingEdits = this.editSummary(pending as any[]);
    const pendingNotice = pendingEdits.length ? `用户已在界面中手动微调待确认操作，请以调整后的内容为准。相对你最初提案的变化：\n${pendingEdits.map((item) => `- ${item}`).join("\n")}` : "";
    await this.prisma.aiMessage.create({ data: { conversationId: id, role: "user", content: input } });
    const result = await this.conversations.run({ conversationId: id, text: input, history, pending, pendingNotice });
    const title = conversation!.title === "新对话" ? input.slice(0, 24) || "账本对话" : conversation!.title;
    await this.prisma.$transaction([
      this.prisma.aiMessage.create({ data: { conversationId: id, role: "assistant", content: result.message } }),
      this.prisma.aiConversation.update({ where: { id }, data: { title, pendingProposals: result.proposals || [] } }),
    ]);
    return result;
  }

  async updatePendingProposals(value: string, proposals: unknown) {
    const id = this.conversationId(value);
    const conversation = await this.prisma.aiConversation.findFirst({ where: { id, userId: this.currentUser.userId } });
    if (!conversation) throw new NotFoundException("对话不存在");
    const pending = Array.isArray(conversation.pendingProposals) ? conversation.pendingProposals as any[] : [];
    if (!pending.length) throw new BadRequestException("没有待编辑的操作");
    const edited = this.editedProposals(pending, proposals);
    await this.prisma.aiConversation.update({ where: { id }, data: { pendingProposals: edited as any } });
    return { proposals: edited };
  }

  async execute(conversationId: string | undefined) {
    const id = this.conversationId(conversationId);
    const stored = await this.prisma.aiConversation.findFirst({ where: { id, userId: this.currentUser.userId } });
    if (!stored) throw new NotFoundException("对话不存在");
    const pending = Array.isArray(stored.pendingProposals) ? stored.pendingProposals as any[] : [];
    const operations = pending;
    if (!operations.length) throw new Error("没有待执行操作");
    const humanEdits = this.editSummary(operations);
    const results: any[] = [];
    for (const proposal of operations) {
      if (proposal.type === "create") results.push({ type: "create", records: await this.ledger.addMany(proposal.records || []) });
      else if (proposal.type === "update") results.push({ type: "update", record: await this.ledger.update(proposal.id, proposal.changes || {}) });
      else if (proposal.type === "delete") results.push({ type: "delete", id: proposal.id, deleted: Boolean(await this.ledger.delete(proposal.id)) });
      else throw new Error("包含未知操作");
    }
    const editNotice = humanEdits.length ? `\n执行前人工调整：\n${humanEdits.map((item) => `- ${item}`).join("\n")}` : "";
    this.conversations.notifyOutcome(id, "confirmed", editNotice);
    await this.prisma.$transaction([
      this.prisma.aiMessage.create({ data: { conversationId: id, role: "assistant", content: `待确认操作已执行，相关统计也已更新。${editNotice}` } }),
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
