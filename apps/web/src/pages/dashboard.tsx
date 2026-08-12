import { ArrowRightOutlined, RobotOutlined, FallOutlined, RiseOutlined, WalletOutlined } from "@ant-design/icons";
import { Pie, Line } from "@ant-design/plots";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Button, Card, Col, Empty, Flex, List, Row, Skeleton, Statistic, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { api, type Dashboard, type Transaction } from "@/lib/api";
import { money } from "@/lib/utils";

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/api/dashboard") });
  const { data: recent } = useQuery({ queryKey: ["transactions", "recent"], queryFn: () => api<{ records: Transaction[] }>("/api/transactions?limit=6") });
  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 12 }} />;
  const flow = data.cashflow.month;
  const days = Math.max(1, Number(data.anchor.slice(8)));
  const kpis = [
    { title: "本月支出", value: flow.expense, icon: <FallOutlined />, color: "#ea580c" },
    { title: "本月收入", value: flow.income, icon: <RiseOutlined />, color: "#16a34a" },
    { title: "本月结余", value: flow.balance, icon: <WalletOutlined />, color: flow.balance >= 0 ? "#0f766e" : "#dc2626" },
    { title: "日均支出", value: flow.expense / days, icon: <FallOutlined />, color: "#2563eb" },
  ];
  const trendConfig: any = { data: data.series.day, xField: "label", yField: "amount", height: 270, smooth: true, autoFit: true, axis: { y: { labelFormatter: (value: number) => `¥${value}` } }, style: { lineWidth: 3 }, theme: { type: "light", color: "#0f766e" }, tooltip: { items: [{ channel: "y", name: "支出", valueFormatter: (value: number) => money(value) }] } };
  const pieData = data.breakdowns.month.map((row) => ({ category: row.category, amount: row.amount }));
  const pieConfig: any = { data: pieData, angleField: "amount", colorField: "category", innerRadius: 0.62, height: 270, autoFit: true, legend: { color: { position: "bottom", layout: { justifyContent: "center" } } }, label: false, tooltip: { items: [{ channel: "y", valueFormatter: (value: number) => money(value) }] } };
  return <div className="page-stack">
    <Flex align="center" justify="space-between"><SpaceLabel label="时间范围" value={`本月 · ${data.anchor.slice(0, 7)}`} /></Flex>
    <Row gutter={[16, 16]}>{kpis.map((item) => <Col xs={24} sm={12} xl={6} key={item.title}><Card hoverable onClick={() => navigate(`/transactions?month=${data.anchor.slice(0, 7)}`)} className="metric-card"><Flex justify="space-between" align="flex-start"><Statistic title={item.title} value={item.value} precision={2} prefix="¥" valueStyle={{ color: item.color }} /><Avatar size={42} style={{ background: `${item.color}16`, color: item.color }} icon={item.icon} /></Flex><Typography.Text type="secondary" className="metric-hint">点击查看相关账目</Typography.Text></Card></Col>)}</Row>
    <Row gutter={[20, 20]}><Col xs={24} xl={16}><Card title="近 14 日支出趋势" extra={<Button type="link" onClick={() => navigate("/analytics")}>完整分析 <ArrowRightOutlined /></Button>}><Line {...trendConfig} /></Card></Col><Col xs={24} xl={8}><Card title="本月分类占比">{pieData.length ? <Pie {...pieConfig} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}</Card></Col></Row>
    <Row gutter={[20, 20]}><Col xs={24} xl={16}><Card title="最近账目" extra={<Button type="link" onClick={() => navigate("/transactions")}>查看全部</Button>}><List dataSource={recent?.records || []} locale={{ emptyText: "暂无账目" }} renderItem={(row) => <List.Item extra={<Typography.Text strong type={row.amount < 0 ? "danger" : "success"}>{row.amount < 0 ? "−" : "+"}{money(Math.abs(row.amount))}</Typography.Text>}><List.Item.Meta avatar={<Avatar shape="square" style={{ background: "#ecfdf5", color: "#0f766e" }}>{row.date.slice(8)}</Avatar>} title={row.item} description={`${row.category1} · ${row.category2}`} /></List.Item>} /></Card></Col><Col xs={24} xl={8}><Card className="ai-insight-card"><Flex vertical className="ai-insight-content"><Avatar size={44} icon={<RobotOutlined />} /><Typography.Text>AI 财务洞察</Typography.Text><Typography.Title level={3}>本月最大支出类别是<br />{data.breakdowns.month[0]?.category || "暂无"}</Typography.Title><Typography.Paragraph>占本月支出的 {((data.breakdowns.month[0]?.share || 0) * 100).toFixed(1)}%，可以继续询问 AI 获取详细建议。</Typography.Paragraph><Button type="primary" ghost onClick={() => navigate("/ai")}>进入 AI 助手 <ArrowRightOutlined /></Button></Flex></Card></Col></Row>
  </div>;
}

function SpaceLabel({ label, value }: { label: string; value: string }) { return <Flex gap={8} align="center"><Typography.Text type="secondary">{label}</Typography.Text><Tag bordered>{value}</Tag></Flex>; }
