import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Scope,
} from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { normalizeRecord } from "../../../lib/db.mjs"
import { CurrentUserService } from "../../modules/auth/current-user.service.js"
import { PrismaService } from "../prisma/prisma.service.js"

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
const today = () => asDate(dateText(new Date()))
const positiveMoney = (value: unknown, label = "金额") => {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0)
    throw new BadRequestException(`${label}必须大于 0`)
  return Number(amount.toFixed(2))
}
const moneyValue = (value: unknown) => {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount < 0)
    throw new BadRequestException("金额不能小于 0")
  return Number(amount.toFixed(2))
}
const liabilityAccountTypes = new Set(["credit", "loan"])
const assetAccountTypes = new Set(["cash", "bank", "ewallet"])
const accountTypes = new Set(["cash", "bank", "ewallet", "credit", "loan"])
const accountTypeText: Record<string, string> = {
  cash: "现金",
  bank: "银行卡",
  ewallet: "电子钱包",
  credit: "信用账户",
  loan: "贷款账户",
}
const inferTransferKind = (fromType: string, toType: string) => {
  if (fromType === "loan" && assetAccountTypes.has(toType))
    return "debt_drawdown"
  if (assetAccountTypes.has(fromType) && liabilityAccountTypes.has(toType))
    return "debt_payment"
  return "transfer"
}
const availableQuotaOf = (balance: number) =>
  Number(Math.max(0, balance).toFixed(2))
const outstandingOf = (balance: number) =>
  Number(Math.max(0, -balance).toFixed(2))
const clean = (value: unknown, max = 80) =>
  String(value ?? "")
    .trim()
    .slice(0, max)
const cleanIcon = (value: unknown, fallback: string) => {
  const icon = clean(value, 40)
  return /^[a-z0-9-]{1,40}$/.test(icon) ? icon : fallback
}
const UNACCOUNTED_ACCOUNT_ID = "none"
const UNACCOUNTED_ACCOUNT_LABEL = "不记账户"
const hasOwnAccountId = (record: unknown) =>
  Boolean(
    record &&
      typeof record === "object" &&
      Object.prototype.hasOwnProperty.call(record, "accountId"),
  )
const isUnaccountedAccountId = (value: unknown) => {
  if (value === null || value === undefined) return true
  const text = String(value).trim().toLowerCase()
  return !text || text === UNACCOUNTED_ACCOUNT_ID
}
const requestedAccountAction = (record: unknown): "omit" | "none" | string => {
  if (!hasOwnAccountId(record)) return "omit"
  const value = (record as { accountId?: unknown }).accountId
  return isUnaccountedAccountId(value) ? "none" : clean(value, 100)
}
type LedgerDatabase = Prisma.TransactionClient

@Injectable({ scope: Scope.REQUEST })
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserService,
  ) {}

  get path() {
    try {
      const url = new URL(process.env.DATABASE_URL || "")
      return `postgresql://${url.hostname}:${url.port || "5432"}${url.pathname}`
    } catch {
      return "postgresql"
    }
  }

  async context() {
    return this.contextWith(this.prisma)
  }

  private async contextWith(database: PrismaService | LedgerDatabase) {
    const ledgerId = this.currentUser.ledgerId
    let account = await database.account.findFirst({
      where: {
        ledgerId,
        enabled: true,
        type: { not: "loan" },
      },
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
    })
    account ||= await database.account.create({
      data: {
        ledgerId,
        name: "默认账户",
        type: "cash",
        isDefault: true,
      },
    })
    if (!account.isDefault) {
      await database.account.updateMany({
        where: { ledgerId, isDefault: true },
        data: { isDefault: false },
      })
      account = await database.account.update({
        where: { id: account.id },
        data: { isDefault: true },
      })
    }
    return { ledgerId, accountId: account.id }
  }

  private serialize(row: any) {
    const tags = (row.tags || []).map((entry: any) => ({
      id: entry.tag.id,
      name: entry.tag.name,
      color: entry.tag.color,
    }))
    return {
      ...row,
      date: dateText(row.date),
      amount: Number(row.amount),
      accountName: row.account?.name || UNACCOUNTED_ACCOUNT_LABEL,
      primaryIcon: row.category?.primaryIcon,
      secondaryIcon: row.category?.secondaryIcon,
      tags,
      tagIds: tags.map((tag: any) => tag.id),
      account: undefined,
      category: undefined,
      created_at: row.createdAt?.toISOString?.() || row.createdAt,
      createdAt: undefined,
      updatedAt: undefined,
      ledgerId: undefined,
    }
  }

  private async inheritedPrimaryIcon(
    database: LedgerDatabase,
    ledgerId: string,
    category1: string,
    fallback = "folder",
  ) {
    const sibling = await database.category.findFirst({
      where: { ledgerId, category1 },
      select: { primaryIcon: true },
      orderBy: { createdAt: "asc" },
    })
    return sibling?.primaryIcon || fallback
  }

  async allTransactions() {
    const { ledgerId } = await this.context()
    const rows = await this.prisma.transaction.findMany({
      where: { ledgerId },
      include: {
        account: { select: { name: true } },
        category: { select: { primaryIcon: true, secondaryIcon: true } },
        tags: { include: { tag: true } },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    })
    return rows.map((row) => this.serialize(row))
  }

  async listTransactions(limit: string | number | null = 100) {
    const { ledgerId } = await this.context()
    const take = Math.min(Math.max(Number(limit) || 100, 1), 500)
    const rows = await this.prisma.transaction.findMany({
      where: { ledgerId },
      include: {
        account: { select: { name: true } },
        category: { select: { primaryIcon: true, secondaryIcon: true } },
        tags: { include: { tag: true } },
      },
      take,
      orderBy: [{ date: "desc" }, { id: "desc" }],
    })
    return rows.map((row) => this.serialize(row))
  }

  async pageTransactions({
    page = 1,
    pageSize = 20,
    date = "",
    month = "",
    start = "",
    end = "",
    query = "",
    category1 = "",
    category2 = "",
    direction = "",
    sortBy = "date",
    sortOrder = "desc",
    accountId = "",
    tagId = "",
    tagIds = "",
    tagMatch = "",
  }: Record<string, unknown> = {}) {
    const { ledgerId } = await this.context()
    const take = Math.min(Math.max(Number(pageSize) || 20, 1), 100)
    const selectedDate = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(
      String(date),
    )
      ? String(date)
      : ""
    const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))
      ? String(month)
      : ""
    const selectedStart = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(
      String(start),
    )
      ? String(start)
      : ""
    const selectedEnd = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(
      String(end),
    )
      ? String(end)
      : ""
    const search = clean(query, 80)
    const primary = clean(category1, 40)
    const secondary = clean(category2, 40)
    const selectedDirection = ["expense", "income"].includes(String(direction))
      ? String(direction)
      : ""
    const where: Prisma.TransactionWhereInput = { ledgerId }
    if (selectedDate) {
      const [year, monthNumber, day] = selectedDate.split("-").map(Number)
      where.date = {
        gte: new Date(Date.UTC(year, monthNumber - 1, day)),
        lt: new Date(Date.UTC(year, monthNumber - 1, day + 1)),
      }
    } else if (selectedMonth) {
      const [year, monthNumber] = selectedMonth.split("-").map(Number)
      where.date = {
        gte: new Date(Date.UTC(year, monthNumber - 1, 1)),
        lt: new Date(Date.UTC(year, monthNumber, 1)),
      }
    } else if (selectedStart && selectedEnd && selectedStart <= selectedEnd) {
      const [startYear, startMonth, startDay] = selectedStart
        .split("-")
        .map(Number)
      const [endYear, endMonth, endDay] = selectedEnd.split("-").map(Number)
      where.date = {
        gte: new Date(Date.UTC(startYear, startMonth - 1, startDay)),
        lt: new Date(Date.UTC(endYear, endMonth - 1, endDay + 1)),
      }
    }
    if (search)
      where.OR = [
        ...["item", "note", "category1", "category2"].map((field) => ({
          [field]: { contains: search, mode: "insensitive" },
        })),
        {
          tags: {
            some: { tag: { name: { contains: search, mode: "insensitive" } } },
          },
        },
      ] as Prisma.TransactionWhereInput[]
    if (primary) where.category1 = primary
    if (secondary) where.category2 = secondary
    if (selectedDirection)
      where.amount = selectedDirection === "expense" ? { lt: 0 } : { gt: 0 }
    const selectedAccountId = clean(accountId, 100)
    if (selectedAccountId === UNACCOUNTED_ACCOUNT_ID) where.accountId = null
    else if (selectedAccountId) where.accountId = selectedAccountId
    const selectedTagIds = [
      ...new Set(
        [
          clean(tagId, 100),
          ...String(tagIds || "")
            .split(",")
            .map((value) => clean(value, 100)),
        ].filter(Boolean),
      ),
    ]
    if (selectedTagIds.length === 1) {
      where.tags = { some: { tagId: selectedTagIds[0] } }
    } else if (selectedTagIds.length > 1) {
      const matchAll = String(tagMatch).toLowerCase() === "all"
      if (matchAll) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          ...selectedTagIds.map((id) => ({
            tags: { some: { tagId: id } },
          })),
        ]
      } else {
        where.tags = { some: { tagId: { in: selectedTagIds } } }
      }
    }
    const orderField = ["date", "amount", "item"].includes(String(sortBy))
      ? String(sortBy)
      : "date"
    const order = String(sortOrder).toLowerCase() === "asc" ? "asc" : "desc"
    const total = await this.prisma.transaction.count({ where })
    const totalPages = Math.max(1, Math.ceil(total / take))
    const current = Math.min(Math.max(Number(page) || 1, 1), totalPages)
    const [expenseAgg, incomeAgg, rows] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { ...where, amount: { lt: 0 } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { ...where, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.findMany({
        where,
        include: {
          account: { select: { name: true } },
          category: { select: { primaryIcon: true, secondaryIcon: true } },
          tags: { include: { tag: true } },
        },
        take,
        skip: (current - 1) * take,
        orderBy: [{ [orderField]: order }, { id: order }],
      }),
    ])
    const expense = Number(
      Math.abs(Number(expenseAgg._sum.amount || 0)).toFixed(2),
    )
    const income = Number(Number(incomeAgg._sum.amount || 0).toFixed(2))
    const balance = Number((income - expense).toFixed(2))
    return {
      records: rows.map((row) => this.serialize(row)),
      total,
      page: current,
      pageSize: take,
      totalPages,
      summary: { expense, income, balance },
      date: selectedDate,
      month: selectedMonth,
      start: selectedStart,
      end: selectedEnd,
      query: search,
      category1: primary,
      category2: secondary,
      direction: selectedDirection,
      sortBy: orderField,
      sortOrder: order,
      tagIds: selectedTagIds,
      tagMatch:
        selectedTagIds.length > 1 &&
        String(tagMatch).toLowerCase() === "all"
          ? "all"
          : "any",
    }
  }

  async get(id: string | number) {
    const { ledgerId } = await this.context()
    const row = await this.prisma.transaction.findFirst({
      where: { id: Number(id), ledgerId },
      include: {
        account: { select: { name: true } },
        category: { select: { primaryIcon: true, secondaryIcon: true } },
        tags: { include: { tag: true } },
      },
    })
    return row ? this.serialize(row) : null
  }

  async dictionaries() {
    const { ledgerId } = await this.context()
    const [projects, categories, accounts, tags] = await Promise.all([
      this.prisma.project.findMany({
        where: { ledgerId, enabled: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.category.findMany({
        where: { ledgerId, enabled: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.account.findMany({
        where: { ledgerId, enabled: true, type: { not: "loan" } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.tag.findMany({
        where: { ledgerId, enabled: true },
        orderBy: { createdAt: "asc" },
      }),
    ])
    const balances = await this.accountBalancesWithDatabase(
      this.prisma,
      ledgerId,
    )
    return {
      projects: projects.map((row) => row.name),
      categories: categories.map(
        ({ category1, category2, primaryIcon, secondaryIcon }) => ({
          category1,
          category2,
          primaryIcon,
          secondaryIcon,
        }),
      ),
      accounts: accounts.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        typeText: accountTypeText[row.type] || row.type,
        isDefault: row.isDefault,
        availableQuota: availableQuotaOf(balances.get(row.id) || 0),
      })),
      tags: tags.map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
      })),
    }
  }

  private tagColor(value: unknown, fallback = "#0f766e") {
    const color = clean(value, 20)
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback
  }

  private async resolveTransactionTagIds(
    database: LedgerDatabase,
    ledgerId: string,
    input: any,
  ) {
    const rawTagIds: unknown[] = Array.isArray(input?.tagIds)
      ? input.tagIds
      : []
    const rawTagNames: unknown[] = Array.isArray(input?.tagNames)
      ? input.tagNames
      : []
    const requestedIds = [
      ...new Set(rawTagIds.map((value) => clean(value, 100)).filter(Boolean)),
    ].slice(0, 8)
    const requestedNames = [
      ...new Set(rawTagNames.map((value) => clean(value, 40)).filter(Boolean)),
    ].slice(0, 8)
    const existing = requestedIds.length
      ? await database.tag.findMany({
          where: { ledgerId, id: { in: requestedIds } },
          select: { id: true },
        })
      : []
    if (existing.length !== requestedIds.length)
      throw new BadRequestException("包含不存在或已停用的标签")
    const ids = existing.map((row) => row.id)
    for (const name of requestedNames) {
      const tag = await database.tag.upsert({
        where: { ledgerId_name: { ledgerId, name } },
        update: { enabled: true },
        create: { ledgerId, name },
      })
      ids.push(tag.id)
    }
    return [...new Set(ids)].slice(0, 8)
  }

  private tagPeriodRange(value: unknown, scopeValue: unknown = "month") {
    const current = new Date().toISOString().slice(0, 7)
    const scope = clean(scopeValue, 10) === "year" ? "year" : "month"
    const requested = clean(value, 7)
    if (scope === "year") {
      const period = /^\d{4}$/.test(requested)
        ? requested
        : /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)
          ? requested.slice(0, 4)
          : current.slice(0, 4)
      const year = Number(period)
      return {
        scope,
        period,
        start: new Date(Date.UTC(year, 0, 1)),
        end: new Date(Date.UTC(year + 1, 0, 1)),
      }
    }
    const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested)
      ? requested
      : current
    const [year, month] = period.split("-").map(Number)
    return {
      scope,
      period,
      start: new Date(Date.UTC(year, month - 1, 1)),
      end: new Date(Date.UTC(year, month, 1)),
    }
  }

  async tagOverview(periodValue?: unknown, scopeValue?: unknown) {
    const { ledgerId } = await this.context()
    const { scope, period, start, end } = this.tagPeriodRange(
      periodValue,
      scopeValue,
    )
    const [tags, links] = await Promise.all([
      this.prisma.tag.findMany({
        where: { ledgerId },
        include: { _count: { select: { transactions: true } } },
        orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
      }),
      this.prisma.transactionTag.findMany({
        where: {
          tag: { ledgerId },
          transaction: { ledgerId, date: { gte: start, lt: end } },
        },
        include: { transaction: { select: { amount: true } } },
      }),
    ])
    const totals = new Map<
      string,
      { expense: number; income: number; count: number }
    >()
    links.forEach((link) => {
      const current = totals.get(link.tagId) || {
        expense: 0,
        income: 0,
        count: 0,
      }
      const amount = Number(link.transaction.amount)
      current.count += 1
      if (amount < 0) current.expense += Math.abs(amount)
      else current.income += amount
      totals.set(link.tagId, current)
    })
    return {
      scope,
      period,
      ...(scope === "month" ? { month: period } : { year: period }),
      tags: tags.map((tag) => {
        const period = totals.get(tag.id) || {
          expense: 0,
          income: 0,
          count: 0,
        }
        return {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          enabled: tag.enabled,
          usageCount: tag._count.transactions,
          periodCount: period.count,
          expense: Number(period.expense.toFixed(2)),
          income: Number(period.income.toFixed(2)),
        }
      }),
    }
  }

  async tagAnalytics(id: unknown, periodValue?: unknown, scopeValue?: unknown) {
    const { ledgerId } = await this.context()
    const tag = await this.prisma.tag.findFirst({
      where: { id: clean(id, 100), ledgerId },
    })
    if (!tag) throw new NotFoundException("标签不存在")
    const { scope, period, start, end } = this.tagPeriodRange(
      periodValue,
      scopeValue,
    )
    const links = await this.prisma.transactionTag.findMany({
      where: {
        tagId: tag.id,
        transaction: { ledgerId, date: { gte: start, lt: end } },
      },
      include: {
        transaction: {
          include: {
            account: { select: { name: true } },
            category: { select: { primaryIcon: true, secondaryIcon: true } },
            tags: { include: { tag: true } },
          },
        },
      },
      orderBy: { transaction: { date: "desc" } },
    })
    const records = links.map((link) => this.serialize(link.transaction))
    const expenses = records.filter((record) => record.amount < 0)
    const expense = expenses.reduce(
      (sum, record) => sum + Math.abs(record.amount),
      0,
    )
    const income = records
      .filter((record) => record.amount > 0)
      .reduce((sum, record) => sum + record.amount, 0)
    const series = new Map<string, number>()
    const categories = new Map<string, number>()
    expenses.forEach((record) => {
      const seriesKey = scope === "year" ? record.date.slice(0, 7) : record.date
      series.set(
        seriesKey,
        (series.get(seriesKey) || 0) + Math.abs(record.amount),
      )
      categories.set(
        record.category1,
        (categories.get(record.category1) || 0) + Math.abs(record.amount),
      )
    })
    const seriesEntries =
      scope === "year"
        ? Array.from({ length: 12 }, (_, index) => {
            const key = `${period}-${String(index + 1).padStart(2, "0")}`
            return [key, series.get(key) || 0] as const
          })
        : [...series.entries()].sort(([a], [b]) => a.localeCompare(b))
    return {
      scope,
      period,
      ...(scope === "month" ? { month: period } : { year: period }),
      tag: { ...tag },
      summary: {
        expense: Number(expense.toFixed(2)),
        income: Number(income.toFixed(2)),
        count: records.length,
        expenseCount: expenses.length,
        averageExpense: expenses.length
          ? Number((expense / expenses.length).toFixed(2))
          : 0,
      },
      series: seriesEntries.map(([date, amount]) => ({
        date,
        amount: Number(amount.toFixed(2)),
      })),
      categories: [...categories.entries()]
        .map(([name, amount]) => ({ name, amount: Number(amount.toFixed(2)) }))
        .sort((a, b) => b.amount - a.amount),
      records,
    }
  }

  private async createTagWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    input: any,
  ) {
    const name = clean(input?.name, 40)
    if (!name) throw new BadRequestException("请填写标签名称")
    const exists = await database.tag.findFirst({ where: { ledgerId, name } })
    if (exists) throw new BadRequestException("同名标签已经存在")
    return database.tag.create({
      data: {
        ledgerId,
        name,
        color: this.tagColor(input?.color),
      },
    })
  }

  async createTag(input: unknown) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.createTagWithDatabase(database, ledgerId, input),
    )
  }

  private async updateTagWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    id: unknown,
    input: any,
  ) {
    const tag = await database.tag.findFirst({
      where: { id: clean(id, 100), ledgerId },
    })
    if (!tag) throw new NotFoundException("标签不存在")
    const name = clean(input?.name ?? tag.name, 40)
    if (!name) throw new BadRequestException("请填写标签名称")
    const duplicate = await database.tag.findFirst({
      where: { ledgerId, name, id: { not: tag.id } },
    })
    if (duplicate) throw new BadRequestException("同名标签已经存在")
    return database.tag.update({
      where: { id: tag.id },
      data: {
        name,
        color: this.tagColor(input?.color, tag.color),
        ...(input?.enabled === undefined
          ? {}
          : { enabled: Boolean(input.enabled) }),
      },
    })
  }

  async updateTag(id: unknown, input: unknown) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.updateTagWithDatabase(database, ledgerId, id, input),
    )
  }

  private async deleteTagWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    id: unknown,
  ) {
    const tag = await database.tag.findFirst({
      where: { id: clean(id, 100), ledgerId },
      include: { _count: { select: { transactions: true } } },
    })
    if (!tag) throw new NotFoundException("标签不存在")
    await database.tag.delete({ where: { id: tag.id } })
    return { id: tag.id, detachedTransactions: tag._count.transactions }
  }

  async deleteTag(id: unknown) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.deleteTagWithDatabase(database, ledgerId, id),
    )
  }

  private async financeAccount(
    database: PrismaService | LedgerDatabase,
    ledgerId: string,
    id: unknown,
  ) {
    const account = await database.account.findFirst({
      where: { id: clean(id, 100), ledgerId },
    })
    if (!account) throw new NotFoundException("账户不存在")
    return account
  }

  private async usableTransactionAccount(
    database: PrismaService | LedgerDatabase,
    ledgerId: string,
    id: unknown,
  ) {
    const account = await this.financeAccount(database, ledgerId, id)
    if (!account.enabled) throw new BadRequestException("所选账户已经停用")
    if (account.type === "loan")
      throw new BadRequestException("贷款账户不能直接用于普通记账")
    return account
  }

  private async resolveCreateAccount(
    database: LedgerDatabase,
    ledgerId: string,
    record: unknown,
    defaultAccountId: string,
  ) {
    const requested = requestedAccountAction(record)
    if (requested === "none") return null
    return this.usableTransactionAccount(
      database,
      ledgerId,
      requested === "omit" ? defaultAccountId : requested,
    )
  }

  private async accountBalanceWithDatabase(
    database: PrismaService | LedgerDatabase,
    ledgerId: string,
    accountId: string,
    cutoff = today(),
  ) {
    const account = await this.financeAccount(database, ledgerId, accountId)
    const balanceDate = account.balanceDate || null
    const active = !balanceDate || balanceDate <= cutoff
    if (!active) return 0
    const date = balanceDate
      ? { gte: balanceDate, lte: cutoff }
      : { lte: cutoff }
    const [transactions, outgoing, incoming, adjustments] = await Promise.all([
      database.transaction.aggregate({
        where: { ledgerId, accountId, date },
        _sum: { amount: true },
      }),
      database.accountTransfer.aggregate({
        where: { ledgerId, fromAccountId: accountId, date },
        _sum: { amount: true },
      }),
      database.accountTransfer.aggregate({
        where: { ledgerId, toAccountId: accountId, date },
        _sum: { amount: true },
      }),
      database.accountAdjustment.aggregate({
        where: { ledgerId, accountId, date },
        _sum: { amount: true },
      }),
    ])
    return Number(
      (
        Number(account.openingBalance) +
        Number(transactions._sum.amount || 0) -
        Number(outgoing._sum.amount || 0) +
        Number(incoming._sum.amount || 0) +
        Number(adjustments._sum.amount || 0)
      ).toFixed(2),
    )
  }

  private async accountBalancesWithDatabase(
    database: PrismaService | LedgerDatabase,
    ledgerId: string,
    cutoff = today(),
  ) {
    const rows = await database.$queryRaw<
      Array<{ id: string; balance: Prisma.Decimal }>
    >(Prisma.sql`
      SELECT a."id",
        CASE
          WHEN a."balance_date" IS NOT NULL AND a."balance_date" > ${cutoff}
            THEN 0::decimal
          ELSE a."opening_balance"
            + COALESCE((
                SELECT SUM(t."amount") FROM "transactions" t
                WHERE t."ledger_id" = a."ledger_id"
                  AND t."account_id" = a."id"
                  AND t."date" <= ${cutoff}
                  AND (a."balance_date" IS NULL OR t."date" >= a."balance_date")
              ), 0)
            - COALESCE((
                SELECT SUM(x."amount") FROM "account_transfers" x
                WHERE x."ledger_id" = a."ledger_id"
                  AND x."from_account_id" = a."id"
                  AND x."date" <= ${cutoff}
                  AND (a."balance_date" IS NULL OR x."date" >= a."balance_date")
              ), 0)
            + COALESCE((
                SELECT SUM(x."amount") FROM "account_transfers" x
                WHERE x."ledger_id" = a."ledger_id"
                  AND x."to_account_id" = a."id"
                  AND x."date" <= ${cutoff}
                  AND (a."balance_date" IS NULL OR x."date" >= a."balance_date")
              ), 0)
            + COALESCE((
                SELECT SUM(j."amount") FROM "account_adjustments" j
                WHERE j."ledger_id" = a."ledger_id"
                  AND j."account_id" = a."id"
                  AND j."date" <= ${cutoff}
                  AND (a."balance_date" IS NULL OR j."date" >= a."balance_date")
              ), 0)
        END AS "balance"
      FROM "accounts" a
      WHERE a."ledger_id" = ${ledgerId}
    `)
    return new Map(
      rows.map((row) => [row.id, Number(Number(row.balance).toFixed(2))]),
    )
  }

  private presentAccount(account: any, balance: number) {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      typeText: accountTypeText[account.type] || account.type,
      openingBalance: Number(account.openingBalance),
      balanceDate: account.balanceDate ? dateText(account.balanceDate) : null,
      balance,
      availableQuota: availableQuotaOf(balance),
      outstanding: outstandingOf(balance),
      isLiability: liabilityAccountTypes.has(account.type),
      isDefault: account.isDefault,
      enabled: account.enabled,
    }
  }

  private async createAccountWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    input: any,
  ) {
    const name = clean(input?.name, 80)
    if (!name) throw new BadRequestException("请填写账户名称")
    const type = String(input?.type || "cash")
    if (!accountTypes.has(type)) throw new BadRequestException("账户类型无效")
    const openingBalance = moneyValue(input?.openingBalance)
    const balanceDateText = clean(input?.balanceDate, 10) || dateText(today())
    if (!validDate(balanceDateText))
      throw new BadRequestException("余额起算日期无效")
    const balanceDate = asDate(balanceDateText)
    const isDefault = Boolean(input?.isDefault) && type !== "loan"
    if (isDefault)
      await database.account.updateMany({
        where: { ledgerId, isDefault: true },
        data: { isDefault: false },
      })
    const existingCount = await database.account.count({ where: { ledgerId } })
    const account = await database.account.create({
      data: {
        ledgerId,
        name,
        type,
        openingBalance: new Prisma.Decimal(openingBalance),
        balanceDate,
        isDefault: isDefault || (existingCount === 0 && type !== "loan"),
      },
    })
    await database.auditLog.create({
      data: {
        action: "create",
        entityType: "account",
        entityId: account.id,
        payload: {
          name,
          type,
          openingBalance,
          balanceDate: balanceDateText,
          isDefault: account.isDefault,
        },
      },
    })
    return this.presentAccount(
      account,
      await this.accountBalanceWithDatabase(database, ledgerId, account.id),
    )
  }

  async createAccount(input: unknown) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.createAccountWithDatabase(database, ledgerId, input),
    )
  }

  async updateAccount(id: unknown, input: any) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.updateAccountWithDatabase(database, ledgerId, id, input),
    )
  }

  private async updateAccountWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    id: unknown,
    input: any,
  ) {
    const account = await this.financeAccount(database, ledgerId, id)
    const name = clean(input?.name ?? account.name, 80)
    if (!name) throw new BadRequestException("请填写账户名称")
    const isDefault =
      input?.isDefault === undefined
        ? account.isDefault
        : Boolean(input.isDefault)
    if (isDefault && account.type === "loan")
      throw new BadRequestException("贷款账户不能设为日常默认付款账户")
    if (account.isDefault && input?.isDefault === false)
      throw new BadRequestException(
        "默认状态不能直接取消，请先设置其他默认账户",
      )
    const enabled =
      input?.enabled === undefined ? account.enabled : Boolean(input.enabled)
    if (isDefault && !enabled)
      throw new BadRequestException("默认账户不能停用，请先设置其他默认账户")
    const openingBalance =
      input?.openingBalance === undefined
        ? Number(account.openingBalance)
        : moneyValue(input.openingBalance)
    if (isDefault)
      await database.account.updateMany({
        where: { ledgerId, isDefault: true, id: { not: account.id } },
        data: { isDefault: false },
      })
    const updated = await database.account.update({
      where: { id: account.id },
      data: {
        name,
        isDefault,
        enabled,
        openingBalance: new Prisma.Decimal(openingBalance),
      },
    })
    await database.auditLog.create({
      data: {
        action: "update",
        entityType: "account",
        entityId: account.id,
        payload: {
          name,
          isDefault,
          enabled: updated.enabled,
          openingBalance,
        },
      },
    })
    const balance = await this.accountBalanceWithDatabase(
      database,
      ledgerId,
      updated.id,
    )
    return this.presentAccount(updated, balance)
  }

  private async reconcileAccountWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    id: unknown,
    input: any,
  ) {
    const account = await this.financeAccount(database, ledgerId, id)
    if (!account.enabled) throw new BadRequestException("停用账户不能校准余额")
    const target = Number(input?.balance)
    if (!Number.isFinite(target))
      throw new BadRequestException("请填写正确余额")
    const current = await this.accountBalanceWithDatabase(
      database,
      ledgerId,
      account.id,
    )
    const amount = Number((target - current).toFixed(2))
    if (!amount) return { accountId: account.id, balance: current, adjusted: 0 }
    const adjustment = await database.accountAdjustment.create({
      data: {
        ledgerId,
        accountId: account.id,
        date: today(),
        amount: new Prisma.Decimal(amount),
        note: clean(input?.note, 500) || "余额校准",
      },
    })
    await database.auditLog.create({
      data: {
        action: "reconcile",
        entityType: "account",
        entityId: account.id,
        payload: { before: current, after: Number(target.toFixed(2)), amount },
      },
    })
    return {
      id: adjustment.id,
      accountId: account.id,
      balance: Number(target.toFixed(2)),
      adjusted: amount,
    }
  }

  async reconcileAccount(id: unknown, input: any) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.reconcileAccountWithDatabase(database, ledgerId, id, input),
    )
  }

  private async deleteAccountWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    id: unknown,
  ) {
    const account = await this.financeAccount(database, ledgerId, id)
    if (account.isDefault)
      throw new BadRequestException("默认账户不能删除，请先设置其他默认账户")
    const [transactions, outgoing, incoming, adjustments] = await Promise.all([
      database.transaction.count({
        where: { ledgerId, accountId: account.id },
      }),
      database.accountTransfer.count({
        where: { ledgerId, fromAccountId: account.id },
      }),
      database.accountTransfer.count({
        where: { ledgerId, toAccountId: account.id },
      }),
      database.accountAdjustment.count({
        where: { ledgerId, accountId: account.id },
      }),
    ])
    const transferCount = outgoing + incoming
    const leftover = [
      transactions ? `${transactions} 笔账单` : "",
      transferCount ? `${transferCount} 笔转账` : "",
      adjustments ? `${adjustments} 条额度调整` : "",
    ].filter(Boolean)
    if (leftover.length)
      throw new BadRequestException(
        `该账户还有${leftover.join("、")}，请先在资金移动里撤销后再删除`,
      )
    const balance = await this.accountBalanceWithDatabase(
      database,
      ledgerId,
      account.id,
    )
    if (Math.abs(balance) >= 0.01)
      throw new BadRequestException("账户余额不为零，不能删除")
    await database.account.delete({ where: { id: account.id } })
    await database.auditLog.create({
      data: {
        action: "delete",
        entityType: "account",
        entityId: account.id,
        payload: { name: account.name },
      },
    })
    return { id: account.id, deleted: true }
  }

  async deleteAccount(id: unknown) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.deleteAccountWithDatabase(database, ledgerId, id),
    )
  }

  private async createTransferWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    input: any,
  ) {
    if (!validDate(input?.date)) throw new BadRequestException("转账日期无效")
    const amount = positiveMoney(input?.amount, "转账金额")
    const from = await this.financeAccount(
      database,
      ledgerId,
      input?.fromAccountId,
    )
    const to = await this.financeAccount(database, ledgerId, input?.toAccountId)
    if (from.id === to.id)
      throw new BadRequestException("转出和转入账户不能相同")
    if (!from.enabled || !to.enabled)
      throw new BadRequestException("停用账户不能继续转账")
    const kind = inferTransferKind(from.type, to.type)
    const transfer = await database.accountTransfer.create({
      data: {
        ledgerId,
        date: asDate(String(input.date)),
        amount: new Prisma.Decimal(amount),
        fromAccountId: from.id,
        toAccountId: to.id,
        kind,
        note: clean(input?.note, 500),
      },
      include: {
        fromAccount: { select: { name: true } },
        toAccount: { select: { name: true } },
      },
    })
    await database.auditLog.create({
      data: {
        action: kind,
        entityType: "account-transfer",
        entityId: transfer.id,
        payload: {
          date: input.date,
          amount,
          fromAccountId: from.id,
          toAccountId: to.id,
          note: transfer.note,
        },
      },
    })
    return {
      ...transfer,
      date: dateText(transfer.date),
      amount: Number(transfer.amount),
      fromAccountName: transfer.fromAccount.name,
      toAccountName: transfer.toAccount.name,
      fromAccount: undefined,
      toAccount: undefined,
    }
  }

  async createTransfer(input: unknown) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.createTransferWithDatabase(database, ledgerId, input),
    )
  }

  private async deleteTransferWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    id: unknown,
  ) {
    const transfer = await database.accountTransfer.findFirst({
      where: { id: clean(id, 100), ledgerId },
    })
    if (!transfer) throw new NotFoundException("资金移动不存在")
    await database.accountTransfer.delete({ where: { id: transfer.id } })
    await database.auditLog.create({
      data: {
        action: "reverse",
        entityType: "account-transfer",
        entityId: transfer.id,
        payload: {
          date: dateText(transfer.date),
          amount: Number(transfer.amount),
          fromAccountId: transfer.fromAccountId,
          toAccountId: transfer.toAccountId,
        },
      },
    })
    return { id: transfer.id, reversed: true }
  }

  async deleteTransfer(id: unknown) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.deleteTransferWithDatabase(database, ledgerId, id),
    )
  }

  private async deleteAdjustmentWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    id: unknown,
  ) {
    const adjustment = await database.accountAdjustment.findFirst({
      where: { id: clean(id, 100), ledgerId },
    })
    if (!adjustment) throw new NotFoundException("额度调整不存在")
    await database.accountAdjustment.delete({ where: { id: adjustment.id } })
    await database.auditLog.create({
      data: {
        action: "reverse",
        entityType: "account-adjustment",
        entityId: adjustment.id,
        payload: {
          date: dateText(adjustment.date),
          amount: Number(adjustment.amount),
          accountId: adjustment.accountId,
        },
      },
    })
    return { id: adjustment.id, reversed: true }
  }

  async deleteAdjustment(id: unknown) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.deleteAdjustmentWithDatabase(database, ledgerId, id),
    )
  }

  private async createRepaymentWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    input: any,
  ) {
    if (!validDate(input?.date)) throw new BadRequestException("还款日期无效")
    const principal = positiveMoney(input?.principal, "偿还本金")
    const interest = moneyValue(input?.interest)
    const fee = moneyValue(input?.fee)
    const from = await this.financeAccount(
      database,
      ledgerId,
      input?.fromAccountId,
    )
    const to = await this.financeAccount(database, ledgerId, input?.toAccountId)
    if (from.id === to.id)
      throw new BadRequestException("付款账户和收款账户不能相同")
    if (!from.enabled || !to.enabled)
      throw new BadRequestException("停用账户不能继续还款")
    if (from.type === "loan")
      throw new BadRequestException("请选择资产或信用账户支付本金")
    if (!liabilityAccountTypes.has(to.type))
      throw new BadRequestException("收款账户必须是信用账户或贷款账户")
    const transfer = await this.createTransferWithDatabase(database, ledgerId, {
      date: input.date,
      amount: principal,
      fromAccountId: from.id,
      toAccountId: to.id,
      note: clean(input?.note, 500) || `${from.name}偿还${to.name}`,
    })
    const expense = await this.createFinanceExpense(
      database,
      ledgerId,
      from.id,
      to.name,
      String(input.date),
      interest,
      fee,
    )
    await database.auditLog.create({
      data: {
        action: "repayment",
        entityType: "account-repayment",
        entityId: transfer.id,
        payload: {
          date: input.date,
          principal,
          interest,
          fee,
          fromAccountId: from.id,
          toAccountId: to.id,
          expenseTransactionId: expense?.id || null,
        },
      },
    })
    return {
      transfer,
      expense: expense
        ? {
            id: expense.id,
            amount: Number(expense.amount),
            item: expense.item,
          }
        : null,
      principal,
      interest,
      fee,
    }
  }

  async createRepayment(input: unknown) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.createRepaymentWithDatabase(database, ledgerId, input),
    )
  }

  private async createFinanceExpense(
    database: LedgerDatabase,
    ledgerId: string,
    accountId: string,
    accountName: string,
    date: string,
    interest: number,
    fee: number,
  ) {
    const amount = Number((interest + fee).toFixed(2))
    if (!amount) return null
    const item = `${accountName}${interest && fee ? "利息与手续费" : interest ? "利息" : "手续费"}`
    await database.project.upsert({
      where: { ledgerId_name: { ledgerId, name: item } },
      update: { enabled: true },
      create: { ledgerId, name: item },
    })
    const category = await database.category.upsert({
      where: {
        ledgerId_category1_category2: {
          ledgerId,
          category1: "财务费用",
          category2: "利息与手续费",
        },
      },
      update: { enabled: true },
      create: {
        ledgerId,
        category1: "财务费用",
        category2: "利息与手续费",
        primaryIcon: "wallet",
        secondaryIcon: "receipt",
      },
    })
    return database.transaction.create({
      data: {
        ledgerId,
        categoryId: category.id,
        accountId,
        date: asDate(date),
        amount: new Prisma.Decimal(-amount),
        item,
        category1: category.category1,
        category2: category.category2,
        note: [
          interest ? `利息 ${interest.toFixed(2)}` : "",
          fee ? `手续费 ${fee.toFixed(2)}` : "",
        ]
          .filter(Boolean)
          .join("；"),
      },
    })
  }

  async financeOverview() {
    const { ledgerId } = await this.context()
    const cutoff = today()
    const monthStart = new Date(
      Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), 1),
    )
    const monthEnd = new Date(
      Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 1),
    )
    const [accounts, balances, transfers, adjustments, unaccountedCount] =
      await Promise.all([
      this.prisma.account.findMany({
        where: { ledgerId },
        orderBy: [
          { isDefault: "desc" },
          { enabled: "desc" },
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
      }),
      this.accountBalancesWithDatabase(this.prisma, ledgerId, cutoff),
      this.prisma.accountTransfer.findMany({
        where: { ledgerId, date: { lte: cutoff } },
        include: {
          fromAccount: { select: { name: true } },
          toAccount: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 12,
      }),
      this.prisma.accountAdjustment.findMany({
        where: { ledgerId, date: { lte: cutoff } },
        include: { account: { select: { name: true } } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 12,
      }),
      this.prisma.transaction.count({
        where: {
          ledgerId,
          accountId: null,
          date: { gte: monthStart, lt: monthEnd },
        },
      }),
    ])
    const accountRows = accounts.map((account) =>
      this.presentAccount(account, balances.get(account.id) || 0),
    )
    const assetTotal = Number(
      accountRows
        .filter((row) => !row.isLiability)
        .reduce((sum, row) => sum + row.balance, 0)
        .toFixed(2),
    )
    const liabilityTotal = Number(
      accountRows
        .filter((row) => row.isLiability)
        .reduce((sum, row) => sum + row.outstanding, 0)
        .toFixed(2),
    )
    return {
      summary: {
        assets: assetTotal,
        liabilities: liabilityTotal,
        netWorth: Number((assetTotal - liabilityTotal).toFixed(2)),
        unaccountedCount,
        unaccountedMonth: dateText(cutoff).slice(0, 7),
      },
      accounts: accountRows,
      recentTransfers: [
        ...transfers.map((row) => ({
          id: row.id,
          date: dateText(row.date),
          amount: Number(row.amount),
          kind: row.kind,
          note: row.note,
          fromAccountId: row.fromAccountId,
          toAccountId: row.toAccountId,
          fromAccountName: row.fromAccount.name,
          toAccountName: row.toAccount.name,
          createdAt: row.createdAt,
          reversible: true,
        })),
        ...adjustments.map((row) => ({
          id: row.id,
          date: dateText(row.date),
          amount: Number(row.amount),
          kind: "adjustment",
          note: row.note,
          fromAccountId: row.accountId,
          toAccountId: row.accountId,
          fromAccountName: row.account.name,
          toAccountName: row.account.name,
          createdAt: row.createdAt,
          reversible: true,
        })),
      ]
        .sort((left, right) => {
          const byDate = right.date.localeCompare(left.date)
          if (byDate) return byDate
          return right.createdAt.getTime() - left.createdAt.getTime()
        })
        .slice(0, 12),
    }
  }

  private async addManyWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    defaultAccountId: string,
    records: any[],
  ) {
    const normalized = records.map((record) => ({
      ...normalizeRecord(record),
      primaryIcon: cleanIcon(record?.primaryIcon, "folder"),
      secondaryIcon: cleanIcon(record?.secondaryIcon, "tag"),
    }))
    const created: any[] = []
    for (let index = 0; index < normalized.length; index += 1) {
      const record = normalized[index]
      const source = records[index]
      const tagIds = await this.resolveTransactionTagIds(
        database,
        ledgerId,
        source,
      )
      const account = await this.resolveCreateAccount(
        database,
        ledgerId,
        source,
        defaultAccountId,
      )
      await database.project.upsert({
        where: { ledgerId_name: { ledgerId, name: record.item } },
        update: { enabled: true },
        create: { ledgerId, name: record.item },
      })
      const primaryIcon = await this.inheritedPrimaryIcon(
        database,
        ledgerId,
        record.category1,
        record.primaryIcon,
      )
      const category = await database.category.upsert({
        where: {
          ledgerId_category1_category2: {
            ledgerId,
            category1: record.category1,
            category2: record.category2,
          },
        },
        update: { enabled: true },
        create: {
          ledgerId,
          category1: record.category1,
          category2: record.category2,
          primaryIcon,
          secondaryIcon: record.secondaryIcon,
        },
      })
      const row = await database.transaction.create({
        data: {
          ledgerId,
          categoryId: category.id,
          accountId: account?.id ?? null,
          date: asDate(record.date),
          amount: new Prisma.Decimal(record.amount),
          item: record.item,
          category1: record.category1,
          category2: record.category2,
          note: record.note,
          tags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
        include: {
          account: { select: { name: true } },
          category: { select: { primaryIcon: true, secondaryIcon: true } },
          tags: { include: { tag: true } },
        },
      })
      created.push(this.serialize(row))
      await database.auditLog.create({
        data: {
          action: "create",
          entityType: "transaction",
          entityId: String(row.id),
          payload: record,
        },
      })
    }
    return created
  }

  async addMany(records: unknown[]) {
    const { ledgerId, accountId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.addManyWithDatabase(database, ledgerId, accountId, records as any[]),
    )
  }

  async update(id: string | number, changes: any) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.updateWithDatabase(database, ledgerId, id, changes),
    )
  }

  private async updateWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    id: string | number,
    changes: any,
  ) {
    const existingRow = await database.transaction.findFirst({
      where: { id: Number(id), ledgerId },
      include: {
        account: { select: { name: true } },
        tags: { include: { tag: true } },
      },
    })
    const existing = existingRow ? this.serialize(existingRow) : null
    if (!existing) throw new Error(`未找到编号为 ${id} 的账目`)
    const merged = normalizeRecord({
      ...existing,
      ...changes,
      amount: changes.amount ?? Math.abs(existing.amount),
      direction:
        changes.direction ?? (existing.amount > 0 ? "income" : "expense"),
    })
    await database.project.upsert({
      where: { ledgerId_name: { ledgerId, name: merged.item } },
      update: { enabled: true },
      create: { ledgerId, name: merged.item },
    })
    const primaryIcon = await this.inheritedPrimaryIcon(
      database,
      ledgerId,
      merged.category1,
      cleanIcon(changes?.primaryIcon, "folder"),
    )
    const category = await database.category.upsert({
      where: {
        ledgerId_category1_category2: {
          ledgerId,
          category1: merged.category1,
          category2: merged.category2,
        },
      },
      update: { enabled: true },
      create: {
        ledgerId,
        category1: merged.category1,
        category2: merged.category2,
        primaryIcon,
        secondaryIcon: cleanIcon(changes?.secondaryIcon, "tag"),
      },
    })
    const hasTagChanges =
      Array.isArray(changes?.tagIds) || Array.isArray(changes?.tagNames)
    const tagIds = hasTagChanges
      ? await this.resolveTransactionTagIds(database, ledgerId, changes)
      : []
    const requestedAccount = requestedAccountAction(changes)
    const accountData =
      requestedAccount === "omit"
        ? {}
        : requestedAccount === "none"
          ? { accountId: null }
          : {
              accountId: (
                await this.usableTransactionAccount(
                  database,
                  ledgerId,
                  requestedAccount,
                )
              ).id,
            }
    const row = await database.transaction.update({
      where: { id: Number(id) },
      data: {
        categoryId: category.id,
        date: asDate(merged.date),
        amount: new Prisma.Decimal(merged.amount),
        item: merged.item,
        category1: merged.category1,
        category2: merged.category2,
        note: merged.note,
        ...accountData,
        ...(hasTagChanges
          ? {
              tags: {
                deleteMany: {},
                create: tagIds.map((tagId) => ({ tagId })),
              },
            }
          : {}),
      },
      include: {
        account: { select: { name: true } },
        category: { select: { primaryIcon: true, secondaryIcon: true } },
        tags: { include: { tag: true } },
      },
    })
    await database.auditLog.create({
      data: {
        action: "update",
        entityType: "transaction",
        entityId: String(id),
        payload: changes,
      },
    })
    return this.serialize(row)
  }

  async bulkCategorize(
    ids: number[],
    changes: { category1: string; category2: string },
  ) {
    const { ledgerId } = await this.context()
    const category1 = clean(changes.category1, 40),
      category2 = clean(changes.category2, 40)
    if (!category1 || !category2 || !ids.length)
      throw new Error("请选择账目和分类")
    return this.prisma.$transaction(async (database) => {
      const primaryIcon = await this.inheritedPrimaryIcon(
        database,
        ledgerId,
        category1,
      )
      const category = await database.category.upsert({
        where: {
          ledgerId_category1_category2: { ledgerId, category1, category2 },
        },
        update: { enabled: true },
        create: { ledgerId, category1, category2, primaryIcon },
      })
      const result = await database.transaction.updateMany({
        where: { ledgerId, id: { in: ids.map(Number) } },
        data: { categoryId: category.id, category1, category2 },
      })
      await database.auditLog.create({
        data: {
          action: "bulk-categorize",
          entityType: "transaction",
          payload: { ids, category1, category2 },
        },
      })
      return result.count
    })
  }

  async delete(id: string | number) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.deleteWithDatabase(database, ledgerId, id),
    )
  }

  private async deleteWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    id: string | number,
  ) {
    const result = await database.transaction.deleteMany({
      where: { id: Number(id), ledgerId },
    })
    if (result.count)
      await database.auditLog.create({
        data: {
          action: "delete",
          entityType: "transaction",
          entityId: String(id),
        },
      })
    return result.count
  }

  async executeAiOperations(
    operations: any[],
    database?: LedgerDatabase,
  ): Promise<any[]> {
    if (!database)
      return this.prisma.$transaction((transaction) =>
        this.executeAiOperations(operations, transaction),
      )
    const { ledgerId, accountId } = await this.contextWith(database)
    const results: any[] = []
    for (const proposal of operations) {
      if (proposal?.type === "create")
        results.push({
          type: "create",
          records: await this.addManyWithDatabase(
            database,
            ledgerId,
            accountId,
            proposal.records || [],
          ),
        })
      else if (proposal?.type === "update")
        results.push({
          type: "update",
          record: await this.updateWithDatabase(
            database,
            ledgerId,
            proposal.id,
            proposal.changes || {},
          ),
        })
      else if (proposal?.type === "delete")
        results.push({
          type: "delete",
          id: proposal.id,
          deleted: Boolean(
            await this.deleteWithDatabase(database, ledgerId, proposal.id),
          ),
        })
      else if (proposal?.type === "category-icon") {
        const category1 = clean(proposal.category1, 40)
        const category2 = clean(proposal.category2, 40)
        const icon = cleanIcon(proposal.icon, "")
        if (!category1 || !icon) throw new Error("分类图标操作内容无效")
        if (category2) {
          const category = await database.category.findFirst({
            where: { ledgerId, category1, category2 },
          })
          if (!category)
            throw new Error(`分类“${category1} / ${category2}”不存在`)
          await database.category.update({
            where: { id: category.id },
            data: { secondaryIcon: icon },
          })
          await database.auditLog.create({
            data: {
              action: "ai-category-secondary-icon-update",
              entityType: "category",
              entityId: category.id,
              payload: { category1, category2, icon },
            },
          })
          results.push({ type: "category-icon", category1, category2, icon })
        } else {
          const updated = await database.category.updateMany({
            where: { ledgerId, category1 },
            data: { primaryIcon: icon },
          })
          if (!updated.count) throw new Error(`一级分类“${category1}”不存在`)
          await database.auditLog.create({
            data: {
              action: "ai-category-primary-icon-update",
              entityType: "category",
              payload: { category1, icon, categories: updated.count },
            },
          })
          results.push({
            type: "category-icon",
            category1,
            icon,
            updated: updated.count,
          })
        }
      } else if (proposal?.type === "account-create")
        results.push({
          type: "account-create",
          account: await this.createAccountWithDatabase(
            database,
            ledgerId,
            proposal.account || {},
          ),
        })
      else if (proposal?.type === "account-update")
        results.push({
          type: "account-update",
          account: await this.updateAccountWithDatabase(
            database,
            ledgerId,
            proposal.accountId,
            proposal.changes || {},
          ),
        })
      else if (proposal?.type === "account-reconcile")
        results.push({
          type: "account-reconcile",
          result: await this.reconcileAccountWithDatabase(
            database,
            ledgerId,
            proposal.accountId,
            proposal.reconcile || {},
          ),
        })
      else if (proposal?.type === "account-delete")
        results.push({
          type: "account-delete",
          result: await this.deleteAccountWithDatabase(
            database,
            ledgerId,
            proposal.accountId,
          ),
        })
      else if (proposal?.type === "tag-create")
        results.push({
          type: "tag-create",
          tag: await this.createTagWithDatabase(
            database,
            ledgerId,
            proposal.tag || {},
          ),
        })
      else if (proposal?.type === "tag-update")
        results.push({
          type: "tag-update",
          tag: await this.updateTagWithDatabase(
            database,
            ledgerId,
            proposal.tagId,
            proposal.changes || {},
          ),
        })
      else if (proposal?.type === "tag-delete")
        results.push({
          type: "tag-delete",
          result: await this.deleteTagWithDatabase(
            database,
            ledgerId,
            proposal.tagId,
          ),
        })
      else if (proposal?.type === "transfer")
        results.push({
          type: "transfer",
          transfer: await this.createTransferWithDatabase(
            database,
            ledgerId,
            proposal.transfer || {},
          ),
        })
      else if (proposal?.type === "transfer-reverse")
        results.push({
          type: "transfer-reverse",
          result: await this.deleteTransferWithDatabase(
            database,
            ledgerId,
            proposal.transferId,
          ),
        })
      else if (proposal?.type === "adjustment-reverse")
        results.push({
          type: "adjustment-reverse",
          result: await this.deleteAdjustmentWithDatabase(
            database,
            ledgerId,
            proposal.adjustmentId,
          ),
        })
      else if (proposal?.type === "repayment")
        results.push({
          type: "repayment",
          repayment: await this.createRepaymentWithDatabase(
            database,
            ledgerId,
            proposal.repayment || {},
          ),
        })
      else throw new Error("包含未知操作")
    }
    return results
  }
}
