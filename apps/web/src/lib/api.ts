export type Transaction = { id: number; date: string; amount: number; item: string; category1: string; category2: string; accountId?: string; accountName?: string; note: string };
export type Breakdown = { category: string; parent?: string; amount: number; share: number };
export type Dashboard = {
  latestDate: string; anchor: string; transactionCount: number;
  totals: Record<"day" | "week" | "month" | "year", number>;
  cashflow: Record<"day" | "week" | "month" | "year", { expense: number; income: number; balance: number }>;
  ranges: Record<string, [string, string]>;
  breakdowns: Record<string, Breakdown[]>;
  secondaryBreakdowns: Record<string, Breakdown[]>;
  series: Record<string, { key: string; label: string; amount: number }[]>;
  comparison: Record<string, { current: number; previous: number; change: number | null; previousRange: [string, string] }>;
  yearHeatmap: [string, number][];
};
export type Dictionaries = { projects: string[]; categories: { category1: string; category2: string }[]; accounts?: { id: string; name: string; type: string }[] };

export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}
