import { ArrowDownOutlined, ArrowLeftOutlined, ArrowRightOutlined, ArrowUpOutlined, CalendarOutlined } from "@ant-design/icons";
import { Column, Pie } from "@ant-design/plots";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Col, DatePicker, Drawer, Empty, Flex, Grid, List, Progress, Row, Segmented, Skeleton, Space, Statistic, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { api, type Breakdown, type Dashboard, type Transaction } from "@/lib/api";
import { money } from "@/lib/utils";

type Scope = "day" | "week" | "month" | "year";
type TransactionPage = { records: Transaction[]; total: number };
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const shift = (date: string, days: number) => dayjs(date).add(days, "day").format("YYYY-MM-DD");
const shiftPeriod = (date: string, scope: Scope, direction: -1 | 1) => scope === "day" ? shift(date, direction) : scope === "week" ? shift(date, direction * 7) : dayjs(date).add(direction, scope).startOf(scope).format("YYYY-MM-DD");

export function AnalyticsPage() {
  const screens = Grid.useBreakpoint();
  const [scope, setScope] = useState<Scope>("month");
  const [anchor, setAnchor] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customRange, setCustomRange] = useState<[string, string] | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(dayjs().format("YYYY-MM"));
  const [selectedHeatDate, setSelectedHeatDate] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["analytics", anchor], queryFn: () => api<Dashboard>(`/api/dashboard${anchor ? `?anchor=${anchor}` : ""}`) });
  const selected = data?.anchor || anchor || dayjs().format("YYYY-MM-DD");
  const { data: customData } = useQuery({ queryKey: ["analytics-range", customRange], enabled: Boolean(customRange), queryFn: () => api<any>(`/api/dashboard/range?start=${customRange![0]}&end=${customRange![1]}`) });
  const { data: large } = useQuery({ queryKey: ["large-expenses", selected?.slice(0, 7)], enabled: Boolean(selected), queryFn: () => api<{ records: Transaction[] }>(`/api/transactions?month=${selected.slice(0, 7)}&page=1&pageSize=5&direction=expense&sortBy=amount&sortOrder=asc`) });
  const calendarMonthStart = `${calendarMonth}-01`;
  const calendarMonthEnd = dayjs(calendarMonthStart).endOf("month").format("YYYY-MM-DD");
  const calendarStart = customRange && customRange[0] > calendarMonthStart ? customRange[0] : calendarMonthStart;
  const calendarEnd = customRange && customRange[1] < calendarMonthEnd ? customRange[1] : calendarMonthEnd;
  const calendarInRange = calendarStart <= calendarEnd;
  const { data: calendarData, isFetching: calendarLoading } = useQuery({ queryKey: ["expense-calendar", calendarStart, calendarEnd], enabled: calendarInRange, queryFn: () => api<{ series: { key: string; amount: number }[] }>(`/api/dashboard/range?start=${calendarStart}&end=${calendarEnd}`) });
  const heatAmounts = useMemo(() => new Map((calendarData?.series || []).map((row) => [row.key, row.amount])), [calendarData?.series]);
  const heatThresholds = useMemo(() => {
    const values = [...heatAmounts.values()].filter((amount) => amount > 0).sort((a, b) => a - b);
    const at = (ratio: number) => values.length ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))] : 0;
    return [at(.25), at(.5), at(.75)];
  }, [heatAmounts]);
  const { data: heatDay, isFetching: heatDayLoading } = useQuery({ queryKey: ["heat-day", selectedHeatDate], enabled: Boolean(selectedHeatDate), queryFn: () => api<TransactionPage>(`/api/transactions?date=${selectedHeatDate}&direction=expense&page=1&pageSize=100`) });
  useEffect(() => { setCalendarMonth(customRange ? customRange[1].slice(0, 7) : selected.slice(0, 7)); }, [customRange?.[0], customRange?.[1], selected.slice(0, 7)]);
  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 14 }} />;
  const trendRows = customData?.series || data.series[scope === "year" ? "month" : scope] || [];
  const primaryRows: Breakdown[] = customData?.breakdown || data.breakdowns[scope];
  const secondaryRows: Breakdown[] = customData?.secondaryBreakdown || data.secondaryBreakdowns[scope];
  const activeFlow = customData?.cashflow || data.cashflow[scope];
  const comparison = data.comparison[scope];
  const change = customRange ? null : comparison.change;
  const chartData = trendRows.map((row: any) => ({ period: row.label, amount: row.amount }));
  const columnConfig: any = { data: chartData, xField: "period", yField: "amount", height: 300, autoFit: true, style: { radiusTopLeft: 5, radiusTopRight: 5, fill: "#176b62" }, axis: { y: { labelFormatter: (value: number) => `¥${value}` } }, tooltip: { title: { field: "period" }, items: [{ field: "amount", name: "支出金额", valueFormatter: (value: number) => money(value) }] } };
  const pie = (rows: Breakdown[]): any => ({ data: rows.map((row) => ({ category: row.parent ? `${row.parent} / ${row.category}` : row.category, amount: row.amount, share: row.share })), angleField: "amount", colorField: "category", innerRadius: 0.64, height: 310, autoFit: true, label: false, scale: { color: { range: ["#176b62", "#6d8f78", "#c99748", "#c96b52", "#6d7795", "#9a7f67", "#88b5aa"] } }, legend: { color: { position: "bottom" } }, tooltip: { title: { field: "category" }, items: [{ field: "amount", name: "支出金额", valueFormatter: (value: number) => money(value) }, { field: "share", name: "占比", valueFormatter: (value: number) => `${(value * 100).toFixed(1)}%` }] } });
  const currentRange = customRange ? `${customRange[0]} — ${customRange[1]}` : `${data.ranges[scope][0]} — ${data.ranges[scope][1]}`;
  const picker = scope === "day" ? "date" : scope;
  const pickerFormat = scope === "day" ? "YYYY年M月D日" : scope === "month" ? "YYYY年M月" : scope === "year" ? "YYYY年" : "YYYY-MM-DD";
  const periodPicker = <DatePicker className="analytics-period-picker" picker={picker} format={pickerFormat} allowClear={false} value={dayjs(selected)} disabled={Boolean(customRange)} onChange={(value) => setAnchor(value?.format("YYYY-MM-DD") || "")} />;
  const rangePicker = <DatePicker.RangePicker className="analytics-range-picker" onChange={(values) => { if (values?.[0] && values?.[1]) { setCustomRange([values[0].format("YYYY-MM-DD"), values[1].format("YYYY-MM-DD")]); setCustomMode(false); } }} />;
  const toggleCustom = () => { if (customRange) { setCustomRange(null); setCustomMode(false); } else setCustomMode((value) => !value); };
  const previousCalendarMonth = dayjs(calendarMonthStart).subtract(1, "month").format("YYYY-MM");
  const nextCalendarMonth = dayjs(calendarMonthStart).add(1, "month").format("YYYY-MM");
  const canGoPreviousMonth = !customRange || previousCalendarMonth >= customRange[0].slice(0, 7);
  const canGoNextMonth = !customRange || nextCalendarMonth <= customRange[1].slice(0, 7);
  const calendarMonthPicker = <DatePicker picker="month" allowClear={false} format="YYYY年M月" value={dayjs(calendarMonthStart)} disabledDate={(value) => Boolean(customRange && (value.format("YYYY-MM") < customRange[0].slice(0, 7) || value.format("YYYY-MM") > customRange[1].slice(0, 7)))} onChange={(value) => value && setCalendarMonth(value.format("YYYY-MM"))} />;
  return <div className="page-stack">
    <Card className="analytics-toolbar">{screens.md ? <Flex wrap align="center" justify="space-between" gap={12}>
      <Segmented<Scope> value={scope} disabled={Boolean(customRange)} onChange={setScope} options={[{ label: "日", value: "day" }, { label: "周", value: "week" }, { label: "月", value: "month" }, { label: "年", value: "year" }]} />
      <Space><Button icon={<ArrowLeftOutlined />} disabled={Boolean(customRange)} onClick={() => setAnchor(shiftPeriod(selected, scope, -1))} aria-label="上一周期" />{periodPicker}<Button icon={<ArrowRightOutlined />} disabled={Boolean(customRange)} onClick={() => setAnchor(shiftPeriod(selected, scope, 1))} aria-label="下一周期" /><Button type={customMode || customRange ? "primary" : "default"} onClick={toggleCustom}>{customRange ? "退出自定义" : "自定义范围"}</Button></Space>
      <Flex vertical align="flex-end"><Typography.Text type="secondary">当前统计周期</Typography.Text><Typography.Text strong>{currentRange}</Typography.Text></Flex>
    </Flex> : <Flex vertical gap={14} className="analytics-mobile-controls">
      <Segmented<Scope> block value={scope} disabled={Boolean(customRange)} onChange={setScope} options={[{ label: "日", value: "day" }, { label: "周", value: "week" }, { label: "月", value: "month" }, { label: "年", value: "year" }]} />
      <div className="analytics-period-nav"><Button icon={<ArrowLeftOutlined />} disabled={Boolean(customRange)} onClick={() => setAnchor(shiftPeriod(selected, scope, -1))} aria-label="上一周期" />{periodPicker}<Button icon={<ArrowRightOutlined />} disabled={Boolean(customRange)} onClick={() => setAnchor(shiftPeriod(selected, scope, 1))} aria-label="下一周期" /></div>
      <Flex align="end" justify="space-between" gap={12} className="analytics-mobile-range"><Flex vertical gap={2} style={{ minWidth: 0 }}><Typography.Text type="secondary">{customRange ? "自定义统计范围" : "当前统计范围"}</Typography.Text><Typography.Text strong className="analytics-range-value">{currentRange}</Typography.Text></Flex><Button type="link" icon={<CalendarOutlined />} onClick={toggleCustom}>{customRange ? "退出" : "自定义"}</Button></Flex>
    </Flex>}</Card>
    {customMode && !customRange && (screens.md ? <Card className="analytics-custom-range"><Space wrap>{rangePicker}<Typography.Text type="secondary">选择起止日期后立即应用</Typography.Text></Space></Card> : <Drawer title="自定义统计范围" placement="bottom" height="auto" open onClose={() => setCustomMode(false)} destroyOnHidden><Flex vertical gap={12}>{rangePicker}<Typography.Text type="secondary">选择起止日期后立即应用到全部统计图表。</Typography.Text></Flex></Drawer>)}
    <Row gutter={[16, 16]}><Col xs={24} md={8}><Metric title="周期支出" value={activeFlow.expense} /></Col><Col xs={24} md={8}><Metric title="周期收入" value={activeFlow.income} /></Col><Col xs={24} md={8}><Metric title="同比 / 环比" value={change == null ? null : Math.abs(change * 100)} percent trend={change} /></Col></Row>
    <Card title="收支趋势">{chartData.length ? <Column {...columnConfig} /> : <Empty />}</Card>
    <Row gutter={[20, 20]}><Col xs={24} xl={12}><Card title="一级分类占比">{primaryRows.length ? <Pie {...pie(primaryRows)} /> : <Empty />}</Card></Col><Col xs={24} xl={12}><Card title="二级分类占比">{secondaryRows.length ? <Pie {...pie(secondaryRows)} /> : <Empty />}</Card></Col></Row>
    <Card className="expense-calendar-card" title="每日支出日历">
      <div className="expense-calendar-layout">
        <aside className="expense-calendar-side">
          <Typography.Text className="expense-calendar-eyebrow">按月查看</Typography.Text>
          <Typography.Title level={4}>{dayjs(calendarMonthStart).format("YYYY年M月")}</Typography.Title>
          <Typography.Paragraph type="secondary">每格代表一天，颜色越深支出越高。点击日期查看当天账目。</Typography.Paragraph>
          <div className="expense-calendar-controls"><Button icon={<ArrowLeftOutlined />} disabled={!canGoPreviousMonth} onClick={() => setCalendarMonth(previousCalendarMonth)} aria-label="上一个月" />{calendarMonthPicker}<Button icon={<ArrowRightOutlined />} disabled={!canGoNextMonth} onClick={() => setCalendarMonth(nextCalendarMonth)} aria-label="下一个月" /></div>
          <ExpenseLegend thresholds={heatThresholds} />
          {customRange && <Typography.Text className="expense-calendar-range-note" type="secondary">当前自定义范围跨月或跨年时，上方趋势展示整体变化；这里逐月查看每日明细。</Typography.Text>}
        </aside>
        <div className={`expense-calendar-pane${calendarLoading ? " loading" : ""}`}>
          <ExpenseMonth year={Number(calendarMonth.slice(0, 4))} month={Number(calendarMonth.slice(5, 7)) - 1} amounts={heatAmounts} thresholds={heatThresholds} minDate={customRange?.[0]} maxDate={customRange?.[1]} onSelect={setSelectedHeatDate} mobile />
        </div>
      </div>
    </Card>
    <Row gutter={[20, 20]}><Col xs={24} xl={12}><Card title="分类支出排行"><List dataSource={primaryRows.slice(0, 8)} renderItem={(row, index) => <List.Item extra={<Typography.Text strong className="ranking-amount">{money(row.amount)}</Typography.Text>}><div className="ranking-row"><Flex gap={10} align="center"><Tag>{index + 1}</Tag><Typography.Text strong>{row.category}</Typography.Text></Flex><Progress percent={Number((row.share * 100).toFixed(1))} strokeColor="#176b62" trailColor="#e4eae5" size="small" /></div></List.Item>} /></Card></Col><Col xs={24} xl={12}><Card title="大额支出"><List dataSource={large?.records || []} renderItem={(row) => <List.Item extra={<Typography.Text strong type="danger" className="ranking-amount">{money(Math.abs(row.amount))}</Typography.Text>}><List.Item.Meta title={row.item} description={`${row.date} · ${row.category1}`} /></List.Item>} /></Card></Col></Row>
    <Drawer className="expense-day-drawer" title={selectedHeatDate ? dayjs(selectedHeatDate).format("M月D日") : "当天支出"} placement={screens.md ? "right" : "bottom"} height={screens.md ? undefined : "72vh"} open={Boolean(selectedHeatDate)} onClose={() => setSelectedHeatDate("")} destroyOnHidden>
      <Statistic title="当天支出" value={Number((heatDay?.records || []).reduce((sum, row) => sum + Math.abs(row.amount), 0).toFixed(2))} precision={2} prefix="¥" />
      <List className="expense-day-list" loading={heatDayLoading} dataSource={heatDay?.records || []} locale={{ emptyText: <Empty description="当天没有支出" /> }} renderItem={(row) => <List.Item extra={<Typography.Text strong type="danger">−{money(Math.abs(row.amount))}</Typography.Text>}><List.Item.Meta title={row.item} description={`${row.category1} / ${row.category2}${row.note ? ` · ${row.note}` : ""}`} /></List.Item>} />
    </Drawer>
  </div>;
}

function expenseLevel(amount: number, thresholds: number[]) {
  if (!amount) return 0;
  if (amount <= thresholds[0]) return 1;
  if (amount <= thresholds[1]) return 2;
  if (amount <= thresholds[2]) return 3;
  return 4;
}

function ExpenseLegend({ thresholds }: { thresholds: number[] }) {
  return <Flex className="expense-legend" align="center" gap={6}><Typography.Text type="secondary">¥0</Typography.Text>{[0, 1, 2, 3, 4].map((level) => <span key={level} className={`expense-legend-swatch level-${level}`} />)}<Typography.Text type="secondary">{thresholds[2] ? `${money(thresholds[2])} 以上` : "高支出"}</Typography.Text></Flex>;
}

function ExpenseMonth({ year, month, amounts, thresholds, onSelect, minDate, maxDate, mobile = false }: { year: number; month: number; amounts: Map<string, number>; thresholds: number[]; onSelect: (date: string) => void; minDate?: string; maxDate?: string; mobile?: boolean }) {
  const first = dayjs(`${year}-${String(month + 1).padStart(2, "0")}-01`);
  const days = first.daysInMonth();
  const leading = (first.day() + 6) % 7;
  const cells = [...Array(leading).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  return <section className={`expense-month${mobile ? " mobile" : ""}`} aria-label={`${year}年${month + 1}月支出日历`}>
    {!mobile && <Typography.Title level={5}>{month + 1} 月</Typography.Title>}
    <div className="expense-weekdays">{WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
    <div className="expense-days">{cells.map((day, index) => {
      if (!day) return <span className="expense-day-empty" key={`empty-${index}`} />;
      const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const amount = amounts.get(date) || 0;
      const outsideRange = Boolean((minDate && date < minDate) || (maxDate && date > maxDate));
      return <button type="button" key={date} disabled={outsideRange} className={`expense-day level-${expenseLevel(amount, thresholds)}${outsideRange ? " outside-range" : ""}`} title={outsideRange ? `${date} · 不在当前统计范围` : `${date} · 支出 ${money(amount)}`} aria-label={outsideRange ? `${month + 1}月${day}日，不在当前统计范围` : `${month + 1}月${day}日，支出${money(amount)}`} onClick={() => onSelect(date)}><span>{day}</span>{mobile && amount > 0 && <small>{amount >= 1000 ? "1k+" : Math.round(amount)}</small>}</button>;
    })}</div>
  </section>;
}

function Metric({ title, value, percent = false, trend }: { title: string; value: number | null; percent?: boolean; trend?: number | null }) { return <Card><Statistic title={title} value={value ?? 0} precision={percent ? 1 : 2} prefix={percent ? undefined : "¥"} suffix={percent ? "%" : undefined} valueStyle={{ color: trend == null ? undefined : trend > 0 ? "#c65f43" : "#4d7a5a" }} /><Flex gap={6} align="center">{trend != null && (trend > 0 ? <ArrowUpOutlined style={{ color: "#c65f43" }} /> : <ArrowDownOutlined style={{ color: "#4d7a5a" }} />)}<Typography.Text type="secondary">{trend == null ? "暂无可比数据" : trend > 0 ? "较上一周期增加" : "较上一周期减少"}</Typography.Text></Flex></Card>; }
