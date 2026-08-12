import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: false }, mutations: { retry: 0 } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        cssVar: { key: "qing-zhang" },
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#0f766e", colorInfo: "#0f766e", colorSuccess: "#15803d", colorWarning: "#d97706", colorError: "#dc2626",
          colorBgLayout: "#f3f6f6", colorBgContainer: "#ffffff", colorText: "#17202a", colorTextSecondary: "#64748b",
          borderRadius: 10, borderRadiusLG: 16, controlHeight: 40, fontSize: 14, wireframe: false,
        },
        components: {
          Layout: { bodyBg: "#f3f6f6", headerBg: "rgba(255,255,255,.92)", siderBg: "#071317" },
          Menu: { darkItemBg: "#071317", darkSubMenuItemBg: "#071317", darkItemSelectedBg: "rgba(20,184,166,.18)", darkItemSelectedColor: "#5eead4", itemBorderRadius: 10 },
          Card: { borderRadiusLG: 18, headerHeight: 56 },
          Table: { headerBg: "#f8fafc", rowHoverBg: "#f0fdfa", headerColor: "#475569", borderColor: "#eef2f3" },
          Button: { borderRadius: 10, primaryShadow: "none" },
          Drawer: { borderRadiusLG: 20 },
          Statistic: { contentFontSize: 27 },
        },
      }}
    >
      <AntApp message={{ maxCount: 3 }}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter><App /></BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
