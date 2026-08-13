import React from "react"
import ReactDOM from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { App as AntApp, ConfigProvider, theme } from "antd"
import zhCN from "antd/locale/zh_CN"
import { BrowserRouter } from "react-router-dom"
import { App } from "./App"
import "./styles.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
})

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        cssVar: { key: "qing-zhang" },
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#176b62",
          colorInfo: "#176b62",
          colorSuccess: "#4d7a5a",
          colorWarning: "#b47b2c",
          colorError: "#c65f43",
          colorBgLayout: "#f1f4f1",
          colorBgContainer: "#fbfcfa",
          colorText: "#102a2d",
          colorTextSecondary: "#687775",
          colorBorder: "#d7dfd9",
          colorBorderSecondary: "#e3e9e4",
          colorFillAlter: "#edf1ed",
          borderRadius: 8,
          borderRadiusLG: 12,
          controlHeight: 40,
          fontSize: 14,
          wireframe: false,
          fontFamily:
            'Aptos, "Segoe UI Variable", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
        components: {
          Layout: {
            bodyBg: "#f1f4f1",
            headerBg: "rgba(248,250,247,.94)",
            siderBg: "#0b2527",
          },
          Menu: {
            darkItemBg: "#0b2527",
            darkSubMenuItemBg: "#0b2527",
            darkItemHoverBg: "rgba(255,255,255,.045)",
            darkItemSelectedBg: "#153d3a",
            darkItemSelectedColor: "#a8e2d5",
            itemBorderRadius: 8,
            itemMarginInline: 4,
          },
          Card: { borderRadiusLG: 12, headerHeight: 52, headerFontSize: 15 },
          Table: {
            headerBg: "#edf1ed",
            rowHoverBg: "#f1f7f4",
            headerColor: "#50615e",
            borderColor: "#e3e9e4",
            headerSplitColor: "#dde4df",
          },
          Button: { borderRadius: 8, primaryShadow: "none", fontWeight: 600 },
          Drawer: { borderRadiusLG: 12 },
          Statistic: { contentFontSize: 28, titleFontSize: 13 },
          Segmented: { itemSelectedBg: "#fbfcfa", trackBg: "#e5ebe6" },
          Tabs: {
            inkBarColor: "#176b62",
            itemSelectedColor: "#176b62",
            itemHoverColor: "#176b62",
          },
        },
      }}
    >
      <AntApp message={{ maxCount: 3 }}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
)
