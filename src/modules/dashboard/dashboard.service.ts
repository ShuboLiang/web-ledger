import { Injectable } from "@nestjs/common";
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js";

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

@Injectable()
export class DashboardService {
  constructor(private readonly ledger: LedgerService) {}

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
    const yearExpenses = new Map<string, number>();
    for (const row of records) if (row.date.startsWith(anchor.slice(0, 4)) && row.amount < 0) yearExpenses.set(row.date, (yearExpenses.get(row.date) || 0) - Number(row.amount));
    return {
      latestDate,
      anchor,
      ranges,
      totals: Object.fromEntries(Object.entries(ranges).map(([key, [start, end]]) => [key, sumRange(records, start, end)])),
      cashflow: Object.fromEntries(Object.entries(ranges).map(([key, [start, end]]) => [key, cashflowRange(records, start, end)])),
      breakdowns: Object.fromEntries(Object.entries(ranges).map(([key, [start, end]]) => [key, breakdown(records, start, end)])),
      secondaryBreakdowns: Object.fromEntries(Object.entries(ranges).map(([key, [start, end]]) => [key, breakdown(records, start, end, "secondary")])),
      series: { day: dailySeries(records, anchor), week: weeklySeries(records, anchor), month: monthlySeries(records, anchor) },
      comparison,
      yearHeatmap: [...yearExpenses.entries()].map(([date, amount]) => [date, Number(amount.toFixed(2))]),
      transactionCount: records.length,
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
    return { start, end, days, cashflow: cashflowRange(records, start, end), breakdown: breakdown(records, start, end), secondaryBreakdown: breakdown(records, start, end, "secondary"), series };
  }
}
