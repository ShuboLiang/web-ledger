import { ArrowDownOutlined, ArrowLeftOutlined, ArrowRightOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { Column, Heatmap, Pie } from "@ant-design/plots";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Col, DatePicker, Empty, Flex, List, Progress, Row, Segmented, Skeleton, Space, Statistic, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { api, type Breakdown, type Dashboard, type Transaction } from "@/lib/api";
import { money } from "@/lib/utils";

type Scope = "day" | "week" | "month" | "year";
const shift = (date: string, days: number) => dayjs(date).add(days, "day").format("YYYY-MM-DD");
const shiftPeriod = (date: string, scope: Scope, direction: -1 | 1) => scope === "day" ? shift(date, direction) : scope === "week" ? shift(date, direction * 7) : dayjs(date).add(direction, scope).startOf(scope).format("YYYY-MM-DD");

export function AnalyticsPage() {
  const [scope, setScope] = useState<Scope>("month");
  const [anchor, setAnchor] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customRange, setCustomRange] = useState<[string, string] | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["analytics", anchor], queryFn: () => api<Dashboard>(`/api/dashboard${anchor ? `?anchor=${anchor}` : ""}`) });
  const selected = data?.anchor || anchor;
  const { data: customData } = useQuery({ queryKey: ["analytics-range", customRange], enabled: Boolean(customRange), queryFn: () => api<any>(`/api/dashboard/range?start=${customRange![0]}&end=${customRange![1]}`) });
  const { data: large } = useQuery({ queryKey: ["large-expenses", selected?.slice(0, 7)], enabled: Boolean(selected), queryFn: () => api<{ records: Transaction[] }>(`/api/transactions?month=${selected.slice(0, 7)}&page=1&pageSize=5&direction=expense&sortBy=amount&sortOrder=asc`) });
  const heatRows = useMemo(() => (data?.yearHeatmap || []).map(([date, amount]) => { const current = dayjs(date); const ordinal = current.diff(dayjs(`${current.year()}-01-01`), "day") + 1; return { week: String(Math.ceil((ordinal + dayjs(`${current.year()}-01-01`).day()) / 7)).padStart(2, "0"), weekday: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][current.day()], amount, date }; }), [data?.yearHeatmap]);
  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 14 }} />;
  const trendRows = customData?.series || data.series[scope === "year" ? "month" : scope] || [];
  const primaryRows: Breakdown[] = customData?.breakdown || data.breakdowns[scope];
  const secondaryRows: Breakdown[] = customData?.secondaryBreakdown || data.secondaryBreakdowns[scope];
  const activeFlow = customData?.cashflow || data.cashflow[scope];
  const comparison = data.comparison[scope];
  const change = customRange ? null : comparison.change;
  const chartData = trendRows.map((row: any) => ({ period: row.label, amount: row.amount }));
  const columnConfig: any = { data: chartData, xField: "period", yField: "amount", height: 300, autoFit: true, style: { radiusTopLeft: 6, radiusTopRight: 6, fill: "#0f766e" }, axis: { y: { labelFormatter: (value: number) => `¥${value}` } }, tooltip: { items: [{ channel: "y", name: "支出", valueFormatter: (value: number) => money(value) }] } };
  const pie = (rows: Breakdown[]): any => ({ data: rows.map((row) => ({ category: row.parent ? `${row.parent} / ${row.category}` : row.category, amount: row.amount })), angleField: "amount", colorField: "category", innerRadius: 0.58, height: 310, autoFit: true, label: false, legend: { color: { position: "bottom" } }, tooltip: { items: [{ channel: "y", valueFormatter: (value: number) => money(value) }] } });
  const heatConfig: any = { data: heatRows, xField: "week", yField: "weekday", colorField: "amount", height: 220, autoFit: true, shape: "square", style: { inset: 1 }, scale: { color: { range: ["#e6f4f1", "#5ab5aa", "#075f59"] }, y: { domain: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] } }, axis: { x: { title: "周次", labelAutoHide: true }, y: { title: false } }, tooltip: { title: (row: any) => row.date, items: [{ channel: "color", name: "支出", valueFormatter: (value: number) => money(value) }] } };
  const currentRange = customRange ? `${customRange[0]} — ${customRange[1]}` : `${data.ranges[scope][0]} — ${data.ranges[scope][1]}`;
  return <div className="page-stack">
    <Card className="analytics-toolbar"><Flex wrap align="center" justify="space-between" gap={12}><Segmented<Scope> value={scope} onChange={setScope} options={[{ label: "日", value: "day" }, { label: "周", value: "week" }, { label: "月", value: "month" }, { label: "年", value: "year" }]} /><Space><Button icon={<ArrowLeftOutlined />} disabled={Boolean(customRange)} onClick={() => setAnchor(shiftPeriod(selected, scope, -1))} aria-label="上一周期" /><DatePicker value={dayjs(selected)} disabled={Boolean(customRange)} onChange={(value) => setAnchor(value?.format("YYYY-MM-DD") || "")} /><Button icon={<ArrowRightOutlined />} disabled={Boolean(customRange)} onClick={() => setAnchor(shiftPeriod(selected, scope, 1))} aria-label="下一周期" /><Button type={customMode || customRange ? "primary" : "default"} onClick={() => { if (customRange) { setCustomRange(null); setCustomMode(false); } else setCustomMode((value) => !value); }}>{customRange ? "退出自定义" : "自定义范围"}</Button></Space><Flex vertical align="flex-end"><Typography.Text type="secondary">当前统计周期</Typography.Text><Typography.Text strong>{currentRange}</Typography.Text></Flex></Flex></Card>
    {customMode && !customRange && <Card><Space wrap><DatePicker.RangePicker onChange={(values) => { if (values?.[0] && values?.[1]) setCustomRange([values[0].format("YYYY-MM-DD"), values[1].format("YYYY-MM-DD")]); }} /></Space></Card>}
    <Row gutter={[16, 16]}><Col xs={24} md={8}><Metric title="周期支出" value={activeFlow.expense} /></Col><Col xs={24} md={8}><Metric title="周期收入" value={activeFlow.income} /></Col><Col xs={24} md={8}><Metric title="同比 / 环比" value={change == null ? null : Math.abs(change * 100)} percent trend={change} /></Col></Row>
    <Card title="收支趋势">{chartData.length ? <Column {...columnConfig} /> : <Empty />}</Card>
    <Row gutter={[20, 20]}><Col xs={24} xl={12}><Card title="一级分类占比">{primaryRows.length ? <Pie {...pie(primaryRows)} /> : <Empty />}</Card></Col><Col xs={24} xl={12}><Card title="二级分类占比">{secondaryRows.length ? <Pie {...pie(secondaryRows)} /> : <Empty />}</Card></Col></Row>
    <Card title={`${selected.slice(0, 4)} 年度支出热力图`}>{heatRows.length ? <Heatmap {...heatConfig} /> : <Empty description="本年暂无支出" />}</Card>
    <Row gutter={[20, 20]}><Col xs={24} xl={12}><Card title="分类支出排行"><List dataSource={primaryRows.slice(0, 8)} renderItem={(row, index) => <List.Item extra={<Typography.Text strong>{money(row.amount)}</Typography.Text>}><div className="ranking-row"><Flex gap={10} align="center"><Tag>{index + 1}</Tag><Typography.Text strong>{row.category}</Typography.Text></Flex><Progress percent={Number((row.share * 100).toFixed(1))} strokeColor="#0f766e" size="small" /></div></List.Item>} /></Card></Col><Col xs={24} xl={12}><Card title="大额支出"><List dataSource={large?.records || []} renderItem={(row) => <List.Item extra={<Typography.Text strong type="danger">{money(Math.abs(row.amount))}</Typography.Text>}><List.Item.Meta title={row.item} description={`${row.date} · ${row.category1}`} /></List.Item>} /></Card></Col></Row>
  </div>;
}

function Metric({ title, value, percent = false, trend }: { title: string; value: number | null; percent?: boolean; trend?: number | null }) { return <Card><Statistic title={title} value={value ?? 0} precision={percent ? 1 : 2} prefix={percent ? undefined : "¥"} suffix={percent ? "%" : undefined} valueStyle={{ color: trend == null ? undefined : trend > 0 ? "#ea580c" : "#16a34a" }} /><Flex gap={6} align="center">{trend != null && (trend > 0 ? <ArrowUpOutlined style={{ color: "#ea580c" }} /> : <ArrowDownOutlined style={{ color: "#16a34a" }} />)}<Typography.Text type="secondary">{trend == null ? "暂无可比数据" : trend > 0 ? "较上一周期增加" : "较上一周期减少"}</Typography.Text></Flex></Card>; }
