import { Injectable } from "@nestjs/common"
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js"
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js"

const utcDate = (value: string) => new Date(`${value}T00:00:00Z`)
const dateString = (value: Date) => value.toISOString().slice(0, 10)
const addDays = (value: string, days: number) => {
  const date = utcDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return dateString(date)
}
const startOfWeek = (value: string) => {
  const date = utcDate(value)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - day + 1)
  return dateString(date)
}
const startOfMonth = (value: string) => `${value.slice(0, 7)}-01`
const endOfMonth = (value: string) => {
  const date = utcDate(startOfMonth(value))
  date.setUTCMonth(date.getUTCMonth() + 1)
  date.setUTCDate(0)
  return dateString(date)
}

export function currentDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

const expense = (record: { amount: number }) =>
  record.amount < 0 ? -Number(record.amount) : 0

type DailyAmount = { date: string; amount: number }
type CategoryExpense = DailyAmount & {
  category1: string
  category2: string
}
type CategoryIcons = {
  primary: Map<string, string>
  secondary: Map<string, string>
}

export const parseCategoryPaths = (raw?: string | null) => {
  if (!raw) return null
  const paths = String(raw)
    .split(";")
    .map((path) =>
      path
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .filter((path) => path.length > 0 && path.length <= 2)
  return paths.length ? paths : null
}
const sumRange = (records: DailyAmount[], start: string, end: string) =>
  Number(
    records
      .filter((row) => row.date >= start && row.date <= end)
      .reduce((sum, row) => sum + expense(row), 0)
      .toFixed(2),
  )
const cashflowRange = (
  expenses: DailyAmount[],
  incomes: DailyAmount[],
  start: string,
  end: string,
) => {
  const expenseAmount = sumRange(expenses, start, end)
  const income = Number(
    incomes
      .filter((row) => row.date >= start && row.date <= end)
      .reduce((sum, row) => sum + Number(row.amount), 0)
      .toFixed(2),
  )
  return {
    expense: Number(expenseAmount.toFixed(2)),
    income: Number(income.toFixed(2)),
    balance: Number((income - expenseAmount).toFixed(2)),
  }
}

function breakdown(
  records: CategoryExpense[],
  start: string,
  end: string,
  icons: CategoryIcons,
  level = "primary",
) {
  const grouped = new Map<string, number>()
  for (const row of records) {
    if (row.date < start || row.date > end || row.amount >= 0) continue
    const key =
      level === "secondary"
        ? `${row.category1}\u0000${row.category2}`
        : row.category1
    grouped.set(key, (grouped.get(key) || 0) + expense(row))
  }
  const total = [...grouped.values()].reduce((sum, value) => sum + value, 0)
  return [...grouped.entries()]
    .map(([key, amount]) => {
      const [parent, child] =
        level === "secondary" ? key.split("\u0000") : ["", key]
      return {
        category: child,
        ...(parent ? { parent } : {}),
        icon:
          level === "secondary"
            ? icons.secondary.get(`${parent}\u0000${child}`) || "tag"
            : icons.primary.get(child) || "folder",
        amount: Number(amount.toFixed(2)),
        share: total ? amount / total : 0,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

function dailySeries(records: DailyAmount[], anchor: string) {
  return Array.from({ length: 14 }, (_, index) => {
    const date = addDays(anchor, index - 13)
    return {
      key: date,
      label: date.slice(5).replace("-", "/"),
      amount: sumRange(records, date, date),
    }
  })
}

function weeklySeries(records: DailyAmount[], anchor: string) {
  const current = startOfWeek(anchor)
  return Array.from({ length: 8 }, (_, index) => {
    const start = addDays(current, (index - 7) * 7)
    return {
      key: start,
      label: `${Number(start.slice(5, 7))}/${Number(start.slice(8))}`,
      amount: sumRange(records, start, addDays(start, 6)),
    }
  })
}

function monthlySeries(records: DailyAmount[], anchor: string) {
  const base = utcDate(startOfMonth(anchor))
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(base)
    date.setUTCMonth(date.getUTCMonth() + index - 11)
    const start = dateString(date)
    return {
      key: start.slice(0, 7),
      label: `${date.getUTCMonth() + 1}月`,
      amount: sumRange(records, start, endOfMonth(start)),
    }
  })
}

function periodSeries(
  records: DailyAmount[],
  start: string,
  end: string,
  scope: string,
) {
  if (scope === "year") {
    const series: { key: string; label: string; amount: number }[] = []
    let cursor = startOfMonth(start)
    while (cursor <= end) {
      series.push({
        key: cursor.slice(0, 7),
        label: `${Number(cursor.slice(5, 7))}月`,
        amount: sumRange(
          records,
          cursor,
          endOfMonth(cursor) > end ? end : endOfMonth(cursor),
        ),
      })
      const date = utcDate(cursor)
      date.setUTCMonth(date.getUTCMonth() + 1)
      cursor = dateString(date)
    }
    return series
  }
  const days =
    Math.round(
      (utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000,
    ) + 1
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(start, index)
    return {
      key: date,
      label: date.slice(5).replace("-", "/"),
      amount: sumRange(records, date, date),
    }
  })
}

function comparisonBreakdown(
  records: CategoryExpense[],
  start: string,
  end: string,
  icons: CategoryIcons,
) {
  const days =
    Math.round(
      (utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000,
    ) + 1
  const previousEnd = addDays(start, -1)
  const previousStart = addDays(previousEnd, -days + 1)
  const current = breakdown(records, start, end, icons)
  const previous = breakdown(records, previousStart, previousEnd, icons)
  const currentMap = new Map(current.map((row) => [row.category, row.amount]))
  const previousMap = new Map(previous.map((row) => [row.category, row.amount]))
  return [...new Set([...currentMap.keys(), ...previousMap.keys()])]
    .map((category) => {
      const currentAmount = currentMap.get(category) || 0
      const previousAmount = previousMap.get(category) || 0
      return {
        category,
        current: currentAmount,
        previous: previousAmount,
        difference: Number((currentAmount - previousAmount).toFixed(2)),
      }
    })
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly prisma: PrismaService,
  ) {}

  private async queryAnalyticsData(
    start: string,
    end: string,
    categories?: string[][] | null,
  ) {
    const { ledgerId } = await this.ledger.context()
    const categoryPaths = categories?.length
      ? {
          OR: categories.map(([category1, category2]) =>
            category2 ? { category1, category2 } : { category1 },
          ),
        }
      : {}
    const where = { ledgerId, deletedAt: null, ...categoryPaths }
    const rangeWhere = {
      ...where,
      date: { gte: utcDate(start), lte: utcDate(end) },
    }
    const [expenseRows, incomeRows, categoryRows, summary, categoriesRows] =
      await Promise.all([
        this.prisma.transaction.groupBy({
          by: ["date"],
          where: { ...rangeWhere, amount: { lt: 0 } },
          _sum: { amount: true },
        }),
        this.prisma.transaction.groupBy({
          by: ["date"],
          where: { ...rangeWhere, amount: { gt: 0 } },
          _sum: { amount: true },
        }),
        this.prisma.transaction.groupBy({
          by: ["date", "category1", "category2"],
          where: { ...rangeWhere, amount: { lt: 0 } },
          _sum: { amount: true },
        }),
        this.prisma.transaction.aggregate({
          where,
          _count: { _all: true },
          _max: { date: true },
        }),
        this.prisma.category.findMany({
          where: { ledgerId },
          select: {
            category1: true,
            category2: true,
            primaryIcon: true,
            secondaryIcon: true,
          },
        }),
      ])
    const icons: CategoryIcons = {
      primary: new Map(),
      secondary: new Map(),
    }
    for (const category of categoriesRows) {
      icons.primary.set(category.category1, category.primaryIcon)
      icons.secondary.set(
        `${category.category1}\u0000${category.category2}`,
        category.secondaryIcon,
      )
    }
    return {
      expenses: expenseRows.map((row) => ({
        date: dateString(row.date),
        amount: Number(row._sum.amount || 0),
      })),
      incomes: incomeRows.map((row) => ({
        date: dateString(row.date),
        amount: Number(row._sum.amount || 0),
      })),
      categoryExpenses: categoryRows.map((row) => ({
        date: dateString(row.date),
        category1: row.category1,
        category2: row.category2,
        amount: Number(row._sum.amount || 0),
      })),
      icons,
      transactionCount: summary._count._all,
      latestDate: summary._max.date ? dateString(summary._max.date) : null,
    }
  }

  async build(requestedAnchor?: string | null, categories?: string[][] | null) {
    const anchor = /^\d{4}-\d{2}-\d{2}$/.test(requestedAnchor || "")
      ? requestedAnchor!
      : currentDate()
    const anchorYear = Number(anchor.slice(0, 4))
    const previousYear = String(anchorYear - 1).padStart(4, "0")
    const {
      expenses,
      incomes,
      categoryExpenses,
      icons,
      transactionCount,
      latestDate: latest,
    } = await this.queryAnalyticsData(
      `${previousYear}-01-01`,
      `${anchor.slice(0, 4)}-12-31`,
      categories,
    )
    const latestDate = latest || currentDate()
    const weekStart = startOfWeek(anchor)
    const ranges = {
      day: [anchor, anchor],
      week: [weekStart, addDays(weekStart, 6)],
      month: [startOfMonth(anchor), endOfMonth(anchor)],
      year: [`${anchor.slice(0, 4)}-01-01`, `${anchor.slice(0, 4)}-12-31`],
    } as const
    const comparison = Object.fromEntries(
      Object.entries(ranges).map(([key, [start, end]]) => {
        const days =
          Math.round(
            (utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000,
          ) + 1
        const previousEnd = addDays(start, -1)
        const previousStart = addDays(previousEnd, -days + 1)
        const current = sumRange(expenses, start, end)
        const previous = sumRange(expenses, previousStart, previousEnd)
        return [
          key,
          {
            current,
            previous,
            change: previous ? (current - previous) / previous : null,
            previousRange: [previousStart, previousEnd],
          },
        ]
      }),
    )
    const cashflow = Object.fromEntries(
      Object.entries(ranges).map(([key, [start, end]]) => [
        key,
        cashflowRange(expenses, incomes, start, end),
      ]),
    ) as Record<string, { expense: number; income: number; balance: number }>
    const { ledgerId } = await this.ledger.context()
    const filterActive = Boolean(categories?.length)
    const selectedPrimaries = new Set(
      (categories || [])
        .filter((path) => path.length === 1)
        .map((path) => path[0]),
    )
    const budgetRows = await this.prisma.budget.findMany({
      where: { ledgerId, month: utcDate(startOfMonth(anchor)) },
      orderBy: { category1: "asc" },
    })
    const budgetRow = filterActive
      ? null
      : budgetRows.find((row) => row.category1 === null) || null
    const budgetAmount = Number(budgetRow?.amount || 0)
    const budgetUsed = cashflow.month.expense
    const budgetRate = budgetAmount > 0 ? budgetUsed / budgetAmount : 0
    const monthBreakdown = breakdown(
      categoryExpenses,
      ranges.month[0],
      ranges.month[1],
      icons,
    )
    const categorySpending = new Map(
      monthBreakdown.map((row) => [row.category, row.amount]),
    )
    const riskRank: Record<string, number> = { over: 2, warning: 1, normal: 0 }
    const categoryBudgets = budgetRows
      .filter(
        (row) =>
          row.category1 !== null &&
          (!filterActive || selectedPrimaries.has(row.category1)),
      )
      .map((row) => {
        const amount = Number(row.amount)
        const used = categorySpending.get(row.category1!) || 0
        const usageRate = amount > 0 ? used / amount : 0
        return {
          id: row.id,
          month: anchor.slice(0, 7),
          category1: row.category1!,
          primaryIcon: icons.primary.get(row.category1!) || "folder",
          amount,
          used,
          remaining: Number((amount - used).toFixed(2)),
          usageRate,
          status:
            usageRate > 1 ? "over" : usageRate >= 0.8 ? "warning" : "normal",
        }
      })
      .sort(
        (a, b) =>
          riskRank[b.status] - riskRank[a.status] || b.usageRate - a.usageRate,
      )
    const yearExpenses = new Map<string, number>()
    for (const row of expenses)
      if (row.date.startsWith(anchor.slice(0, 4)))
        yearExpenses.set(
          row.date,
          (yearExpenses.get(row.date) || 0) - Number(row.amount),
        )
    return {
      latestDate,
      anchor,
      ranges,
      totals: Object.fromEntries(
        Object.entries(ranges).map(([key, [start, end]]) => [
          key,
          sumRange(expenses, start, end),
        ]),
      ),
      cashflow,
      breakdowns: Object.fromEntries(
        Object.entries(ranges).map(([key, [start, end]]) => [
          key,
          breakdown(categoryExpenses, start, end, icons),
        ]),
      ),
      secondaryBreakdowns: Object.fromEntries(
        Object.entries(ranges).map(([key, [start, end]]) => [
          key,
          breakdown(categoryExpenses, start, end, icons, "secondary"),
        ]),
      ),
      series: {
        day: dailySeries(expenses, anchor),
        week: weeklySeries(expenses, anchor),
        month: monthlySeries(expenses, anchor),
      },
      rangeSeries: Object.fromEntries(
        Object.entries(ranges).map(([key, [start, end]]) => [
          key,
          periodSeries(expenses, start, end, key),
        ]),
      ),
      comparison,
      comparisonBreakdowns: Object.fromEntries(
        Object.entries(ranges).map(([key, [start, end]]) => [
          key,
          comparisonBreakdown(categoryExpenses, start, end, icons),
        ]),
      ),
      yearHeatmap: [...yearExpenses.entries()].map(([date, amount]) => [
        date,
        Number(amount.toFixed(2)),
      ]),
      transactionCount,
      budget: budgetRow
        ? {
            id: budgetRow.id,
            month: anchor.slice(0, 7),
            amount: budgetAmount,
            used: budgetUsed,
            remaining: Number((budgetAmount - budgetUsed).toFixed(2)),
            usageRate: budgetRate,
            status:
              budgetRate > 1
                ? "over"
                : budgetRate >= 0.8
                  ? "warning"
                  : "normal",
          }
        : null,
      categoryBudgets,
    }
  }

  async buildRange(start: string, end: string, categories?: string[][] | null) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      start > end
    )
      throw new Error("自定义日期范围无效")
    const days =
      Math.round(
        (utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000,
      ) + 1
    if (days > 3660) throw new Error("单次自定义统计范围不能超过 10 年")
    const previousEnd = addDays(start, -1)
    const previousStart = addDays(previousEnd, -days + 1)
    const { expenses, incomes, categoryExpenses, icons } =
      await this.queryAnalyticsData(previousStart, end, categories)
    const series: { key: string; label: string; amount: number }[] = []
    if (days <= 120) {
      for (let index = 0; index < days; index += 1) {
        const date = addDays(start, index)
        series.push({
          key: date,
          label: date.slice(5).replace("-", "/"),
          amount: sumRange(expenses, date, date),
        })
      }
    } else {
      let cursor = startOfMonth(start)
      while (cursor <= end) {
        series.push({
          key: cursor.slice(0, 7),
          label: cursor.slice(0, 7),
          amount: sumRange(
            expenses,
            cursor < start ? start : cursor,
            endOfMonth(cursor) > end ? end : endOfMonth(cursor),
          ),
        })
        const date = utcDate(cursor)
        date.setUTCMonth(date.getUTCMonth() + 1)
        cursor = dateString(date)
      }
    }
    const currentExpense = sumRange(expenses, start, end)
    const previousExpense = sumRange(expenses, previousStart, previousEnd)
    return {
      start,
      end,
      days,
      cashflow: cashflowRange(expenses, incomes, start, end),
      breakdown: breakdown(categoryExpenses, start, end, icons),
      secondaryBreakdown: breakdown(
        categoryExpenses,
        start,
        end,
        icons,
        "secondary",
      ),
      comparisonBreakdown: comparisonBreakdown(
        categoryExpenses,
        start,
        end,
        icons,
      ),
      comparison: {
        current: currentExpense,
        previous: previousExpense,
        change: previousExpense
          ? (currentExpense - previousExpense) / previousExpense
          : null,
        previousRange: [previousStart, previousEnd],
      },
      series,
    }
  }
}
