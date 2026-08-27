import { Grid, Tabs } from "antd"
import { Outlet, useLocation, useNavigate } from "react-router-dom"

type WorkspaceTab = { path: string; label: string }

export function WorkspaceTabs({ items }: { items: WorkspaceTab[] }) {
  const location = useLocation()
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  const active =
    [...items]
      .sort((left, right) => right.path.length - left.path.length)
      .find(
        (item) =>
          location.pathname === item.path ||
          location.pathname.startsWith(`${item.path}/`),
      )?.path || items[0].path
  return (
    <Tabs
      className="workspace-tabs"
      aria-label="工作区导航"
      size={screens.lg ? "large" : "middle"}
      activeKey={active}
      items={items.map((item) => ({
        key: item.path,
        label: item.label,
      }))}
      onChange={(path) => {
        if (location.pathname !== path) navigate(path)
      }}
    />
  )
}

function WorkspaceShell({ items }: { items: WorkspaceTab[] }) {
  return (
    <div className="workspace-shell">
      <WorkspaceTabs items={items} />
      <Outlet />
    </div>
  )
}

export function TransactionsWorkspace() {
  return (
    <WorkspaceShell
      items={[
        { path: "/transactions", label: "明细" },
        { path: "/transactions/recurring", label: "定期" },
        { path: "/transactions/trash", label: "回收站" },
      ]}
    />
  )
}

export function FinanceWorkspace() {
  return (
    <WorkspaceShell
      items={[
        { path: "/finance", label: "账户" },
        { path: "/finance/lending", label: "人情往来" },
      ]}
    />
  )
}

export function AnalyticsWorkspace() {
  return (
    <WorkspaceShell
      items={[
        { path: "/analytics", label: "统计" },
        { path: "/analytics/heatmap", label: "热力" },
        { path: "/analytics/budgets", label: "预算" },
        { path: "/analytics/tags", label: "标签" },
      ]}
    />
  )
}

export function SettingsWorkspace() {
  return (
    <WorkspaceShell
      items={[
        { path: "/settings", label: "模型" },
        { path: "/settings/categories", label: "分类" },
      ]}
    />
  )
}
