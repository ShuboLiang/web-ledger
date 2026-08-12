import {
  AppstoreOutlined, BarChartOutlined, BookOutlined, BookTwoTone, RobotOutlined, PlusOutlined,
  SearchOutlined, SettingOutlined, TagsOutlined, UserOutlined,
} from "@ant-design/icons";
import { Button, Flex, Grid, Input, Layout, Menu, Modal, Space, Tag, Tooltip, Typography } from "antd";
import { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { TransactionDrawer } from "@/components/transaction-drawer";

const { Header, Sider, Content } = Layout;
const nav = [
  { key: "/dashboard", label: "概览", icon: <AppstoreOutlined /> },
  { key: "/transactions", label: "账目", icon: <BookOutlined /> },
  { key: "/analytics", label: "分析", icon: <BarChartOutlined /> },
  { key: "/ai", label: "AI 助手", icon: <RobotOutlined /> },
  { key: "/management", label: "分类账户", icon: <TagsOutlined /> },
  { key: "/settings", label: "设置", icon: <SettingOutlined /> },
];
const mobileNav = nav.filter((item) => ["/dashboard", "/transactions", "/analytics", "/settings"].includes(item.key));
const titles: Record<string, [string, string]> = {
  "/dashboard": ["财务概览", "关键财务数据与近期动态"], "/transactions": ["账目明细", "筛选、整理和维护全部账目"],
  "/analytics": ["统计分析", "洞察支出结构与长期趋势"], "/ai": ["AI 助手", "用自然语言查询和管理账本"],
  "/management": ["分类与账户", "管理账本基础资料与规则"], "/settings": ["系统设置", "模型、数据与安全配置"],
};

export function AppShell() {
  const [drawer, setDrawer] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const screens = Grid.useBreakpoint();
  const desktop = Boolean(screens.lg);
  const location = useLocation();
  const navigate = useNavigate();
  const [title, subtitle] = titles[location.pathname] || titles["/dashboard"];
  const today = useMemo(() => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "short" }).format(new Date()), []);
  const submitSearch = (value: string) => {
    const query = value.trim();
    setSearchOpen(false);
    setSearchValue("");
    navigate(query ? `/transactions?query=${encodeURIComponent(query)}` : "/transactions");
  };
  return <Layout className="app-layout">
    {desktop && <Sider width={240} className="app-sider">
      <Button type="text" className="brand" onClick={() => navigate("/dashboard")}><BookTwoTone twoToneColor="#14b8a6" className="brand-icon" /><span><b>轻账</b><small>FINANCE OS</small></span></Button>
      <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={nav} onClick={({ key }) => navigate(key)} />
      <div className="connection-card"><Tag color="success">本地账本已连接</Tag><Typography.Text type="secondary">数据与 AI 配置由服务端持久化</Typography.Text></div>
    </Sider>}
    <Layout>
      <Header className="app-header">
        <div className="page-heading"><Typography.Title level={desktop ? 3 : 4}>{title}</Typography.Title>{desktop && <Typography.Text type="secondary">{subtitle}</Typography.Text>}</div>
        <Space size={8} wrap={false}>
          {screens.md && <Button icon={<SearchOutlined />} onClick={() => setSearchOpen(true)}>全局搜索</Button>}
          {screens.xl && <Button icon={<RobotOutlined />} onClick={() => navigate("/ai")}>AI 快速记账</Button>}
          {screens.xl && <Typography.Text type="secondary">{today}</Typography.Text>}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawer(true)}>{desktop ? "记一笔" : null}</Button>
          <Tooltip title="系统设置"><Button icon={<UserOutlined />} aria-label="系统设置" onClick={() => navigate("/settings")} /></Tooltip>
        </Space>
      </Header>
      <Content className="app-content"><Outlet /></Content>
    </Layout>
    {!desktop && <div className="mobile-nav"><Flex align="center" justify="space-around">{mobileNav.slice(0, 2).map((item) => <Button type="text" key={item.key} className={`mobile-nav-item ${location.pathname === item.key ? "active" : ""}`} onClick={() => navigate(item.key)} icon={item.icon}><span>{item.label}</span></Button>)}<Button type="primary" shape="circle" size="large" icon={<PlusOutlined />} className="mobile-add" aria-label="记一笔" onClick={() => setDrawer(true)} />{mobileNav.slice(2).map((item) => <Button type="text" key={item.key} className={`mobile-nav-item ${location.pathname === item.key ? "active" : ""}`} onClick={() => navigate(item.key)} icon={item.icon}><span>{item.label}</span></Button>)}</Flex></div>}
    <Modal open={searchOpen} title="搜索全部账目" footer={null} destroyOnHidden onCancel={() => setSearchOpen(false)}>
      <Typography.Paragraph type="secondary">可搜索项目、备注、一级分类和二级分类，结果会在账目工作区中展示。</Typography.Paragraph>
      <Input.Search autoFocus allowClear size="large" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} onSearch={submitSearch} enterButton="搜索" placeholder="例如：午饭、饮品、出差" />
    </Modal>
    <TransactionDrawer open={drawer} onOpenChange={setDrawer} />
  </Layout>;
}
