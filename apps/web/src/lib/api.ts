export type Transaction = {
  id: number
  date: string
  amount: number
  item: string
  category1: string
  category2: string
  primaryIcon?: string
  secondaryIcon?: string
  accountId?: string | null
  accountName?: string
  tagIds?: string[]
  tags?: { id: string; name: string; color: string }[]
  note: string
}
export type Breakdown = {
  category: string
  parent?: string
  icon?: string
  amount: number
  share: number
}
export type BreakdownChange = {
  category: string
  current: number
  previous: number
  difference: number
}
export type DashboardBudget = {
  id: string
  month: string
  category1?: string
  primaryIcon?: string
  amount: number
  used: number
  remaining: number
  usageRate: number
  status: "normal" | "warning" | "over"
}
export type Dashboard = {
  latestDate: string
  anchor: string
  transactionCount: number
  totals: Record<"day" | "week" | "month" | "year", number>
  cashflow: Record<
    "day" | "week" | "month" | "year",
    { expense: number; income: number; balance: number }
  >
  ranges: Record<string, [string, string]>
  breakdowns: Record<string, Breakdown[]>
  secondaryBreakdowns: Record<string, Breakdown[]>
  series: Record<string, { key: string; label: string; amount: number }[]>
  rangeSeries: Record<string, { key: string; label: string; amount: number }[]>
  comparison: Record<
    string,
    {
      current: number
      previous: number
      change: number | null
      previousRange: [string, string]
    }
  >
  comparisonBreakdowns: Record<string, BreakdownChange[]>
  yearHeatmap: [string, number][]
  budget: DashboardBudget | null
  categoryBudgets: DashboardBudget[]
}
export type Dictionaries = {
  projects: string[]
  categories: {
    category1: string
    category2: string
    primaryIcon: string
    secondaryIcon: string
  }[]
  accounts?: {
    id: string
    name: string
    type: string
    typeText?: string
    isDefault?: boolean
    isContact?: boolean
    availableQuota?: number
  }[]
  tags?: { id: string; name: string; color: string }[]
}
export type LedgerTag = {
  id: string
  name: string
  color: string
  enabled: boolean
  usageCount: number
  periodCount: number
  expense: number
  income: number
}
export type TagPeriod = {
  scope: "month" | "year"
  period: string
  month?: string
  year?: string
}
export type TagOverview = TagPeriod & { tags: LedgerTag[] }
export type TagAnalytics = {
  scope: "month" | "year"
  period: string
  month?: string
  year?: string
  tag: { id: string; name: string; color: string; enabled: boolean }
  summary: {
    expense: number
    income: number
    count: number
    expenseCount: number
    averageExpense: number
  }
  series: { date: string; amount: number }[]
  categories: { name: string; amount: number }[]
  records: Transaction[]
}
export type FinanceAccount = {
  id: string
  name: string
  type: string
  typeText: string
  openingBalance: number
  balanceDate?: string | null
  balance: number
  availableQuota: number
  outstanding: number
  isLiability: boolean
  isContact: boolean
  isDefault: boolean
  enabled: boolean
}
export type FinanceOverview = {
  summary: {
    assets: number
    liabilities: number
    receivable: number
    payable: number
    netWorth: number
    unaccountedCount?: number
    unaccountedMonth?: string
  }
  accounts: FinanceAccount[]
  recentTransfers: {
    id: string
    date: string
    amount: number
    kind:
      | "transfer"
      | "debt_drawdown"
      | "debt_payment"
      | "adjustment"
      | "lending_in"
      | "lending_out"
    note: string
    fromAccountId: string
    toAccountId: string
    fromAccountName: string
    toAccountName: string
    reversible: boolean
  }[]
}
export type LendingDirection = "receivable" | "payable"
export type LendingEntry = {
  id: string
  contactId: string
  contactName: string
  direction: LendingDirection
  date: string
  amount: number
  settledAmount: number
  outstanding: number
  item: string
  note: string
  dueDate: string | null
  status: "open" | "settled"
  settledAt: string | null
  overdue: boolean
  transferId: string | null
  transactionId: number | null
  settlements: { id: string; date: string; amount: number; note: string }[]
}
export type LendingContact = {
  id: string
  name: string
  enabled: boolean
  balance: number
  receivable: number
  payable: number
  openCount: number
  openReceivable: number
  openPayable: number
  overdueCount: number
  dueSoonCount: number
  nextDueDate: string | null
  untracked: number
  lastDate?: string | null
  totalCount?: number
}
export type LendingOverview = {
  today: string
  summary: {
    receivable: number
    payable: number
    net: number
    openReceivable: number
    openPayable: number
    untracked: number
    contactCount: number
    overdueCount: number
  }
  contacts: LendingContact[]
  entries: LendingEntry[]
}
export type LendingContactDetail = {
  today: string
  contact: LendingContact
  entries: LendingEntry[]
  movements: {
    id: string
    kind: "transfer" | "transaction"
    date: string
    amount: number
    item: string
  }[]
}
export type LendingReminders = {
  overdue: LendingEntry[]
  dueSoon: LendingEntry[]
}
export type AuthUser = { id: string; username: string; displayName: string }

export const UNACCOUNTED_ACCOUNT_ID = "none"
export const UNACCOUNTED_ACCOUNT_LABEL = "不记账户"

export function isUnaccountedAccountId(value?: string | null) {
  return !value || value === UNACCOUNTED_ACCOUNT_ID
}

export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || "请求失败")
  return payload
}
