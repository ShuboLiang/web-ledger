import { lazy, Suspense } from "react"
import { Flex, Spin, Typography } from "antd"
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import {
  AnalyticsWorkspace,
  FinanceWorkspace,
  SettingsWorkspace,
  TransactionsWorkspace,
} from "@/components/workspace-tabs"
import { useQuery } from "@tanstack/react-query"
import { api, type AuthUser } from "@/lib/api"
import { AuthPage } from "@/pages/auth"
const DashboardPage = lazy(() =>
  import("@/pages/dashboard").then((module) => ({
    default: module.DashboardPage,
  })),
)
const RecurringPage = lazy(() =>
  import("@/pages/recurring").then((module) => ({
    default: module.RecurringPage,
  })),
)
const TrashPage = lazy(() =>
  import("@/pages/trash").then((module) => ({
    default: module.TrashPage,
  })),
)
const TransactionsPage = lazy(() =>
  import("@/pages/transactions").then((module) => ({
    default: module.TransactionsPage,
  })),
)
const HeatmapPage = lazy(() =>
  import("@/pages/heatmap").then((module) => ({ default: module.HeatmapPage })),
)
const AnalyticsPage = lazy(() =>
  import("@/pages/analytics").then((module) => ({
    default: module.AnalyticsPage,
  })),
)
const BudgetsPage = lazy(() =>
  import("@/pages/budgets").then((module) => ({ default: module.BudgetsPage })),
)
const FinancePage = lazy(() =>
  import("@/pages/finance").then((module) => ({ default: module.FinancePage })),
)
const LendingPage = lazy(() =>
  import("@/pages/lending").then((module) => ({ default: module.LendingPage })),
)
const TagsPage = lazy(() =>
  import("@/pages/tags").then((module) => ({ default: module.TagsPage })),
)
const AiPage = lazy(() =>
  import("@/pages/ai").then((module) => ({ default: module.AiPage })),
)
const ManagementPage = lazy(() =>
  import("@/pages/management").then((module) => ({
    default: module.ManagementPage,
  })),
)
const SettingsPage = lazy(() =>
  import("@/pages/settings").then((module) => ({
    default: module.SettingsPage,
  })),
)
const MorePage = lazy(() =>
  import("@/pages/more").then((module) => ({ default: module.MorePage })),
)

function RedirectKeepQuery({ to }: { to: string }) {
  const [params] = useSearchParams()
  const query = params.toString()
  return <Navigate to={query ? `${to}?${query}` : to} replace />
}

function LegacyManagementRedirect() {
  const [params] = useSearchParams()
  if (params.get("tab") === "budgets") {
    const month = params.get("month")
    return (
      <Navigate
        to={month ? `/analytics/budgets?month=${month}` : "/analytics/budgets"}
        replace
      />
    )
  }
  return <Navigate to="/settings/categories" replace />
}

export function App() {
  const auth = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => api<{ user: AuthUser }>("/api/auth/me"),
    retry: false,
    staleTime: Infinity,
  })
  const loading = (
    <Flex
      vertical
      align="center"
      justify="center"
      style={{ minHeight: "100vh" }}
      gap={12}
    >
      <Spin size="large" />
      <Typography.Text type="secondary">正在打开账本…</Typography.Text>
    </Flex>
  )
  if (auth.isLoading) return loading
  if (!auth.data?.user) return <AuthPage />
  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="transactions" element={<TransactionsWorkspace />}>
            <Route index element={<TransactionsPage />} />
            <Route path="recurring" element={<RecurringPage />} />
            <Route path="trash" element={<TrashPage />} />
          </Route>
          <Route path="analytics" element={<AnalyticsWorkspace />}>
            <Route index element={<AnalyticsPage />} />
            <Route path="heatmap" element={<HeatmapPage />} />
            <Route path="budgets" element={<BudgetsPage />} />
            <Route path="tags" element={<TagsPage />} />
          </Route>
          <Route path="finance" element={<FinanceWorkspace />}>
            <Route index element={<FinancePage />} />
            <Route path="lending" element={<LendingPage />} />
          </Route>
          <Route path="ai" element={<AiPage />} />
          <Route path="settings" element={<SettingsWorkspace />}>
            <Route index element={<SettingsPage />} />
            <Route path="categories" element={<ManagementPage />} />
          </Route>
          <Route path="more" element={<MorePage />} />
          <Route
            path="heatmap"
            element={<RedirectKeepQuery to="/analytics/heatmap" />}
          />
          <Route
            path="budgets"
            element={<RedirectKeepQuery to="/analytics/budgets" />}
          />
          <Route
            path="tags"
            element={<RedirectKeepQuery to="/analytics/tags" />}
          />
          <Route
            path="lending"
            element={<RedirectKeepQuery to="/finance/lending" />}
          />
          <Route
            path="recurring"
            element={<RedirectKeepQuery to="/transactions/recurring" />}
          />
          <Route
            path="trash"
            element={<RedirectKeepQuery to="/transactions/trash" />}
          />
          <Route path="management" element={<LegacyManagementRedirect />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
