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
const accountTypes = new Set(["cash", "bank", "ewallet", "credit", "loan"])
const accountTypeText: Record<string, string> = {
  cash: "现金",
  bank: "银行卡",
  ewallet: "电子钱包",
  credit: "信用账户",
  loan: "贷款账户",
}
const addMonthsClamped = (value: Date, months: number) => {
  const year = value.getUTCFullYear()
  const month = value.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(value.getUTCDate(), lastDay)))
}
const splitMoney = (total: number, count: number) => {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / count)
  const remainder = cents - base * count
  return Array.from(
    { length: count },
    (_, index) => (base + (index === count - 1 ? remainder : 0)) / 100,
  )
}
const clean = (value: unknown, max = 80) =>
  String(value ?? "")
    .trim()
    .slice(0, max)
const cleanIcon = (value: unknown, fallback: string) => {
  const icon = clean(value, 40)
  return /^[a-z0-9-]{1,40}$/.test(icon) ? icon : fallback
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
        type: { in: ["cash", "bank", "ewallet"] },
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
      accountName: row.account?.name || "未指定",
      primaryIcon: row.category?.primaryIcon,
      secondaryIcon: row.category?.secondaryIcon,
      tags,
      tagIds: tags.map((tag: any) => tag.id),
      account: undefined,
      category: undefined,
      liabilityPayments: undefined,
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
    if (clean(accountId, 100)) where.accountId = clean(accountId, 100)
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
        // Dictionaries are consumed by ordinary bookkeeping forms. Loan
        // accounts are managed through the repayment flow and cannot be used
        // as a transaction account.
        where: { ledgerId, enabled: true, type: { not: "loan" } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.tag.findMany({
        where: { ledgerId, enabled: true },
        orderBy: { createdAt: "asc" },
      }),
    ])
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
        isDefault: row.isDefault,
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

  private async createAccountWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    input: any,
  ) {
    const name = clean(input?.name, 80)
    if (!name) throw new BadRequestException("请填写账户名称")
    const type = String(input?.type || "cash")
    if (!accountTypes.has(type)) throw new BadRequestException("账户类型无效")
    const rawOpeningBalance = moneyValue(input?.openingBalance)
    const balanceDateText = clean(input?.balanceDate, 10) || dateText(today())
    if (!validDate(balanceDateText))
      throw new BadRequestException("余额起算日期无效")
    const balanceDate = asDate(balanceDateText)
    const openingBalance = liabilityAccountTypes.has(type)
      ? -rawOpeningBalance
      : rawOpeningBalance
    const isDefault =
      Boolean(input?.isDefault) && !liabilityAccountTypes.has(type)
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
        isDefault:
          isDefault ||
          (existingCount === 0 && !liabilityAccountTypes.has(type)),
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
    return {
      ...account,
      openingBalance: Number(account.openingBalance),
      balanceDate: account.balanceDate ? dateText(account.balanceDate) : null,
      typeText: accountTypeText[account.type] || account.type,
    }
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
    if (isDefault && liabilityAccountTypes.has(account.type))
      throw new BadRequestException("负债账户不能设为日常默认付款账户")
    if (account.isDefault && input?.isDefault === false)
      throw new BadRequestException(
        "默认状态不能直接取消，请先设置其他默认账户",
      )
    const enabled =
      input?.enabled === undefined ? account.enabled : Boolean(input.enabled)
    if (isDefault && !enabled)
      throw new BadRequestException("默认账户不能停用，请先设置其他默认账户")
    if (input?.enabled === false) {
      const activeLiability = await database.liability.findFirst({
        where: { ledgerId, accountId: account.id, status: "active" },
        select: { id: true },
      })
      if (activeLiability)
        throw new BadRequestException("正在还款的负债账户不能停用")
    }
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
      },
    })
    await database.auditLog.create({
      data: {
        action: "update",
        entityType: "account",
        entityId: account.id,
        payload: { name, isDefault, enabled: updated.enabled },
      },
    })
    return {
      ...updated,
      openingBalance: Number(updated.openingBalance),
      balanceDate: updated.balanceDate ? dateText(updated.balanceDate) : null,
      balance: await this.accountBalanceWithDatabase(
        database,
        ledgerId,
        updated.id,
      ),
    }
  }

  private async reconcileAccountWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    id: unknown,
    input: any,
  ) {
    const account = await this.financeAccount(database, ledgerId, id)
    if (!account.enabled) throw new BadRequestException("停用账户不能校准余额")
    const linkedLiability = await database.liability.findFirst({
      where: { ledgerId, accountId: account.id },
      select: { id: true },
    })
    if (linkedLiability)
      throw new BadRequestException(
        "分期负债不能直接校准，请使用还款或撤销还款",
      )
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
    const [
      transactions,
      outgoing,
      incoming,
      liabilities,
      payments,
      adjustments,
    ] = await Promise.all([
      database.transaction.count({
        where: { ledgerId, accountId: account.id },
      }),
      database.accountTransfer.count({
        where: { ledgerId, fromAccountId: account.id },
      }),
      database.accountTransfer.count({
        where: { ledgerId, toAccountId: account.id },
      }),
      database.liability.count({ where: { ledgerId, accountId: account.id } }),
      database.liabilityPayment.count({
        where: { sourceAccountId: account.id },
      }),
      database.accountAdjustment.count({
        where: { ledgerId, accountId: account.id },
      }),
    ])
    const references =
      transactions + outgoing + incoming + liabilities + payments + adjustments
    if (references)
      throw new BadRequestException("该账户已有账单或资金记录，只能停用")
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
    internal = false,
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
    const kind = internal
      ? ["debt_drawdown", "debt_payment"].includes(String(input?.kind))
        ? String(input.kind)
        : "transfer"
      : "transfer"
    if (!internal) {
      const linkedLiability = await database.liability.findFirst({
        where: {
          ledgerId,
          accountId: { in: [from.id, to.id] },
        },
        select: { id: true },
      })
      if (linkedLiability)
        throw new BadRequestException(
          "分期负债不能用普通转账修改，请使用还一期或提前结清",
        )
    }
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
      include: { _count: { select: { liabilityPayments: true } } },
    })
    if (!transfer) throw new NotFoundException("资金移动不存在")
    if (transfer.kind !== "transfer" || transfer._count.liabilityPayments)
      throw new BadRequestException("还款和放款不能按普通转账撤销")
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

  private async createLiabilityWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    input: any,
  ) {
    const name = clean(input?.name, 80)
    if (!name) throw new BadRequestException("请填写负债名称")
    const principal = positiveMoney(input?.principal, "负债本金")
    const totalInterest = moneyValue(input?.totalInterest)
    const totalInstallments = Math.round(Number(input?.totalInstallments))
    if (
      !Number.isInteger(totalInstallments) ||
      totalInstallments < 1 ||
      totalInstallments > 600
    )
      throw new BadRequestException("分期期数应为 1 至 600 期")
    if (!validDate(input?.startDate) || !validDate(input?.firstDueDate))
      throw new BadRequestException("负债日期无效")
    const startDate = asDate(String(input.startDate))
    const firstDueDate = asDate(String(input.firstDueDate))
    if (firstDueDate < startDate)
      throw new BadRequestException("首次还款日不能早于负债开始日")
    const kind = ["loan", "credit", "installment"].includes(String(input?.kind))
      ? String(input.kind)
      : "loan"
    const fundingMode = input?.fundingMode === "deposit" ? "deposit" : "opening"
    const account = await this.createAccountWithDatabase(database, ledgerId, {
      name,
      type: kind === "credit" ? "credit" : "loan",
      openingBalance: fundingMode === "opening" ? principal : 0,
      balanceDate: input.startDate,
    })
    const liability = await database.liability.create({
      data: {
        ledgerId,
        accountId: account.id,
        name,
        kind,
        originalPrincipal: new Prisma.Decimal(principal),
        totalInterest: new Prisma.Decimal(totalInterest),
        startDate,
        firstDueDate,
        totalInstallments,
      },
    })
    const principalParts = splitMoney(principal, totalInstallments)
    const interestParts = splitMoney(totalInterest, totalInstallments)
    await database.liabilityInstallment.createMany({
      data: principalParts.map((part, index) => ({
        liabilityId: liability.id,
        number: index + 1,
        dueDate: addMonthsClamped(firstDueDate, index),
        principal: new Prisma.Decimal(part),
        interest: new Prisma.Decimal(interestParts[index]),
      })),
    })
    let fundingTransfer: any = null
    if (fundingMode === "deposit") {
      if (!input?.targetAccountId)
        throw new BadRequestException("请选择贷款到账账户")
      fundingTransfer = await this.createTransferWithDatabase(
        database,
        ledgerId,
        {
          date: input.startDate,
          amount: principal,
          fromAccountId: account.id,
          toAccountId: input.targetAccountId,
          kind: "debt_drawdown",
          note: `${name}放款`,
        },
        true,
      )
    }
    await database.auditLog.create({
      data: {
        action: "create",
        entityType: "liability",
        entityId: liability.id,
        payload: {
          name,
          kind,
          principal,
          totalInterest,
          totalInstallments,
          fundingMode,
        },
      },
    })
    return {
      id: liability.id,
      name,
      kind,
      accountId: account.id,
      principal,
      totalInterest,
      totalInstallments,
      startDate: dateText(startDate),
      firstDueDate: dateText(firstDueDate),
      fundingTransfer,
    }
  }

  async createLiability(input: unknown) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.createLiabilityWithDatabase(database, ledgerId, input),
    )
  }

  private async createFinanceExpense(
    database: LedgerDatabase,
    ledgerId: string,
    accountId: string,
    liabilityName: string,
    date: string,
    interest: number,
    fee: number,
  ) {
    const amount = Number((interest + fee).toFixed(2))
    if (!amount) return null
    const item = `${liabilityName}${interest && fee ? "利息与手续费" : interest ? "利息" : "手续费"}`
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

  private async recordLiabilityPaymentWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    liabilityId: unknown,
    input: any,
    kind: "scheduled" | "early_settlement",
  ) {
    const liability = await database.liability.findFirst({
      where: { id: clean(liabilityId, 100), ledgerId },
      include: {
        account: true,
        installments: {
          where: { status: "planned" },
          orderBy: { number: "asc" },
        },
      },
    })
    if (!liability) throw new NotFoundException("负债计划不存在")
    if (liability.status !== "active")
      throw new BadRequestException("该负债已经结清")
    if (!validDate(input?.date)) throw new BadRequestException("还款日期无效")
    const source = await this.financeAccount(
      database,
      ledgerId,
      input?.sourceAccountId,
    )
    if (source.id === liability.accountId)
      throw new BadRequestException("还款账户不能与负债账户相同")
    if (!source.enabled || liabilityAccountTypes.has(source.type))
      throw new BadRequestException("请选择启用中的资产账户还款")
    if (!liability.account.enabled)
      throw new BadRequestException("负债账户已停用，不能继续还款")
    const paymentDate = asDate(String(input.date))
    if (paymentDate < liability.startDate)
      throw new BadRequestException("还款日期不能早于负债开始日期")
    const latestPayment = await database.liabilityPayment.findFirst({
      where: { liabilityId: liability.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { date: true },
    })
    if (latestPayment && paymentDate < latestPayment.date)
      throw new BadRequestException("还款日期不能早于上一笔还款")
    const outstanding = Math.max(
      0,
      -(await this.accountBalanceWithDatabase(
        database,
        ledgerId,
        liability.accountId,
        paymentDate,
      )),
    )
    if (outstanding <= 0)
      throw new BadRequestException("该负债账户当前没有待还本金")
    const nextInstallment = liability.installments[0]
    if (kind === "scheduled" && !nextInstallment)
      throw new BadRequestException("没有待还分期")
    const requestedPrincipal =
      kind === "early_settlement"
        ? outstanding
        : positiveMoney(
            input?.principal ?? nextInstallment?.principal,
            "偿还本金",
          )
    if (
      kind === "scheduled" &&
      Number(requestedPrincipal.toFixed(2)) !==
        Number(Number(nextInstallment!.principal).toFixed(2))
    )
      throw new BadRequestException(
        "还一期必须按计划本金偿还；全部还清请使用提前结清",
      )
    const principal = Number(
      Math.min(requestedPrincipal, outstanding).toFixed(2),
    )
    const interest = moneyValue(
      input?.interest ?? (kind === "scheduled" ? nextInstallment?.interest : 0),
    )
    const fee = moneyValue(input?.fee)
    const transfer = await this.createTransferWithDatabase(
      database,
      ledgerId,
      {
        date: input.date,
        amount: principal,
        fromAccountId: source.id,
        toAccountId: liability.accountId,
        kind: "debt_payment",
        note:
          clean(input?.note, 500) ||
          `${liability.name}${kind === "early_settlement" ? "提前结清" : "还款"}`,
      },
      true,
    )
    const expense = await this.createFinanceExpense(
      database,
      ledgerId,
      source.id,
      liability.name,
      String(input.date),
      interest,
      fee,
    )
    const payment = await database.liabilityPayment.create({
      data: {
        liabilityId: liability.id,
        date: asDate(String(input.date)),
        sourceAccountId: source.id,
        principal: new Prisma.Decimal(principal),
        interest: new Prisma.Decimal(interest),
        fee: new Prisma.Decimal(fee),
        kind,
        note: clean(input?.note, 500),
        transferId: transfer.id,
        expenseTransactionId: expense?.id,
      },
    })
    if (kind === "scheduled" && nextInstallment)
      await database.liabilityInstallment.update({
        where: { id: nextInstallment.id },
        data: { status: "paid", paymentId: payment.id },
      })
    const remaining = Number((outstanding - principal).toFixed(2))
    if (kind === "early_settlement" || remaining <= 0) {
      await database.liabilityInstallment.updateMany({
        where: { liabilityId: liability.id, status: "planned" },
        data: { status: "cancelled" },
      })
      await database.liability.update({
        where: { id: liability.id },
        data: { status: "settled", settledAt: asDate(String(input.date)) },
      })
    }
    await database.auditLog.create({
      data: {
        action: kind,
        entityType: "liability-payment",
        entityId: payment.id,
        payload: { liabilityId: liability.id, principal, interest, fee },
      },
    })
    return {
      id: payment.id,
      liabilityId: liability.id,
      liabilityName: liability.name,
      date: String(input.date),
      principal,
      interest,
      fee,
      total: Number((principal + interest + fee).toFixed(2)),
      remainingPrincipal: Math.max(0, remaining),
      settled: kind === "early_settlement" || remaining <= 0,
    }
  }

  async payLiability(id: unknown, input: unknown) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.recordLiabilityPaymentWithDatabase(
        database,
        ledgerId,
        id,
        input,
        "scheduled",
      ),
    )
  }

  async settleLiability(id: unknown, input: unknown) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.recordLiabilityPaymentWithDatabase(
        database,
        ledgerId,
        id,
        input,
        "early_settlement",
      ),
    )
  }

  private async deleteLiabilityPaymentWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    liabilityId: unknown,
    paymentId: unknown,
  ) {
    const liability = await database.liability.findFirst({
      where: { id: clean(liabilityId, 100), ledgerId },
    })
    if (!liability) throw new NotFoundException("负债计划不存在")
    const payment = await database.liabilityPayment.findFirst({
      where: {
        id: clean(paymentId, 100),
        liabilityId: liability.id,
      },
    })
    if (!payment) throw new NotFoundException("还款记录不存在")
    const latest = await database.liabilityPayment.findFirst({
      where: { liabilityId: liability.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    })
    if (latest?.id !== payment.id)
      throw new BadRequestException("只能从最后一笔还款开始撤销")

    await database.liabilityInstallment.updateMany({
      where: { liabilityId: liability.id, paymentId: payment.id },
      data: { status: "planned", paymentId: null },
    })
    if (liability.status === "settled")
      await database.liabilityInstallment.updateMany({
        where: { liabilityId: liability.id, status: "cancelled" },
        data: { status: "planned" },
      })
    await database.liabilityPayment.delete({ where: { id: payment.id } })
    if (payment.expenseTransactionId)
      await database.transaction.deleteMany({
        where: { id: payment.expenseTransactionId, ledgerId },
      })
    await database.accountTransfer.delete({ where: { id: payment.transferId } })
    await database.liability.update({
      where: { id: liability.id },
      data: { status: "active", settledAt: null },
    })
    await database.auditLog.create({
      data: {
        action: "reverse",
        entityType: "liability-payment",
        entityId: payment.id,
        payload: {
          liabilityId: liability.id,
          principal: Number(payment.principal),
          interest: Number(payment.interest),
          fee: Number(payment.fee),
        },
      },
    })
    return { id: payment.id, reversed: true }
  }

  async deleteLiabilityPayment(liabilityId: unknown, paymentId: unknown) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.deleteLiabilityPaymentWithDatabase(
        database,
        ledgerId,
        liabilityId,
        paymentId,
      ),
    )
  }

  async financeOverview() {
    const { ledgerId } = await this.context()
    const cutoff = today()
    const [accounts, accountBalances, liabilities, transfers] =
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
        this.prisma.$queryRaw<Array<{ id: string; balance: Prisma.Decimal }>>(
          Prisma.sql`
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
        `,
        ),
        this.prisma.liability.findMany({
          where: { ledgerId },
          include: {
            account: { select: { name: true, type: true } },
            installments: { orderBy: { number: "asc" } },
            payments: {
              orderBy: { date: "desc" },
              take: 12,
              include: { sourceAccount: { select: { name: true } } },
            },
          },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        }),
        this.prisma.accountTransfer.findMany({
          where: { ledgerId, date: { lte: cutoff } },
          include: {
            fromAccount: { select: { name: true } },
            toAccount: { select: { name: true } },
            liabilityPayments: { select: { id: true, liabilityId: true } },
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: 12,
        }),
      ])
    const computedBalances = new Map(
      accountBalances.map((row) => [row.id, Number(row.balance)]),
    )
    const accountRows = accounts.map((account) => {
      const balance = Number((computedBalances.get(account.id) || 0).toFixed(2))
      return {
        id: account.id,
        name: account.name,
        type: account.type,
        typeText: accountTypeText[account.type] || account.type,
        openingBalance: Number(account.openingBalance),
        balanceDate: account.balanceDate ? dateText(account.balanceDate) : null,
        balance,
        isLiability: liabilityAccountTypes.has(account.type),
        isDefault: account.isDefault,
        enabled: account.enabled,
      }
    })
    const balanceByAccount = new Map(
      accountRows.map((account) => [account.id, account.balance]),
    )
    const liabilityRows = liabilities.map((liability) => {
      const outstandingPrincipal = Math.max(
        0,
        -(balanceByAccount.get(liability.accountId) || 0),
      )
      const installments = liability.installments.map((row) => ({
        id: row.id,
        number: row.number,
        dueDate: dateText(row.dueDate),
        principal: Number(row.principal),
        interest: Number(row.interest),
        fee: Number(row.fee),
        total: Number(
          (
            Number(row.principal) +
            Number(row.interest) +
            Number(row.fee)
          ).toFixed(2),
        ),
        status: row.status,
      }))
      const nextInstallment =
        installments.find((row) => row.status === "planned") || null
      return {
        id: liability.id,
        accountId: liability.accountId,
        name: liability.name,
        kind: liability.kind,
        status: liability.status,
        originalPrincipal: Number(liability.originalPrincipal),
        totalInterest: Number(liability.totalInterest),
        outstandingPrincipal,
        repaidPrincipal: Math.max(
          0,
          Number(liability.originalPrincipal) - outstandingPrincipal,
        ),
        startDate: dateText(liability.startDate),
        firstDueDate: dateText(liability.firstDueDate),
        totalInstallments: liability.totalInstallments,
        settledAt: liability.settledAt ? dateText(liability.settledAt) : null,
        nextInstallment,
        installments,
        payments: liability.payments.map((row) => ({
          id: row.id,
          date: dateText(row.date),
          principal: Number(row.principal),
          interest: Number(row.interest),
          fee: Number(row.fee),
          total: Number(
            (
              Number(row.principal) +
              Number(row.interest) +
              Number(row.fee)
            ).toFixed(2),
          ),
          kind: row.kind,
          sourceAccountName: row.sourceAccount.name,
        })),
      }
    })
    const assetTotal = Number(
      accountRows
        .filter((row) => !row.isLiability)
        .reduce((sum, row) => sum + row.balance, 0)
        .toFixed(2),
    )
    const liabilityTotal = Number(
      accountRows
        .filter((row) => row.isLiability)
        .reduce((sum, row) => sum + Math.max(0, -row.balance), 0)
        .toFixed(2),
    )
    const upcoming = liabilityRows
      .filter((row) => row.status === "active" && row.nextInstallment)
      .map((row) => ({
        liabilityId: row.id,
        liabilityName: row.name,
        ...row.nextInstallment!,
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    const upcomingCutoff = new Date(cutoff)
    upcomingCutoff.setUTCDate(upcomingCutoff.getUTCDate() + 30)
    const upcomingSoon = upcoming.filter(
      (row) => row.dueDate <= dateText(upcomingCutoff),
    )
    return {
      summary: {
        assets: assetTotal,
        liabilities: liabilityTotal,
        netWorth: Number((assetTotal - liabilityTotal).toFixed(2)),
        upcomingAmount: Number(
          upcomingSoon.reduce((sum, row) => sum + row.total, 0).toFixed(2),
        ),
      },
      accounts: accountRows,
      liabilities: liabilityRows,
      upcoming: upcomingSoon,
      recentTransfers: transfers.map((row) => ({
        id: row.id,
        date: dateText(row.date),
        amount: Number(row.amount),
        kind: row.kind,
        note: row.note,
        fromAccountId: row.fromAccountId,
        toAccountId: row.toAccountId,
        fromAccountName: row.fromAccount.name,
        toAccountName: row.toAccount.name,
        paymentId: row.liabilityPayments[0]?.id || null,
        liabilityId: row.liabilityPayments[0]?.liabilityId || null,
        reversible:
          row.kind === "transfer" || Boolean(row.liabilityPayments[0]),
      })),
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
      accountId: clean(record?.accountId, 100),
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
      const account = await this.usableTransactionAccount(
        database,
        ledgerId,
        record.accountId || defaultAccountId,
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
          accountId: account.id,
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
        liabilityPayments: { select: { id: true } },
      },
    })
    const existing = existingRow ? this.serialize(existingRow) : null
    if (!existing) throw new Error(`未找到编号为 ${id} 的账目`)
    if (existingRow!.liabilityPayments.length)
      throw new BadRequestException(
        "还款产生的费用账单不能单独修改，请撤销还款后重新记录",
      )
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
    const accountChanged =
      Boolean(changes.accountId) && changes.accountId !== existingRow!.accountId
    const account = accountChanged
      ? await this.usableTransactionAccount(
          database,
          ledgerId,
          changes.accountId,
        )
      : null
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
        ...(account ? { accountId: account.id } : {}),
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
    const linkedPayment = await database.liabilityPayment.findFirst({
      where: { expenseTransactionId: Number(id), liability: { ledgerId } },
      select: { id: true },
    })
    if (linkedPayment)
      throw new BadRequestException(
        "还款产生的费用账单不能单独删除，请撤销还款",
      )
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
      else if (proposal?.type === "liability-create")
        results.push({
          type: "liability-create",
          liability: await this.createLiabilityWithDatabase(
            database,
            ledgerId,
            proposal.liability || {},
          ),
        })
      else if (proposal?.type === "liability-payment")
        results.push({
          type: "liability-payment",
          payment: await this.recordLiabilityPaymentWithDatabase(
            database,
            ledgerId,
            proposal.liabilityId,
            proposal.payment || {},
            "scheduled",
          ),
        })
      else if (proposal?.type === "liability-settlement")
        results.push({
          type: "liability-settlement",
          payment: await this.recordLiabilityPaymentWithDatabase(
            database,
            ledgerId,
            proposal.liabilityId,
            proposal.settlement || {},
            "early_settlement",
          ),
        })
      else if (proposal?.type === "liability-payment-reverse")
        results.push({
          type: "liability-payment-reverse",
          result: await this.deleteLiabilityPaymentWithDatabase(
            database,
            ledgerId,
            proposal.liabilityId,
            proposal.paymentId,
          ),
        })
      else throw new Error("包含未知操作")
    }
    return results
  }
}
