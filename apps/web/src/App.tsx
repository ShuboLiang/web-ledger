import { lazy, Suspense } from "react"
import { Flex, Spin, Typography } from "antd"
import { Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
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
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="heatmap" element={<HeatmapPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="recurring" element={<RecurringPage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="lending" element={<LendingPage />} />
          <Route path="tags" element={<TagsPage />} />
          <Route path="ai" element={<AiPage />} />
          <Route path="management" element={<ManagementPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
