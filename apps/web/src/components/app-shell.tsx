import {
  AppstoreOutlined,
  BarChartOutlined,
  BankOutlined,
  BookOutlined,
  BookTwoTone,
  RobotOutlined,
  PlusOutlined,
  MoreOutlined,
  SearchOutlined,
  SettingOutlined,
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
  { key: "/finance", label: "资金", icon: <BankOutlined /> },
  { key: "/analytics", label: "分析", icon: <BarChartOutlined /> },
  { key: "/ai", label: "AI 助手", icon: <RobotOutlined /> },
  { key: "/settings", label: "设置", icon: <SettingOutlined /> },
]
const mobileNav = [
  { key: "/dashboard", label: "概览", icon: <AppstoreOutlined /> },
  { key: "/transactions", label: "账目", icon: <BookOutlined /> },
  { key: "/finance", label: "资金", icon: <BankOutlined /> },
  { key: "/analytics", label: "分析", icon: <BarChartOutlined /> },
  { key: "/more", label: "更多", icon: <MoreOutlined /> },
]
const morePaths = new Set(["/more", "/ai", "/settings", "/settings/categories"])
const titles: Record<string, [string, string]> = {
  "/dashboard": ["财务概览", "本月结单与消费轨迹"],
  "/transactions": ["账目", "明细、定期账单和回收站"],
  "/transactions/recurring": ["账目", "房租、会员等固定收支按期生成"],
  "/transactions/trash": ["账目", "恢复或彻底删除误删的账目"],
  "/analytics": ["分析", "比较周期、分类与长期变化"],
  "/analytics/heatmap": ["分析", "按天查看支出深浅，点日期看当天账目"],
  "/analytics/budgets": ["分析", "控制本月总支出与重点分类"],
  "/analytics/tags": ["分析", "按场景、人物和目的重新理解消费"],
  "/finance": ["资金", "账户额度、转账还款和人情往来"],
  "/finance/lending": ["资金", "垫付、代付和借入，按笔跟踪谁欠谁"],
  "/ai": ["AI 助手", "用自然语言记账和查询"],
  "/settings": ["系统设置", "管理 AI 模型和收支分类"],
  "/settings/categories": ["系统设置", "维护记账时使用的一级和二级分类"],
  "/more": ["更多功能", "AI 助手与应用设置"],
}

const navKeyFor = (pathname: string) =>
  nav.find(
    (item) =>
      pathname === item.key || pathname.startsWith(`${item.key}/`),
  )?.key || pathname

const mobileActive = (key: string, pathname: string) =>
  key === "/more"
    ? morePaths.has(pathname) || pathname.startsWith("/settings")
    : pathname === key || pathname.startsWith(`${key}/`)

const titleFor = (pathname: string): [string, string] => {
  if (titles[pathname]) return titles[pathname]
  const parent = navKeyFor(pathname)
  return titles[parent] || titles["/dashboard"]
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
  const navItems = nav.map((item) => {
    if (item.key === "/ai" && aiAnswering)
      return { ...item, icon: <LoadingOutlined spin />, label: "AI 回答中" }
    return item
  })
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
  const [title, subtitle] = titleFor(location.pathname)
  const openNav = (key: string) => {
    if (location.pathname === key || location.pathname.startsWith(`${key}/`))
      return
    navigate(key === "/analytics" ? analyticsPath() : key)
  }
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
            selectedKeys={[navKeyFor(location.pathname)]}
            items={navItems}
            onClick={({ key }) => openNav(key)}
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
                className={`mobile-nav-item ${mobileActive(item.key, location.pathname) ? "active" : ""}`}
                onClick={() => openNav(item.key)}
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
            {mobileNav.slice(3).map((item) => (
              <Button
                type="text"
                key={item.key}
                className={`mobile-nav-item ${mobileActive(item.key, location.pathname) ? "active" : ""}`}
                onClick={() => openNav(item.key)}
                icon={item.icon}
              >
                <span>{item.label}</span>
              </Button>
            ))}
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
