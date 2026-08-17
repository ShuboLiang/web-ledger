import {
  AppstoreOutlined,
  CalendarOutlined,
  BarChartOutlined,
  BankOutlined,
  BookOutlined,
  BookTwoTone,
  RobotOutlined,
  PlusOutlined,
  MoreOutlined,
  SearchOutlined,
  SettingOutlined,
  TagsOutlined,
  WalletOutlined,
  LoadingOutlined,
  LogoutOutlined,
  UserOutlined,
} from "@ant-design/icons"
import {
  Avatar,
  Button,
  Divider,
  Dropdown,
  Flex,
  Grid,
  Input,
  Layout,
  Menu,
  Modal,
  Space,
  Tooltip,
  Typography,
} from "antd"
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { TransactionDrawer } from "@/components/transaction-drawer"
import { api, type AuthUser } from "@/lib/api"
import { clearPersist } from "@/lib/utils"
import { analyticsPath } from "@/lib/analytics-scope"
import { useSearchableSelect, useMobileSheetFocusGuard, useOverlayScrollLock } from "@/lib/use-viewport"

const { Header, Sider, Content } = Layout
const nav = [
  { key: "/dashboard", label: "概览", icon: <AppstoreOutlined /> },
  { key: "/transactions", label: "账目", icon: <BookOutlined /> },
  { key: "/heatmap", label: "热力图", icon: <CalendarOutlined /> },
  { key: "/analytics", label: "分析", icon: <BarChartOutlined /> },
  { key: "/budgets", label: "预算", icon: <WalletOutlined /> },
  { key: "/finance", label: "资产负债", icon: <BankOutlined /> },
  { key: "/tags", label: "标签", icon: <TagsOutlined /> },
  { key: "/ai", label: "AI 助手", icon: <RobotOutlined /> },
  { key: "/management", label: "分类管理", icon: <TagsOutlined /> },
  { key: "/settings", label: "设置", icon: <SettingOutlined /> },
]
const mobileNav = [
  { key: "/dashboard", label: "概览", icon: <AppstoreOutlined /> },
  { key: "/transactions", label: "账目", icon: <BookOutlined /> },
  { key: "/heatmap", label: "热力", icon: <CalendarOutlined /> },
  { key: "/analytics", label: "分析", icon: <BarChartOutlined /> },
  { key: "/budgets", label: "预算", icon: <WalletOutlined /> },
  { key: "/more", label: "更多", icon: <MoreOutlined /> },
]
const morePaths = new Set([
  "/more",
  "/finance",
  "/tags",
  "/ai",
  "/management",
  "/settings",
])
const titles: Record<string, [string, string]> = {
  "/dashboard": ["财务概览", "本月结单与消费轨迹"],
  "/transactions": ["账目明细", "查找、核对和整理每一笔账目"],
  "/heatmap": ["支出热力", "按天查看支出深浅，点日期看当天账目"],
  "/analytics": ["统计分析", "比较周期、分类与长期变化"],
  "/ai": ["AI 助手", "用自然语言记账和查询"],
  "/budgets": ["预算规划", "控制本月总支出与重点分类"],
  "/finance": ["资产与负债", "管理账户余额、资金转账和还款计划"],
  "/tags": ["消费标签", "按场景、人物和目的重新理解消费"],
  "/management": ["分类管理", "维护收支分类"],
  "/settings": ["系统设置", "管理 AI 模型和数据设置"],
  "/more": ["更多功能", "管理资产、预算、分类与应用设置"],
}

export function AppShell() {
  const [drawer, setDrawer] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const screens = Grid.useBreakpoint()
  const searchableSelect = useSearchableSelect()
  useMobileSheetFocusGuard()
  useOverlayScrollLock()
  const desktop = Boolean(screens.lg)
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const aiAnswering = useIsMutating({ mutationKey: ["ai-command"] }) > 0
  const navItems = nav.map((item) =>
    item.key === "/ai" && aiAnswering
      ? { ...item, icon: <LoadingOutlined spin />, label: "AI 回答中" }
      : item,
  )
  const { data: auth } = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => api<{ user: AuthUser }>("/api/auth/me"),
    staleTime: Infinity,
  })
  const logout = useMutation({
    mutationFn: () => api("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      clearPersist()
      queryClient.clear()
      window.location.assign("/login")
    },
  })
  const [title, subtitle] = titles[location.pathname] || titles["/dashboard"]
  const analyticsHref = () => analyticsPath()
  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", openSearch)
    return () => window.removeEventListener("keydown", openSearch)
  }, [])
  useEffect(() => {
    if (location.pathname !== "/management") return
    const legacy = new URLSearchParams(location.search)
    if (legacy.get("tab") === "budgets")
      navigate(
        `/budgets${legacy.get("month") ? `?month=${legacy.get("month")}` : ""}`,
        { replace: true },
      )
  }, [location.pathname, location.search, navigate])
  const submitSearch = (value: string) => {
    const query = value.trim()
    setSearchOpen(false)
    setSearchValue("")
    navigate(
      query
        ? `/transactions?query=${encodeURIComponent(query)}`
        : "/transactions",
    )
  }
  const userMenu = {
    items: [
      {
        key: "identity",
        label: (
          <div className="user-menu-identity">
            <b>{auth?.user.displayName}</b>
            <span>@{auth?.user.username}</span>
          </div>
        ),
        disabled: true,
      },
      { type: "divider" as const },
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "退出登录",
        danger: true,
      },
    ],
    onClick: ({ key }: { key: string }) => key === "logout" && logout.mutate(),
  }
  const userButton = (
    <Dropdown menu={userMenu} trigger={["click"]}>
      <Button className="user-menu-button" aria-label="用户菜单">
        <Avatar size={24} icon={<UserOutlined />} />
        {desktop && <span>{auth?.user.displayName}</span>}
      </Button>
    </Dropdown>
  )
  return (
    <Layout className="app-layout">
      {desktop && (
        <Sider width={240} className="app-sider">
          <Button
            type="text"
            className="brand"
            onClick={() => navigate("/dashboard")}
          >
            <BookTwoTone twoToneColor="#70d2bf" className="brand-icon" />
            <span>
              <b>轻账</b>
              <small>PERSONAL LEDGER</small>
            </span>
          </Button>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={navItems}
            onClick={({ key }) =>
              navigate(key === "/analytics" ? analyticsHref() : key)
            }
          />
        </Sider>
      )}
      <Layout>
        <Header className="app-header">
          <div className="app-header-inner">
            <div className="page-heading">
              <Typography.Title level={desktop ? 3 : 4}>
                {title}
              </Typography.Title>
              {desktop && (
                <Typography.Text type="secondary">{subtitle}</Typography.Text>
              )}
            </div>
            {desktop ? (
              <Space size={8} wrap={false} className="header-actions">
                <Button
                  icon={<SearchOutlined />}
                  onClick={() => setSearchOpen(true)}
                >
                  搜索账目{" "}
                  <Typography.Text keyboard className="search-shortcut">
                    Ctrl K
                  </Typography.Text>
                </Button>
                {screens.xl && (
                  <Button
                    icon={
                      aiAnswering ? <LoadingOutlined spin /> : <RobotOutlined />
                    }
                    onClick={() => navigate("/ai")}
                  >
                    {aiAnswering ? "AI 回答中" : "问 AI"}
                  </Button>
                )}
                <Divider type="vertical" />
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setDrawer(true)}
                >
                  记一笔
                </Button>
                <Tooltip title="系统设置">
                  <Button
                    icon={<SettingOutlined />}
                    aria-label="系统设置"
                    onClick={() => navigate("/settings")}
                  />
                </Tooltip>
                {userButton}
              </Space>
            ) : (
              <Space size={6}>
                {aiAnswering && (
                  <Tooltip title="AI 正在回答">
                    <Button
                      icon={<LoadingOutlined spin />}
                      aria-label="AI 正在回答，返回 AI 助手"
                      onClick={() => navigate("/ai")}
                    />
                  </Tooltip>
                )}
                <Tooltip title="搜索账目">
                  <Button
                    icon={<SearchOutlined />}
                    aria-label="搜索账目"
                    onClick={() => setSearchOpen(true)}
                  />
                </Tooltip>
                {userButton}
              </Space>
            )}
          </div>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
      {!desktop && (
        <div className="mobile-nav">
          <Flex align="center" justify="space-around">
            {mobileNav.slice(0, 3).map((item) => (
              <Button
                type="text"
                key={item.key}
                className={`mobile-nav-item ${location.pathname === item.key ? "active" : ""}`}
                onClick={() =>
                  navigate(
                    item.key === "/analytics" ? analyticsHref() : item.key,
                  )
                }
                icon={item.icon}
              >
                <span>{item.label}</span>
              </Button>
            ))}
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={<PlusOutlined />}
              className="mobile-add"
              aria-label="记一笔"
              onClick={() => setDrawer(true)}
            />
            {mobileNav.slice(3).map((item) => {
              const active =
                item.key === "/more"
                  ? morePaths.has(location.pathname)
                  : location.pathname === item.key
              return (
                <Button
                  type="text"
                  key={item.key}
                  className={`mobile-nav-item ${active ? "active" : ""}`}
                  onClick={() =>
                    navigate(
                      item.key === "/analytics" ? analyticsHref() : item.key,
                    )
                  }
                  icon={item.icon}
                >
                  <span>{item.label}</span>
                </Button>
              )
            })}
          </Flex>
        </div>
      )}
      <Modal
        open={searchOpen}
        title="搜索全部账目"
        footer={null}
        destroyOnHidden
        onCancel={() => setSearchOpen(false)}
      >
        <Typography.Paragraph type="secondary">
          可搜索项目、备注、一级分类和二级分类，结果会在账目工作区中展示。
        </Typography.Paragraph>
        <Input.Search
          autoFocus={searchableSelect}
          allowClear
          size="large"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          onSearch={submitSearch}
          enterButton="搜索"
          placeholder="例如：午饭、饮品、出差"
        />
      </Modal>
      <TransactionDrawer open={drawer} onOpenChange={setDrawer} />
    </Layout>
  )
}
