import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js"

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`)
const dateText = (value: Date) => value.toISOString().slice(0, 10)
const validDate = (value: unknown) => {
  const text = String(value || "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  try {
    return dateText(asDate(text)) === text
  } catch {
    return false
  }
}
const shanghaiTodayText = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
const shanghaiToday = () => asDate(shanghaiTodayText())
const clean = (value: unknown, max = 80) =>
  String(value ?? "")
    .trim()
    .slice(0, max)
const positiveMoney = (value: unknown, label = "金额") => {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0)
    throw new BadRequestException(`${label}必须大于 0`)
  return Number(amount.toFixed(2))
}
const frequencies = new Set(["daily", "weekly", "monthly", "yearly"])
const frequencyText: Record<string, string> = {
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
  yearly: "每年",
}
const UNACCOUNTED_ACCOUNT_ID = "none"

const advanceDate = (
  from: Date,
  frequency: string,
  interval: number,
  dayOfMonth?: number | null,
) => {
  const base = new Date(from.getTime())
  if (frequency === "daily") {
    base.setUTCDate(base.getUTCDate() + interval)
    return base
  }
  if (frequency === "weekly") {
    base.setUTCDate(base.getUTCDate() + interval * 7)
    return base
  }
  if (frequency === "monthly") {
    const day = dayOfMonth ?? base.getUTCDate()
    const target = new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + interval, 1),
    )
    const last = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate()
    return new Date(
      Date.UTC(
        target.getUTCFullYear(),
        target.getUTCMonth(),
        Math.min(day, last),
      ),
    )
  }
  if (frequency === "yearly") {
    const day = dayOfMonth ?? base.getUTCDate()
    const year = base.getUTCFullYear() + interval
    const month = base.getUTCMonth()
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    return new Date(Date.UTC(year, month, Math.min(day, last)))
  }
  throw new BadRequestException("不支持的重复频率")
}

type LedgerDatabase = Prisma.TransactionClient

@Injectable()
export class RecurringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecurringService.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.processDueRules().catch((error) =>
      this.logger.error(
        error instanceof Error ? error.stack : String(error),
        "RecurringStartup",
      ),
    )
    this.timer = setInterval(
      () => {
        void this.processDueRules().catch((error) =>
          this.logger.error(
            error instanceof Error ? error.stack : String(error),
            "RecurringTick",
          ),
        )
      },
      60 * 60 * 1000,
    )
    this.timer.unref?.()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private serializeRule(row: any) {
    return {
      id: row.id,
      frequency: row.frequency,
      frequencyText: (() => {
        const unit = frequencyText[row.frequency] || row.frequency
        if (row.interval > 1) {
          const bare = unit.replace(/^每/, "")
          return `每 ${row.interval} ${bare}`
        }
        return unit
      })(),
      interval: row.interval,
      dayOfMonth: row.dayOfMonth,
      startDate: dateText(row.startDate),
      endDate: row.endDate ? dateText(row.endDate) : null,
      nextRunDate: dateText(row.nextRunDate),
      amount: Number(row.amount),
      direction: row.direction,
      item: row.item,
      category1: row.category1,
      category2: row.category2,
      accountId: row.accountId,
      accountName: row.account?.name || null,
      note: row.note || "",
      autoCreate: row.autoCreate,
      enabled: row.enabled,
      lastGeneratedAt: row.lastGeneratedAt
        ? row.lastGeneratedAt.toISOString()
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private serializeGeneration(row: any) {
    return {
      id: row.id,
      ruleId: row.ruleId,
      runDate: dateText(row.runDate),
      status: row.status,
      transactionId: row.transactionId,
      item: row.rule?.item,
      amount: row.rule ? Number(row.rule.amount) : undefined,
      direction: row.rule?.direction,
      category1: row.rule?.category1,
      category2: row.rule?.category2,
      createdAt: row.createdAt.toISOString(),
    }
  }

  private parseTemplate(input: any, existing?: any) {
    const frequency = clean(input?.frequency ?? existing?.frequency, 20)
    if (!frequencies.has(frequency))
      throw new BadRequestException("请选择有效的重复频率")
    const interval = Math.max(
      1,
      Math.floor(Number(input?.interval ?? existing?.interval ?? 1)),
    )
    if (!Number.isFinite(interval) || interval > 365)
      throw new BadRequestException("间隔必须在 1～365 之间")
    const direction =
      clean(input?.direction ?? existing?.direction, 10) === "income"
        ? "income"
        : "expense"
    const amount = positiveMoney(input?.amount ?? existing?.amount)
    const item = clean(input?.item ?? existing?.item, 80)
    if (!item) throw new BadRequestException("请填写项目名称")
    const category1 = clean(input?.category1 ?? existing?.category1, 40)
    const category2 = clean(input?.category2 ?? existing?.category2, 40)
    if (!category1 || !category2)
      throw new BadRequestException("请选择一级和二级分类")
    const note = clean(input?.note ?? existing?.note ?? "", 500)
    const startText = clean(input?.startDate ?? existing?.startDate, 10)
    if (!validDate(startText)) throw new BadRequestException("请填写有效的开始日期")
    const endRaw = input?.endDate === undefined ? existing?.endDate : input.endDate
    const endText = endRaw ? clean(endRaw, 10) : ""
    if (endText && !validDate(endText))
      throw new BadRequestException("结束日期无效")
    if (endText && endText < startText)
      throw new BadRequestException("结束日期不能早于开始日期")
    let dayOfMonth =
      input?.dayOfMonth === undefined
        ? existing?.dayOfMonth
        : Number(input.dayOfMonth)
    if (dayOfMonth === null || dayOfMonth === undefined || dayOfMonth === "") {
      dayOfMonth =
        frequency === "monthly" || frequency === "yearly"
          ? asDate(startText).getUTCDate()
          : null
    } else {
      dayOfMonth = Math.floor(Number(dayOfMonth))
      if (
        !Number.isFinite(dayOfMonth) ||
        dayOfMonth < 1 ||
        dayOfMonth > 31
      )
        throw new BadRequestException("每月日期必须在 1～31 之间")
    }
    const accountRaw =
      input?.accountId === undefined ? existing?.accountId : input.accountId
    const accountId =
      accountRaw === null ||
      accountRaw === undefined ||
      accountRaw === "" ||
      String(accountRaw).trim().toLowerCase() === UNACCOUNTED_ACCOUNT_ID
        ? null
        : clean(accountRaw, 100)
    const autoCreate =
      input?.autoCreate === undefined
        ? (existing?.autoCreate ?? true)
        : Boolean(input.autoCreate)
    const enabled =
      input?.enabled === undefined
        ? (existing?.enabled ?? true)
        : Boolean(input.enabled)
    return {
      frequency,
      interval,
      dayOfMonth,
      startDate: asDate(startText),
      endDate: endText ? asDate(endText) : null,
      amount,
      direction,
      item,
      category1,
      category2,
      accountId,
      note,
      autoCreate,
      enabled,
    }
  }

  async list(ledgerId: string) {
    const today = shanghaiToday()
    const todayText = dateText(today)
    const horizon = new Date(today.getTime())
    horizon.setUTCDate(horizon.getUTCDate() + 7)
    const [rules, pending] = await Promise.all([
      this.prisma.recurringRule.findMany({
        where: { ledgerId },
        include: { account: { select: { name: true } } },
        orderBy: [{ enabled: "desc" }, { nextRunDate: "asc" }, { item: "asc" }],
      }),
      this.prisma.recurringGeneration.findMany({
        where: {
          status: "pending",
          rule: { ledgerId },
        },
        include: { rule: true },
        orderBy: { runDate: "asc" },
      }),
    ])
    const serialized = rules.map((row) => this.serializeRule(row))
    const upcoming = serialized.filter(
      (row) =>
        row.enabled &&
        row.nextRunDate >= todayText &&
        row.nextRunDate <= dateText(horizon) &&
        (!row.endDate || row.nextRunDate <= row.endDate),
    )
    const due = serialized.filter(
      (row) =>
        row.enabled &&
        row.nextRunDate <= todayText &&
        (!row.endDate || row.nextRunDate <= row.endDate),
    )
    return {
      today: todayText,
      rules: serialized,
      upcoming,
      due,
      pending: pending.map((row) => this.serializeGeneration(row)),
    }
  }

  async create(ledgerId: string, input: unknown) {
    const data = this.parseTemplate(input)
    if (data.accountId) {
      const account = await this.prisma.account.findFirst({
        where: { id: data.accountId, ledgerId, enabled: true },
      })
      if (!account) throw new BadRequestException("所选账户不存在或已停用")
      if (account.type === "loan")
        throw new BadRequestException("贷款账户不能用于定期账单")
    }
    const row = await this.prisma.recurringRule.create({
      data: {
        ledgerId,
        ...data,
        amount: new Prisma.Decimal(data.amount),
        nextRunDate: data.startDate,
      },
      include: { account: { select: { name: true } } },
    })
    await this.prisma.auditLog.create({
      data: {
        action: "create",
        entityType: "recurring_rule",
        entityId: row.id,
        payload: this.serializeRule(row),
      },
    })
    return this.serializeRule(row)
  }

  async update(ledgerId: string, id: unknown, input: unknown) {
    const existing = await this.prisma.recurringRule.findFirst({
      where: { id: clean(id, 100), ledgerId },
      include: { account: { select: { name: true } } },
    })
    if (!existing) throw new NotFoundException("定期规则不存在")
    const data = this.parseTemplate(input, {
      ...existing,
      startDate: dateText(existing.startDate),
      endDate: existing.endDate ? dateText(existing.endDate) : null,
      amount: Number(existing.amount),
    })
    if (data.accountId) {
      const accountChanged = data.accountId !== existing.accountId
      if (accountChanged) {
        const account = await this.prisma.account.findFirst({
          where: { id: data.accountId, ledgerId, enabled: true },
        })
        if (!account) throw new BadRequestException("所选账户不存在或已停用")
        if (account.type === "loan")
          throw new BadRequestException("贷款账户不能用于定期账单")
      }
    }
    const nextInput = clean((input as any)?.nextRunDate, 10)
    const nextRunDate = nextInput
      ? validDate(nextInput)
        ? asDate(nextInput)
        : (() => {
            throw new BadRequestException("下次生成日期无效")
          })()
      : existing.nextRunDate
    const row = await this.prisma.recurringRule.update({
      where: { id: existing.id },
      data: {
        ...data,
        amount: new Prisma.Decimal(data.amount),
        nextRunDate,
      },
      include: { account: { select: { name: true } } },
    })
    await this.prisma.auditLog.create({
      data: {
        action: "update",
        entityType: "recurring_rule",
        entityId: row.id,
        payload: this.serializeRule(row),
      },
    })
    return this.serializeRule(row)
  }

  async remove(ledgerId: string, id: unknown) {
    const existing = await this.prisma.recurringRule.findFirst({
      where: { id: clean(id, 100), ledgerId },
    })
    if (!existing) throw new NotFoundException("定期规则不存在")
    await this.prisma.recurringRule.delete({ where: { id: existing.id } })
    await this.prisma.auditLog.create({
      data: {
        action: "delete",
        entityType: "recurring_rule",
        entityId: existing.id,
        payload: { id: existing.id, item: existing.item },
      },
    })
    return { ok: true, id: existing.id }
  }

  async skipNext(ledgerId: string, id: unknown) {
    const rule = await this.prisma.recurringRule.findFirst({
      where: { id: clean(id, 100), ledgerId },
      include: { account: { select: { name: true } } },
    })
    if (!rule) throw new NotFoundException("定期规则不存在")
    const runDate = rule.nextRunDate
    await this.prisma.$transaction(async (database) => {
      await database.recurringGeneration.upsert({
        where: {
          ruleId_runDate: { ruleId: rule.id, runDate },
        },
        update: { status: "skipped", transactionId: null },
        create: {
          ruleId: rule.id,
          runDate,
          status: "skipped",
        },
      })
      const next = advanceDate(
        runDate,
        rule.frequency,
        rule.interval,
        rule.dayOfMonth,
      )
      const ended = rule.endDate && next > rule.endDate
      await database.recurringRule.update({
        where: { id: rule.id },
        data: {
          nextRunDate: next,
          ...(ended ? { enabled: false } : {}),
        },
      })
    })
    const updated = await this.prisma.recurringRule.findFirstOrThrow({
      where: { id: rule.id },
      include: { account: { select: { name: true } } },
    })
    return this.serializeRule(updated)
  }

  async generateNow(ledgerId: string, id: unknown) {
    const rule = await this.prisma.recurringRule.findFirst({
      where: { id: clean(id, 100), ledgerId },
    })
    if (!rule) throw new NotFoundException("定期规则不存在")
    const result = await this.prisma.$transaction((database) =>
      this.generateOne(database, rule, rule.nextRunDate, true),
    )
    return result
  }

  async confirmPending(ledgerId: string, generationId: unknown) {
    const generation = await this.prisma.recurringGeneration.findFirst({
      where: {
        id: clean(generationId, 100),
        status: "pending",
        rule: { ledgerId },
      },
      include: { rule: true },
    })
    if (!generation) throw new NotFoundException("待确认生成记录不存在")
    return this.prisma.$transaction(async (database) => {
      const created = await this.createTransactionFromRule(
        database,
        generation.rule,
        generation.runDate,
      )
      await database.recurringGeneration.update({
        where: { id: generation.id },
        data: {
          status: "created",
          transactionId: created.id,
        },
      })
      return {
        generation: this.serializeGeneration({
          ...generation,
          status: "created",
          transactionId: created.id,
        }),
        transaction: created,
      }
    })
  }

  async dismissPending(ledgerId: string, generationId: unknown) {
    const generation = await this.prisma.recurringGeneration.findFirst({
      where: {
        id: clean(generationId, 100),
        status: "pending",
        rule: { ledgerId },
      },
    })
    if (!generation) throw new NotFoundException("待确认生成记录不存在")
    await this.prisma.recurringGeneration.update({
      where: { id: generation.id },
      data: { status: "skipped", transactionId: null },
    })
    return { ok: true, id: generation.id }
  }

  async processDueRules() {
    if (this.running) return { skipped: true }
    this.running = true
    try {
      const today = shanghaiToday()
      const rules = await this.prisma.recurringRule.findMany({
        where: {
          enabled: true,
          nextRunDate: { lte: today },
        },
      })
      let processed = 0
      let created = 0
      let pending = 0
      for (const rule of rules) {
        let current = rule
        // Catch up missed periods without infinite loops
        for (let guard = 0; guard < 366; guard += 1) {
          if (!current.enabled) break
          if (current.nextRunDate > today) break
          if (current.endDate && current.nextRunDate > current.endDate) {
            await this.prisma.recurringRule.update({
              where: { id: current.id },
              data: { enabled: false },
            })
            break
          }
          const outcome = await this.prisma.$transaction((database) =>
            this.generateOne(database, current, current.nextRunDate, false),
          )
          processed += 1
          if (outcome.status === "created") created += 1
          if (outcome.status === "pending") pending += 1
          const refreshed = await this.prisma.recurringRule.findFirst({
            where: { id: current.id },
          })
          if (!refreshed) break
          current = refreshed
        }
      }
      if (processed)
        this.logger.log(
          `定期账单扫描完成：处理 ${processed} 次，入账 ${created}，待确认 ${pending}`,
        )
      return { processed, created, pending }
    } finally {
      this.running = false
    }
  }

  private async generateOne(
    database: LedgerDatabase,
    rule: any,
    runDate: Date,
    forceCreate: boolean,
  ) {
    const existing = await database.recurringGeneration.findUnique({
      where: {
        ruleId_runDate: { ruleId: rule.id, runDate },
      },
    })
    if (existing && existing.status !== "pending") {
      const next = advanceDate(
        runDate,
        rule.frequency,
        rule.interval,
        rule.dayOfMonth,
      )
      const ended = rule.endDate && next > rule.endDate
      await database.recurringRule.update({
        where: { id: rule.id },
        data: {
          nextRunDate: next,
          ...(ended ? { enabled: false } : {}),
        },
      })
      return { status: existing.status as string, skippedDuplicate: true }
    }

    const shouldCreate = forceCreate || rule.autoCreate
    let transactionId: number | null = null
    let status = "pending"
    if (shouldCreate) {
      const created = await this.createTransactionFromRule(
        database,
        rule,
        runDate,
      )
      transactionId = created.id
      status = "created"
    }

    if (existing) {
      await database.recurringGeneration.update({
        where: { id: existing.id },
        data: { status, transactionId },
      })
    } else {
      await database.recurringGeneration.create({
        data: {
          ruleId: rule.id,
          runDate,
          status,
          transactionId,
        },
      })
    }

    const next = advanceDate(
      runDate,
      rule.frequency,
      rule.interval,
      rule.dayOfMonth,
    )
    const ended = rule.endDate && next > rule.endDate
    await database.recurringRule.update({
      where: { id: rule.id },
      data: {
        nextRunDate: next,
        lastGeneratedAt: new Date(),
        ...(ended ? { enabled: false } : {}),
      },
    })
    return { status, transactionId }
  }

  private async createTransactionFromRule(
    database: LedgerDatabase,
    rule: any,
    runDate: Date,
  ) {
    await database.project.upsert({
      where: { ledgerId_name: { ledgerId: rule.ledgerId, name: rule.item } },
      update: { enabled: true },
      create: { ledgerId: rule.ledgerId, name: rule.item },
    })
    const category = await database.category.upsert({
      where: {
        ledgerId_category1_category2: {
          ledgerId: rule.ledgerId,
          category1: rule.category1,
          category2: rule.category2,
        },
      },
      update: { enabled: true },
      create: {
        ledgerId: rule.ledgerId,
        category1: rule.category1,
        category2: rule.category2,
      },
    })
    let accountId: string | null = rule.accountId || null
    if (accountId) {
      const account = await database.account.findFirst({
        where: {
          id: accountId,
          ledgerId: rule.ledgerId,
          enabled: true,
          type: { not: "loan" },
        },
      })
      if (!account) accountId = null
    }
    const signed =
      rule.direction === "income"
        ? Number(rule.amount)
        : -Math.abs(Number(rule.amount))
    const row = await database.transaction.create({
      data: {
        ledgerId: rule.ledgerId,
        categoryId: category.id,
        accountId,
        date: runDate,
        amount: new Prisma.Decimal(signed),
        item: rule.item,
        category1: rule.category1,
        category2: rule.category2,
        note: rule.note || "",
      },
    })
    await database.auditLog.create({
      data: {
        action: "create",
        entityType: "transaction",
        entityId: String(row.id),
        payload: {
          source: "recurring",
          ruleId: rule.id,
          date: dateText(runDate),
          amount: signed,
          item: rule.item,
          category1: rule.category1,
          category2: rule.category2,
          note: rule.note || "",
        },
      },
    })
    return {
      id: row.id,
      date: dateText(row.date),
      amount: Number(row.amount),
      item: row.item,
      category1: row.category1,
      category2: row.category2,
      accountId: row.accountId,
      note: row.note,
    }
  }
}
