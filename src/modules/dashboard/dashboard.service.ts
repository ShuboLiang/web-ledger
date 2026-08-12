import { Injectable } from "@nestjs/common";
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";

const utcDate = (value: string) => new Date(`${value}T00:00:00Z`);
const dateString = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateString(date);
};
const startOfWeek = (value: string) => {
  const date = utcDate(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return dateString(date);
};
const startOfMonth = (value: string) => `${value.slice(0, 7)}-01`;
const endOfMonth = (value: string) => {
  const date = utcDate(startOfMonth(value));
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return dateString(date);
};

export function currentDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

const expense = (record: { amount: number }) => record.amount < 0 ? -Number(record.amount) : 0;
const sumRange = (records: any[], start: string, end: string) => Number(records
  .filter((row) => row.date >= start && row.date <= end)
  .reduce((sum, row) => sum + expense(row), 0).toFixed(2));
const cashflowRange = (records: any[], start: string, end: string) => {
  const selected = records.filter((row) => row.date >= start && row.date <= end);
  const expenseAmount = selected.filter((row) => row.amount < 0).reduce((sum, row) => sum - Number(row.amount), 0);
  const income = selected.filter((row) => row.amount > 0).reduce((sum, row) => sum + Number(row.amount), 0);
  return { expense: Number(expenseAmount.toFixed(2)), income: Number(income.toFixed(2)), balance: Number((income - expenseAmount).toFixed(2)) };
};

function breakdown(records: any[], start: string, end: string, level = "primary") {
  const grouped = new Map<string, number>();
  for (const row of records) {
    if (row.date < start || row.date > end || row.amount >= 0) continue;
    const key = level === "secondary" ? `${row.category1}\u0000${row.category2}` : row.category1;
    grouped.set(key, (grouped.get(key) || 0) + expense(row));
  }
  const total = [...grouped.values()].reduce((sum, value) => sum + value, 0);
  return [...grouped.entries()].map(([key, amount]) => {
    const [parent, child] = level === "secondary" ? key.split("\u0000") : ["", key];
    return { category: child, ...(parent ? { parent } : {}), amount: Number(amount.toFixed(2)), share: total ? amount / total : 0 };
  }).sort((a, b) => b.amount - a.amount);
}

function dailySeries(records: any[], anchor: string) {
  return Array.from({ length: 14 }, (_, index) => {
    const date = addDays(anchor, index - 13);
    return { key: date, label: date.slice(5).replace("-", "/"), amount: sumRange(records, date, date) };
  });
}

function weeklySeries(records: any[], anchor: string) {
  const current = startOfWeek(anchor);
  return Array.from({ length: 8 }, (_, index) => {
    const start = addDays(current, (index - 7) * 7);
    return { key: start, label: `${Number(start.slice(5, 7))}/${Number(start.slice(8))}`, amount: sumRange(records, start, addDays(start, 6)) };
  });
}

function monthlySeries(records: any[], anchor: string) {
  const base = utcDate(startOfMonth(anchor));
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(base);
    date.setUTCMonth(date.getUTCMonth() + index - 11);
    const start = dateString(date);
    return { key: start.slice(0, 7), label: `${date.getUTCMonth() + 1}月`, amount: sumRange(records, start, endOfMonth(start)) };
  });
}

function periodSeries(records: any[], start: string, end: string, scope: string) {
  if (scope === "year") {
    const series: { key: string; label: string; amount: number }[] = [];
    let cursor = startOfMonth(start);
    while (cursor <= end) {
      series.push({ key: cursor.slice(0, 7), label: `${Number(cursor.slice(5, 7))}月`, amount: sumRange(records, cursor, endOfMonth(cursor) > end ? end : endOfMonth(cursor)) });
      const date = utcDate(cursor);
      date.setUTCMonth(date.getUTCMonth() + 1);
      cursor = dateString(date);
    }
    return series;
  }
  const days = Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000) + 1;
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(start, index);
    return { key: date, label: date.slice(5).replace("-", "/"), amount: sumRange(records, date, date) };
  });
}

function comparisonBreakdown(records: any[], start: string, end: string) {
  const days = Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000) + 1;
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -days + 1);
  const current = breakdown(records, start, end);
  const previous = breakdown(records, previousStart, previousEnd);
  const currentMap = new Map(current.map((row) => [row.category, row.amount]));
  const previousMap = new Map(previous.map((row) => [row.category, row.amount]));
  return [...new Set([...currentMap.keys(), ...previousMap.keys()])].map((category) => {
    const currentAmount = currentMap.get(category) || 0;
    const previousAmount = previousMap.get(category) || 0;
    return { category, current: currentAmount, previous: previousAmount, difference: Number((currentAmount - previousAmount).toFixed(2)) };
  }).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
}

@Injectable()
export class DashboardService {
  constructor(private readonly ledger: LedgerService, private readonly prisma: PrismaService) {}

  async build(requestedAnchor?: string | null) {
    const records = await this.ledger.allTransactions() as any[];
    const latestDate = String(records[0]?.date || currentDate());
    const anchor = /^\d{4}-\d{2}-\d{2}$/.test(requestedAnchor || "") ? requestedAnchor! : latestDate;
    const weekStart = startOfWeek(anchor);
    const ranges = {
      day: [anchor, anchor],
      week: [weekStart, addDays(weekStart, 6)],
      month: [startOfMonth(anchor), endOfMonth(anchor)],
      year: [`${anchor.slice(0, 4)}-01-01`, `${anchor.slice(0, 4)}-12-31`],
    } as const;
    const comparison = Object.fromEntries(Object.entries(ranges).map(([key, [start, end]]) => {
      const days = Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000) + 1;
      const previousEnd = addDays(start, -1);
      const previousStart = addDays(previousEnd, -days + 1);
      const current = sumRange(records, start, end);
      const previous = sumRange(records, previousStart, previousEnd);
      return [key, { current, previous, change: previous ? (current - previous) / previous : null, previousRange: [previousStart, previousEnd] }];
    }));
    const cashflow = Object.fromEntries(Object.entries(ranges).map(([key, [start, end]]) => [key, cashflowRange(records, start, end)])) as Record<string, { expense: number; income: number; balance: number }>;
    const { ledgerId } = await this.ledger.context();
    const budgetRows = await this.prisma.budget.findMany({ where: { ledgerId, month: utcDate(startOfMonth(anchor)) }, orderBy: { category1: "asc" } });
    const budgetRow = budgetRows.find((row) => row.category1 === null) || null;
    const budgetAmount = Number(budgetRow?.amount || 0);
    const budgetUsed = cashflow.month.expense;
    const budgetRate = budgetAmount > 0 ? budgetUsed / budgetAmount : 0;
    const monthBreakdown = breakdown(records, ranges.month[0], ranges.month[1]);
    const categorySpending = new Map(monthBreakdown.map((row) => [row.category, row.amount]));
    const riskRank: Record<string, number> = { over: 2, warning: 1, normal: 0 };
    const categoryBudgets = budgetRows.filter((row) => row.category1 !== null).map((row) => {
      const amount = Number(row.amount);
      const used = categorySpending.get(row.category1!) || 0;
      const usageRate = amount > 0 ? used / amount : 0;
      return { id: row.id, month: anchor.slice(0, 7), category1: row.category1!, amount, used, remaining: Number((amount - used).toFixed(2)), usageRate, status: usageRate > 1 ? "over" : usageRate >= 0.8 ? "warning" : "normal" };
    }).sort((a, b) => riskRank[b.status] - riskRank[a.status] || b.usageRate - a.usageRate);
    const yearExpenses = new Map<string, number>();
    for (const row of records) if (row.date.startsWith(anchor.slice(0, 4)) && row.amount < 0) yearExpenses.set(row.date, (yearExpenses.get(row.date) || 0) - Number(row.amount));
    return {
      latestDate,
      anchor,
      ranges,
      totals: Object.fromEntries(Object.entries(ranges).map(([key, [start, end]]) => [key, sumRange(records, start, end)])),
      cashflow,
      breakdowns: Object.fromEntries(Object.entries(ranges).map(([key, [start, end]]) => [key, breakdown(records, start, end)])),
      secondaryBreakdowns: Object.fromEntries(Object.entries(ranges).map(([key, [start, end]]) => [key, breakdown(records, start, end, "secondary")])),
      series: { day: dailySeries(records, anchor), week: weeklySeries(records, anchor), month: monthlySeries(records, anchor) },
      rangeSeries: Object.fromEntries(Object.entries(ranges).map(([key, [start, end]]) => [key, periodSeries(records, start, end, key)])),
      comparison,
      comparisonBreakdowns: Object.fromEntries(Object.entries(ranges).map(([key, [start, end]]) => [key, comparisonBreakdown(records, start, end)])),
      yearHeatmap: [...yearExpenses.entries()].map(([date, amount]) => [date, Number(amount.toFixed(2))]),
      transactionCount: records.length,
      budget: budgetRow ? { id: budgetRow.id, month: anchor.slice(0, 7), amount: budgetAmount, used: budgetUsed, remaining: Number((budgetAmount - budgetUsed).toFixed(2)), usageRate: budgetRate, status: budgetRate > 1 ? "over" : budgetRate >= 0.8 ? "warning" : "normal" } : null,
      categoryBudgets,
    };
  }

  async buildRange(start: string, end: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) throw new Error("自定义日期范围无效");
    const records = await this.ledger.allTransactions() as any[];
    const days = Math.round((utcDate(end).getTime() - utcDate(start).getTime()) / 86_400_000) + 1;
    if (days > 3660) throw new Error("单次自定义统计范围不能超过 10 年");
    const series: { key: string; label: string; amount: number }[] = [];
    if (days <= 120) {
      for (let index = 0; index < days; index += 1) { const date = addDays(start, index); series.push({ key: date, label: date.slice(5).replace("-", "/"), amount: sumRange(records, date, date) }); }
    } else {
      let cursor = startOfMonth(start);
      while (cursor <= end) { series.push({ key: cursor.slice(0, 7), label: cursor.slice(0, 7), amount: sumRange(records, cursor < start ? start : cursor, endOfMonth(cursor) > end ? end : endOfMonth(cursor)) }); const date = utcDate(cursor); date.setUTCMonth(date.getUTCMonth() + 1); cursor = dateString(date); }
    }
    const previousEnd = addDays(start, -1);
    const previousStart = addDays(previousEnd, -days + 1);
    const currentExpense = sumRange(records, start, end);
    const previousExpense = sumRange(records, previousStart, previousEnd);
    return {
      start, end, days,
      cashflow: cashflowRange(records, start, end),
      breakdown: breakdown(records, start, end),
      secondaryBreakdown: breakdown(records, start, end, "secondary"),
      comparisonBreakdown: comparisonBreakdown(records, start, end),
      comparison: { current: currentExpense, previous: previousExpense, change: previousExpense ? (currentExpense - previousExpense) / previousExpense : null, previousRange: [previousStart, previousEnd] },
      series,
    };
  }
}
