import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  createLedgerAiConversationManager,
  runPiLedgerDirectCommand,
} from "../../../lib/ai.mjs"
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js"
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js"
import {
  DashboardService,
  currentDate,
} from "../dashboard/dashboard.service.js"
import { AiSettingsService } from "./ai-settings.service.js"
import { CurrentUserService } from "../auth/current-user.service.js"
import { normalizeRecord } from "../../../lib/db.mjs"
import { AiConversationCoordinator } from "./ai-conversation-coordinator.service.js"

const EDITABLE_FIELDS = [
  "date",
  "direction",
  "amount",
  "item",
  "category1",
  "category2",
  "note",
] as const
const FIELD_LABELS: Record<(typeof EDITABLE_FIELDS)[number], string> = {
  date: "日期",
  direction: "收支",
  amount: "金额",
  item: "项目",
  category1: "一级分类",
  category2: "二级分类",
  note: "备注",
}
const displayFieldValue = (
  field: (typeof EDITABLE_FIELDS)[number],
  value: unknown,
) =>
  field === "direction"
    ? value === "income"
      ? "收入"
      : "支出"
    : String(value || "空")

@Injectable()
export class AiService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly dashboard: DashboardService,
    private readonly settings: AiSettingsService,
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserService,
    private readonly coordinator: AiConversationCoordinator,
  ) {}

  private conversationManager() {
    return createLedgerAiConversationManager({
      ledger: this.ledger,
      dashboard: (anchor: string) => this.dashboard.build(anchor),
      getToday: currentDate,
      getConfig: () => this.settings.runtime(),
      maxConversations: 1,
    })
  }

  private conversationKey(id: string) {
    return `${this.currentUser.userId}:${id}`
  }

  private conversationId(value: unknown) {
    const id = String(value || "").trim()
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id))
      throw new BadRequestException("会话标识无效")
    return id
  }

  private editableRecord(value: any, fallback: any = {}) {
    const source = { ...fallback, ...(value || {}) }
    const explicitDirection =
      value?.direction === "income" || value?.direction === "expense"
        ? value.direction
        : undefined
    const fallbackDirection =
      fallback?.direction === "income" || fallback?.direction === "expense"
        ? fallback.direction
        : undefined
    const direction =
      explicitDirection ||
      fallbackDirection ||
      (Number(fallback?.amount) > 0
        ? "income"
        : Number(fallback?.amount) < 0
          ? "expense"
          : Number(value?.amount) > 0
            ? "income"
            : "expense")
    try {
      const normalized = normalizeRecord({
        ...source,
        direction,
        amount: Math.abs(Number(source.amount)),
      })
      return {
        date: normalized.date,
        direction,
        amount: Math.abs(normalized.amount),
        item: normalized.item,
        category1: normalized.category1,
        category2: normalized.category2,
        ...(source.primaryIcon && /^[a-z0-9-]{1,40}$/.test(source.primaryIcon)
          ? { primaryIcon: source.primaryIcon }
          : {}),
        ...(source.secondaryIcon &&
        /^[a-z0-9-]{1,40}$/.test(source.secondaryIcon)
          ? { secondaryIcon: source.secondaryIcon }
          : {}),
        note: normalized.note,
      }
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "待确认账目内容无效",
      )
    }
  }

  private editedProposals(pending: any[], submitted: unknown) {
    if (!Array.isArray(submitted) || submitted.length !== pending.length)
      throw new BadRequestException("待确认操作已发生变化，请刷新后重试")
    return pending.map((stored, index) => {
      const edited: any = submitted[index]
      if (!edited || edited.type !== stored.type)
        throw new BadRequestException("待确认操作与原提案不一致")
      if (stored.type === "create") {
        if (
          !Array.isArray(edited.records) ||
          edited.records.length !== (stored.records || []).length
        )
          throw new BadRequestException("新增账目数量不能修改")
        return {
          type: "create",
          records: edited.records.map((record: any, recordIndex: number) =>
            this.editableRecord(record, stored.records[recordIndex]),
          ),
          _originalRecords: stored._originalRecords || stored.records,
          _humanEdited: true,
        }
      }
      if (stored.type === "update") {
        if (Number(edited.id) !== Number(stored.id))
          throw new BadRequestException("不能更换待修改的账目")
        const proposed = this.editableRecord(stored.changes, stored.current)
        return {
          type: "update",
          id: stored.id,
          current: stored.current,
          changes: this.editableRecord(edited.changes, proposed),
          _originalChanges: stored._originalChanges || stored.changes,
          _humanEdited: true,
        }
      }
      if (stored.type === "delete") {
        if (Number(edited.id) !== Number(stored.id))
          throw new BadRequestException("不能更换待删除的账目")
        return stored
      }
      if (stored.type === "category-icon") {
        if (
          edited.category1 !== stored.category1 ||
          String(edited.category2 || "") !== String(stored.category2 || "") ||
          edited.icon !== stored.icon
        )
          throw new BadRequestException("分类图标操作不能在账目编辑器中修改")
        return stored
      }
      throw new BadRequestException("包含未知待确认操作")
    })
  }

  private editSummary(proposals: any[]) {
    const changes: string[] = []
    const compare = (
      before: any,
      after: any,
      label: string,
      fallback: any = {},
    ) => {
      const original = this.editableRecord(before, fallback)
      const edited = this.editableRecord(after, original)
      const fields = EDITABLE_FIELDS.filter(
        (field) =>
          String(original[field] ?? "") !== String(edited[field] ?? ""),
      ).map(
        (field) =>
          `${FIELD_LABELS[field]}“${displayFieldValue(field, original[field])}”→“${displayFieldValue(field, edited[field])}”`,
      )
      if (fields.length) changes.push(`${label}：${fields.join("，")}`)
    }
    proposals.forEach((proposal, proposalIndex) => {
      if (proposal.type === "create" && proposal._originalRecords)
        proposal.records.forEach((record: any, recordIndex: number) =>
          compare(
            proposal._originalRecords[recordIndex],
            record,
            `第 ${proposalIndex + 1} 项第 ${recordIndex + 1} 笔`,
          ),
        )
      if (proposal.type === "update" && proposal._originalChanges)
        compare(
          proposal._originalChanges,
          proposal.changes,
          `第 ${proposalIndex + 1} 项`,
          proposal.current,
        )
    })
    return changes
  }

  private pendingSnapshot(proposals: any[]) {
    let displayIndex = 0
    const rows = proposals.flatMap((proposal) => {
      if (proposal?.type === "create")
        return (proposal.records || []).map((record: any) => ({
          序号: ++displayIndex,
          操作: "新增",
          日期: record.date,
          收支: record.direction === "income" ? "收入" : "支出",
          金额: Math.abs(Number(record.amount) || 0),
          项目: record.item,
          一级分类: record.category1,
          二级分类: record.category2,
          备注: record.note || "",
          人工微调: Boolean(proposal._humanEdited),
        }))
      if (proposal?.type === "category-icon")
        return [
          {
            序号: ++displayIndex,
            操作: "修改分类图标",
            一级分类: proposal.category1,
            ...(proposal.category2 ? { 二级分类: proposal.category2 } : {}),
            图标: proposal.icon,
          },
        ]
      const current = proposal?.current || {}
      const changes = proposal?.changes || {}
      return [
        {
          序号: ++displayIndex,
          操作: proposal?.type === "update" ? "修改" : "删除",
          账目编号: proposal?.id,
          当前内容: current,
          ...(proposal?.type === "update" ? { 修改为: changes } : {}),
          人工微调: Boolean(proposal?._humanEdited),
        },
      ]
    })
    return rows.length ? JSON.stringify(rows) : "（空）"
  }

  private removedNotice(value: any) {
    return typeof value === "string"
      ? { label: value, proposal: null }
      : {
          label: String(value?.label || "已移除一项待确认操作"),
          proposal: value?.proposal || null,
        }
  }

  async listConversations() {
    const rows = await this.prisma.aiConversation.findMany({
      where: { userId: this.currentUser.userId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    })
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      messageCount: row._count.messages,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
  }

  async createConversation(value: unknown, title = "新对话") {
    const id = this.conversationId(value)
    const existing = await this.prisma.aiConversation.findFirst({
      where: { id, userId: this.currentUser.userId },
    })
    const row =
      existing ||
      (await this.prisma.aiConversation.create({
        data: {
          id,
          userId: this.currentUser.userId,
          title:
            String(title || "新对话")
              .trim()
              .slice(0, 80) || "新对话",
        },
      }))
    return { id: row.id, title: row.title, messages: [], proposals: [] }
  }

  async getConversation(value: unknown) {
    const id = this.conversationId(value)
    const row = await this.prisma.aiConversation.findFirst({
      where: { id, userId: this.currentUser.userId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    })
    if (!row) throw new NotFoundException("对话不存在")
    return {
      id: row.id,
      title: row.title,
      messages: row.messages.map((item) => ({
        id: item.id,
        role: item.role,
        content: item.content,
        thinking: item.thinking,
        createdAt: item.createdAt,
      })),
      proposals: Array.isArray(row.pendingProposals)
        ? row.pendingProposals
        : [],
    }
  }

  async run(conversationId: string | undefined, text: string) {
    return this.processTurn(conversationId, text)
  }

  async runStreaming(
    conversationId: string | undefined,
    text: string,
    onEvent?: (event: { type: string; data?: unknown }) => void,
    signal?: AbortSignal,
  ) {
    const result = await this.processTurn(conversationId, text, onEvent, signal)
    onEvent?.({ type: "done", data: { ok: true } })
    return result
  }

  private async processTurn(
    conversationId: string | undefined,
    text: string,
    onEvent?: (event: { type: string; data?: unknown }) => void,
    signal?: AbortSignal,
  ) {
    const id = this.conversationId(conversationId)
    const input = String(text || "").trim()
    if (!input) throw new BadRequestException("请输入要处理的内容")
    return this.coordinator.run(this.conversationKey(id), async () => {
      let conversation = await this.prisma.aiConversation.findFirst({
        where: { id, userId: this.currentUser.userId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
      if (!conversation) {
        await this.createConversation(id)
        conversation = await this.prisma.aiConversation.findFirst({
          where: { id, userId: this.currentUser.userId },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        })
      }
      const history = conversation!.messages.map((item) => ({
        role: item.role,
        content: item.content,
      }))
      const pending = Array.isArray(conversation!.pendingProposals)
        ? conversation!.pendingProposals
        : []
      const pendingEdits = this.editSummary(pending as any[])
      const removedNotices = Array.isArray(conversation!.removedNotices)
        ? (conversation!.removedNotices as any[]).map((item) =>
            this.removedNotice(item),
          )
        : []
      const pendingNotice = [
        `当前待确认列表的完整真实状态如下。用户提到“第几笔”时，以序号字段为准；标记为人工微调的内容优先级高于你此前的建议，不得自行覆盖：\n${this.pendingSnapshot(pending as any[])}`,
        pendingEdits.length
          ? `用户已在界面中手动微调待确认操作，请以调整后的内容为准。相对你最初提案的变化：\n${pendingEdits.map((item) => `- ${item}`).join("\n")}`
          : "",
        removedNotices.length
          ? `用户已在界面中移除了以下待确认操作（它们不会被执行，不得自行重新生成）：\n${removedNotices.map((item) => `- ${item.label}`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
      const manager = this.conversationManager()
      let result: Awaited<ReturnType<typeof manager.run>>
      try {
        result = await manager.run({
          conversationId: id,
          text: input,
          history,
          pending,
          removed: removedNotices.map((item) => item.proposal).filter(Boolean),
          pendingNotice,
          onEvent,
          signal,
        })
      } finally {
        manager.clear()
      }
      if (signal?.aborted) throw new Error("请求已取消")
      const title =
        conversation!.title === "新对话"
          ? input.slice(0, 24) || "账本对话"
          : conversation!.title
      await this.prisma.$transaction([
        this.prisma.aiMessage.create({
          data: { conversationId: id, role: "user", content: input },
        }),
        this.prisma.aiMessage.create({
          data: {
            conversationId: id,
            role: "assistant",
            content: result.message,
            thinking: result.thinking || null,
          },
        }),
        this.prisma.aiConversation.update({
          where: { id },
          data: {
            title,
            pendingProposals: result.proposals || [],
            removedNotices: [],
          },
        }),
      ])
      return result
    })
  }

  async updatePendingProposals(value: string, proposals: unknown) {
    const id = this.conversationId(value)
    return this.coordinator.run(this.conversationKey(id), () =>
      this.updatePendingProposalsLocked(id, proposals),
    )
  }

  private async updatePendingProposalsLocked(id: string, proposals: unknown) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, userId: this.currentUser.userId },
    })
    if (!conversation) throw new NotFoundException("对话不存在")
    const pending = Array.isArray(conversation.pendingProposals)
      ? (conversation.pendingProposals as any[])
      : []
    if (!pending.length) throw new BadRequestException("没有待编辑的操作")
    const edited = this.editedProposals(pending, proposals)
    await this.prisma.aiConversation.update({
      where: { id },
      data: { pendingProposals: edited as any },
    })
    return { proposals: edited }
  }

  async removePendingProposal(
    value: string,
    input: { proposalIndex?: number; recordIndex?: number },
  ) {
    const id = this.conversationId(value)
    return this.coordinator.run(this.conversationKey(id), () =>
      this.removePendingProposalLocked(id, input),
    )
  }

  private async removePendingProposalLocked(
    id: string,
    input: { proposalIndex?: number; recordIndex?: number },
  ) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, userId: this.currentUser.userId },
    })
    if (!conversation) throw new NotFoundException("对话不存在")
    const pending = Array.isArray(conversation.pendingProposals)
      ? (conversation.pendingProposals as any[])
      : []
    if (!pending.length) throw new BadRequestException("没有待移除的操作")
    const proposalIndex = Number(input?.proposalIndex)
    if (
      !Number.isInteger(proposalIndex) ||
      proposalIndex < 0 ||
      proposalIndex >= pending.length
    )
      throw new BadRequestException("待移除的操作不存在")
    const next = [...pending]
    const target = next[proposalIndex]
    const recordIndex = Number(input?.recordIndex)
    let removedNotice: { label: string; proposal: any }
    if (
      target?.type === "create" &&
      Array.isArray(target.records) &&
      target.records.length > 1 &&
      Number.isInteger(recordIndex) &&
      recordIndex >= 0 &&
      recordIndex < target.records.length
    ) {
      // 一条“新增”提案含多笔记录时只移除其中一笔
      const removed = target.records[recordIndex]
      next[proposalIndex] = {
        ...target,
        records: target.records.filter(
          (_record: unknown, index: number) => index !== recordIndex,
        ),
        ...(Array.isArray(target._originalRecords)
          ? {
              _originalRecords: target._originalRecords.filter(
                (_record: unknown, index: number) => index !== recordIndex,
              ),
            }
          : {}),
      }
      removedNotice = {
        label: this.removedRecordLabel(removed),
        proposal: { type: "create", records: [removed] },
      }
    } else {
      next.splice(proposalIndex, 1)
      removedNotice = {
        label: this.removedProposalLabel(target),
        proposal: target,
      }
    }
    const removedNotices = Array.isArray(conversation.removedNotices)
      ? (conversation.removedNotices as any[])
      : []
    await this.prisma.aiConversation.update({
      where: { id },
      data: {
        pendingProposals: next as any,
        removedNotices: [...removedNotices, removedNotice],
      },
    })
    return { proposals: next }
  }

  private removedRecordLabel(record: any) {
    return `新增“${record?.item || "未命名"}” ¥${Math.abs(Number(record?.amount) || 0).toFixed(2)}（${record?.date || ""}）`
  }

  private removedProposalLabel(proposal: any) {
    if (proposal?.type === "create")
      return (proposal.records || [])
        .map((record: any) => this.removedRecordLabel(record))
        .join("；")
    if (proposal?.type === "category-icon")
      return `修改“${proposal.category1}${proposal.category2 ? ` / ${proposal.category2}` : ""}”分类图标`
    const item = proposal?.current?.item || ""
    const label = `${item ? `“${item}”` : `账目 #${proposal?.id}`}`
    return proposal?.type === "update"
      ? `修改${label}`
      : `删除${label}（账目 #${proposal?.id}）`
  }

  async quick(text: string | undefined) {
    const input = String(text || "").trim()
    if (!input) throw new BadRequestException("请输入要记账的内容")
    const piConfig = await this.settings.runtime()
    const result = await this.coordinator.run(
      `${this.currentUser.userId}:quick`,
      () =>
        runPiLedgerDirectCommand({
          text: input,
          ledger: this.ledger,
          dashboard: (anchor: string) => this.dashboard.build(anchor),
          today: currentDate(),
          piConfig,
        }),
    )
    return {
      message: result.message,
      executed: (result.execution || []).length,
      warning: result.warning,
    }
  }

  async execute(conversationId: string | undefined) {
    const id = this.conversationId(conversationId)
    return this.coordinator.run(this.conversationKey(id), () =>
      this.prisma.$transaction(async (database) => {
        const lockKey = this.conversationKey(id)
        await database.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
        const stored = await database.aiConversation.findFirst({
          where: { id, userId: this.currentUser.userId },
        })
        if (!stored) throw new NotFoundException("对话不存在")
        const operations = Array.isArray(stored.pendingProposals)
          ? (stored.pendingProposals as any[])
          : []
        if (!operations.length) throw new BadRequestException("没有待执行操作")
        const humanEdits = this.editSummary(operations)
        const results = await this.ledger.executeAiOperations(
          operations,
          database,
        )
        const editNotice = humanEdits.length
          ? `\n执行前人工调整：\n${humanEdits.map((item) => `- ${item}`).join("\n")}`
          : ""
        await database.aiMessage.create({
          data: {
            conversationId: id,
            role: "assistant",
            content: `待确认操作已执行，相关统计也已更新。${editNotice}`,
          },
        })
        await database.aiConversation.update({
          where: { id },
          data: { pendingProposals: [], removedNotices: [] },
        })
        return { results }
      }),
    )
  }

  async saveSettings(input: Record<string, unknown>) {
    return this.settings.save(input)
  }

  async outcome(value: string, outcome: "confirmed" | "cancelled") {
    const id = this.conversationId(value)
    return this.coordinator.run(this.conversationKey(id), async () => {
      const exists = await this.prisma.aiConversation.findFirst({
        where: { id, userId: this.currentUser.userId },
      })
      if (!exists) throw new NotFoundException("对话不存在")
      if (outcome === "cancelled")
        await this.prisma.$transaction([
          this.prisma.aiMessage.create({
            data: {
              conversationId: id,
              role: "assistant",
              content: "已取消待确认操作，没有修改账本。",
            },
          }),
          this.prisma.aiConversation.update({
            where: { id },
            data: { pendingProposals: [], removedNotices: [] },
          }),
        ])
      return true
    })
  }
  async remove(value: string) {
    const id = this.conversationId(value)
    return this.coordinator.run(this.conversationKey(id), async () => {
      await this.prisma.aiConversation.deleteMany({
        where: { id, userId: this.currentUser.userId },
      })
      return true
    })
  }
}
