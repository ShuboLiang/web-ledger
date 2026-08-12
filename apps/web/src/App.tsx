import { lazy, Suspense } from "react";
import { Flex, Spin, Typography } from "antd";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
const DashboardPage = lazy(() => import("@/pages/dashboard").then((module) => ({ default: module.DashboardPage })));
const TransactionsPage = lazy(() => import("@/pages/transactions").then((module) => ({ default: module.TransactionsPage })));
const AnalyticsPage = lazy(() => import("@/pages/analytics").then((module) => ({ default: module.AnalyticsPage })));
const AiPage = lazy(() => import("@/pages/ai").then((module) => ({ default: module.AiPage })));
const ManagementPage = lazy(() => import("@/pages/management").then((module) => ({ default: module.ManagementPage })));
const SettingsPage = lazy(() => import("@/pages/settings").then((module) => ({ default: module.SettingsPage })));

export function App() {
  return <Suspense fallback={<Flex vertical align="center" justify="center" style={{ minHeight: "100vh" }} gap={12}><Spin size="large" /><Typography.Text type="secondary">正在加载工作区…</Typography.Text></Flex>}><Routes><Route element={<AppShell />}>
    <Route index element={<Navigate to="/dashboard" replace />} />
    <Route path="dashboard" element={<DashboardPage />} />
    <Route path="transactions" element={<TransactionsPage />} />
    <Route path="analytics" element={<AnalyticsPage />} />
    <Route path="ai" element={<AiPage />} />
    <Route path="management" element={<ManagementPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Route></Routes></Suspense>;
}
