import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
} from "@ant-design/icons"
import { Column, Line } from "@ant-design/plots"
import { useQuery } from "@tanstack/react-query"
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Flex,
  Grid,
  List,
  Progress,
  Row,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  api,
  type Breakdown,
  type BreakdownChange,
  type Dashboard,
  type Transaction,
} from "@/lib/api"
import { compactMoney, money } from "@/lib/utils"
import { CategoryBreakdownBars } from "@/components/category-breakdown-bars"

type Scope = "day" | "week" | "month" | "year"
type TransactionPage = { records: Transaction[]; total: number }
const analyticsFilterKey = "qing-zhang-analytics-filter"
type RangeAnalytics = {
  start: string
  end: string
  days: number
  cashflow: Dashboard["cashflow"]["month"]
  breakdown: Breakdown[]
  secondaryBreakdown: Breakdown[]
  comparisonBreakdown: BreakdownChange[]
  comparison: Dashboard["comparison"]["month"]
  series: { key: string; label: string; amount: number }[]
}
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"]
const scopes: Scope[] = ["day", "week", "month", "year"]
const shift = (date: string, days: number) =>
  dayjs(date).add(days, "day").format("YYYY-MM-DD")
const shiftPeriod = (date: string, scope: Scope, direction: -1 | 1) =>
  scope === "day"
    ? shift(date, direction)
    : scope === "week"
      ? shift(date, direction * 7)
      : dayjs(date).add(direction, scope).startOf(scope).format("YYYY-MM-DD")
const isScope = (value: string | null): value is Scope =>
  Boolean(value && scopes.includes(value as Scope))
const dateText = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dayjs(value).toDate())
const rangeText = (range: [string, string]) =>
  `${dateText(range[0])} — ${dateText(range[1])}`

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  const [customMode, setCustomMode] = useState(false)
  const [mobileRangeDraft, setMobileRangeDraft] = useState<
    [string, string] | null
  >(null)
  const [selectedHeatDate, setSelectedHeatDate] = useState("")
  const scope: Scope = isScope(params.get("scope"))
    ? (params.get("scope") as Scope)
    : "month"
  const anchor = params.get("anchor") || ""
  const customRange =
    params.get("start") && params.get("end")
      ? ([params.get("start")!, params.get("end")!] as [string, string])
      : null
  const setParam = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      value ? next.set(key, value) : next.delete(key)
      return next
    })
  useEffect(() => {
    const saved = sessionStorage.getItem(analyticsFilterKey)
    if (!params.toString() && saved) {
      setParams(new URLSearchParams(saved), { replace: true })
      return
    }
    if (params.toString())
      sessionStorage.setItem(analyticsFilterKey, `?${params.toString()}`)
  }, [params, setParams])
  const setScope = (value: Scope) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set("scope", value)
      next.delete("start")
      next.delete("end")
      return next
    })
    setCustomMode(false)
  }
  const setAnchor = (value: string) => setParam("anchor", value)
  const clearCustomRange = () => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.delete("start")
      next.delete("end")
      return next
    })
    setCustomMode(false)
  }
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["analytics", anchor],
    queryFn: () =>
      api<Dashboard>(`/api/dashboard${anchor ? `?anchor=${anchor}` : ""}`),
  })
  const selected = data?.anchor || anchor || dayjs().format("YYYY-MM-DD")
  const calendarMonth =
    params.get("calendarMonth") ||
    customRange?.[1].slice(0, 7) ||
    selected.slice(0, 7)
  const requestedRange =
    customRange || (data ? (data.ranges[scope] as [string, string]) : null)
  const {
    data: customData,
    isLoading: customLoading,
    isError: customError,
    refetch: refetchCustom,
  } = useQuery({
    queryKey: ["analytics-range", customRange],
    enabled: Boolean(customRange),
    queryFn: () =>
      api<RangeAnalytics>(
        `/api/dashboard/range?start=${customRange![0]}&end=${customRange![1]}`,
      ),
  })
  const {
    data: large,
    isLoading: largeLoading,
    isError: largeError,
    refetch: refetchLarge,
  } = useQuery({
    queryKey: ["large-expenses", requestedRange],
    enabled: Boolean(requestedRange),
    queryFn: () =>
      api<{ records: Transaction[] }>(
        `/api/transactions?start=${requestedRange![0]}&end=${requestedRange![1]}&page=1&pageSize=5&direction=expense&sortBy=amount&sortOrder=asc`,
      ),
  })
  const calendarMonthStart = `${calendarMonth}-01`
  const calendarMonthEnd = dayjs(calendarMonthStart)
    .endOf("month")
    .format("YYYY-MM-DD")
  const calendarStart =
    customRange && customRange[0] > calendarMonthStart
      ? customRange[0]
      : calendarMonthStart
  const calendarEnd =
    customRange && customRange[1] < calendarMonthEnd
      ? customRange[1]
      : calendarMonthEnd
  const calendarInRange = calendarStart <= calendarEnd
  const {
    data: calendarData,
    isFetching: calendarLoading,
    isError: calendarError,
    refetch: refetchCalendar,
  } = useQuery({
    queryKey: ["expense-calendar", calendarStart, calendarEnd],
    enabled: calendarInRange,
    queryFn: () =>
      api<{ series: { key: string; amount: number }[] }>(
        `/api/dashboard/range?start=${calendarStart}&end=${calendarEnd}`,
      ),
  })
  const heatAmounts = useMemo(
    () =>
      new Map((calendarData?.series || []).map((row) => [row.key, row.amount])),
    [calendarData?.series],
  )
  const heatThresholds = useMemo(() => {
    const values = [...heatAmounts.values()]
      .filter((amount) => amount > 0)
      .sort((a, b) => a - b)
    const at = (ratio: number) =>
      values.length
        ? values[
            Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))
          ]
        : 0
    return [at(0.25), at(0.5), at(0.75)]
  }, [heatAmounts])
  const {
    data: heatDay,
    isFetching: heatDayLoading,
    isError: heatDayError,
    refetch: refetchHeatDay,
  } = useQuery({
    queryKey: ["heat-day", selectedHeatDate],
    enabled: Boolean(selectedHeatDate),
    queryFn: () =>
      api<TransactionPage>(
        `/api/transactions?date=${selectedHeatDate}&direction=expense&page=1&pageSize=100`,
      ),
  })
  if (isLoading || !data)
    return isError ? (
      <ErrorState
        message={error instanceof Error ? error.message : "分析数据加载失败"}
        onRetry={() => refetch()}
      />
    ) : (
      <Skeleton active paragraph={{ rows: 14 }} />
    )
  if (customRange && (customLoading || !customData))
    return customError ? (
      <ErrorState
        message="自定义范围加载失败"
        onRetry={() => refetchCustom()}
      />
    ) : (
      <Skeleton active paragraph={{ rows: 14 }} />
    )
  const activeRange = customRange || (data.ranges[scope] as [string, string])
  const trendRows = customData?.series || data.rangeSeries[scope] || []
  const primaryRows: Breakdown[] =
    customData?.breakdown || data.breakdowns[scope]
  const secondaryRows: Breakdown[] =
    customData?.secondaryBreakdown || data.secondaryBreakdowns[scope]
  const activeFlow = customData?.cashflow || data.cashflow[scope]
  const comparison = customData?.comparison || data.comparison[scope]
  const comparisonRows =
    customData?.comparisonBreakdown || data.comparisonBreakdowns[scope] || []
  const change = comparison.change
  const chartData = trendRows.map((row: any) => ({
    period: row.label,
    amount: row.amount,
  }))
  const columnConfig: any = {
    data: chartData,
    xField: "period",
    yField: "amount",
    height: 300,
    autoFit: true,
    paddingTop: 30,
    paddingRight: 48,
    style: {
      radiusTopLeft: 5,
      radiusTopRight: 5,
      fill: "#176b62",
      shadowColor: "transparent",
      shadowBlur: 0,
    },
    label: {
      text: (row: { amount: number }) =>
        row.amount ? compactMoney(row.amount) : "",
      position: "top",
      textBaseline: "bottom",
      dy: -5,
      fontSize: 11,
      fill: "#56635e",
      transform: [{ type: "overlapHide" }],
    },
    axis: {
      y: { labelFormatter: (value: number) => compactMoney(value) },
    },
    tooltip: false,
    interaction: {
      tooltip: false,
      elementHighlight: false,
    },
    state: {
      active: { fillOpacity: 1, shadowColor: "transparent", shadowBlur: 0 },
      inactive: { fillOpacity: 1, opacity: 1 },
    },
  }
  const requestedCategory = params.get("focusCategory") || ""
  const focusedCategory = primaryRows.some(
    (row) => row.category === requestedCategory,
  )
    ? requestedCategory
    : primaryRows[0]?.category || ""
  const focusedSecondaryRows = focusedCategory
    ? secondaryRows.filter((row) => row.parent === focusedCategory)
    : secondaryRows
  const contributionRows = comparisonRows.slice(0, 6)
  const budgetPaceRows =
    !customRange && data.budget
      ? data.rangeSeries.month.map((row, index) => ({
          period: row.label,
          cumulative: data.rangeSeries.month
            .slice(0, index + 1)
            .reduce((sum, item) => sum + item.amount, 0),
          budget:
            data.budget!.amount *
            ((index + 1) / Math.max(1, data.rangeSeries.month.length)),
        }))
      : []
  const budgetChartData = budgetPaceRows.flatMap((row) => [
    { period: row.period, series: "实际累计支出", amount: row.cumulative },
    { period: row.period, series: "预算进度", amount: row.budget },
  ])
  const budgetConfig: any = {
    data: budgetChartData,
    xField: "period",
    yField: "amount",
    colorField: "series",
    height: 280,
    autoFit: true,
    paddingTop: 30,
    paddingRight: 64,
    scale: { color: { range: ["#176b62", "#c99748"] } },
    style: { lineWidth: 2 },
    label: {
      text: (row: { amount: number }, index: number) =>
        index >= budgetChartData.length - 2 ? compactMoney(row.amount) : "",
      position: "top",
      dy: -7,
      fontSize: 10,
      fill: "#56635e",
      transform: [{ type: "overlapHide" }],
    },
    axis: {
      y: { labelFormatter: (value: number) => compactMoney(value) },
    },
    legend: { color: { position: "top" } },
    tooltip: false,
    interaction: { tooltip: false },
  }
  const currentRange = rangeText(activeRange)
  const picker = scope === "day" ? "date" : scope
  const pickerFormat =
    scope === "day"
      ? "YYYY年M月D日"
      : scope === "month"
        ? "YYYY年M月"
        : scope === "year"
          ? "YYYY年"
          : "YYYY-MM-DD"
  const periodPicker = (
    <DatePicker
      className="analytics-period-picker"
      picker={picker}
      format={pickerFormat}
      allowClear={false}
      value={dayjs(selected)}
      disabled={Boolean(customRange)}
      onChange={(value) => setAnchor(value?.format("YYYY-MM-DD") || "")}
    />
  )
  const applyCustomRange = (startValue: string, endValue: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set("start", startValue)
      next.set("end", endValue)
      return next
    })
    setCustomMode(false)
  }
  const rangePicker = (
    <DatePicker.RangePicker
      className="analytics-range-picker"
      onChange={(values) => {
        const startValue = values?.[0]
        const endValue = values?.[1]
        if (startValue && endValue)
          applyCustomRange(
            startValue.format("YYYY-MM-DD"),
            endValue.format("YYYY-MM-DD"),
          )
      }}
    />
  )
  const toggleCustom = () => {
    if (customRange) clearCustomRange()
    else {
      setMobileRangeDraft(activeRange)
      setCustomMode((value) => !value)
    }
  }
  const mobileRangePicker = mobileRangeDraft && (
    <Flex vertical gap={16}>
      <div className="analytics-mobile-date-fields">
        <Flex vertical gap={6}>
          <Typography.Text>开始日期</Typography.Text>
          <DatePicker
            allowClear={false}
            value={dayjs(mobileRangeDraft[0])}
            maxDate={dayjs(mobileRangeDraft[1])}
            format="YYYY年M月D日"
            onChange={(value) => {
              if (!value) return
              const start = value.format("YYYY-MM-DD")
              setMobileRangeDraft([
                start,
                mobileRangeDraft[1] < start ? start : mobileRangeDraft[1],
              ])
            }}
          />
        </Flex>
        <Flex vertical gap={6}>
          <Typography.Text>结束日期</Typography.Text>
          <DatePicker
            allowClear={false}
            value={dayjs(mobileRangeDraft[1])}
            minDate={dayjs(mobileRangeDraft[0])}
            format="YYYY年M月D日"
            onChange={(value) => {
              if (!value) return
              const end = value.format("YYYY-MM-DD")
              setMobileRangeDraft([
                mobileRangeDraft[0] > end ? end : mobileRangeDraft[0],
                end,
              ])
            }}
          />
        </Flex>
      </div>
      <Button
        type="primary"
        onClick={() =>
          applyCustomRange(mobileRangeDraft[0], mobileRangeDraft[1])
        }
      >
        应用范围
      </Button>
    </Flex>
  )
  const previousCalendarMonth = dayjs(calendarMonthStart)
    .subtract(1, "month")
    .format("YYYY-MM")
  const nextCalendarMonth = dayjs(calendarMonthStart)
    .add(1, "month")
    .format("YYYY-MM")
  const canGoPreviousMonth =
    !customRange || previousCalendarMonth >= customRange[0].slice(0, 7)
  const canGoNextMonth =
    !customRange || nextCalendarMonth <= customRange[1].slice(0, 7)
  const calendarMonthPicker = (
    <DatePicker
      picker="month"
      allowClear={false}
      format="YYYY年M月"
      value={dayjs(calendarMonthStart)}
      disabledDate={(value) =>
        Boolean(
          customRange &&
          (value.format("YYYY-MM") < customRange[0].slice(0, 7) ||
            value.format("YYYY-MM") > customRange[1].slice(0, 7)),
        )
      }
      onChange={(value) =>
        value && setParam("calendarMonth", value.format("YYYY-MM"))
      }
    />
  )
  return (
    <div className="page-stack">
      <Card className="analytics-toolbar">
        {screens.md ? (
          <Flex wrap align="center" justify="space-between" gap={12}>
            <Segmented<Scope>
              value={scope}
              disabled={Boolean(customRange)}
              onChange={setScope}
              options={[
                { label: "日", value: "day" },
                { label: "周", value: "week" },
                { label: "月", value: "month" },
                { label: "年", value: "year" },
              ]}
            />
            <Space>
              <Button
                icon={<ArrowLeftOutlined />}
                disabled={Boolean(customRange)}
                onClick={() => setAnchor(shiftPeriod(selected, scope, -1))}
                aria-label="上一周期"
              />
              {periodPicker}
              <Button
                icon={<ArrowRightOutlined />}
                disabled={Boolean(customRange)}
                onClick={() => setAnchor(shiftPeriod(selected, scope, 1))}
                aria-label="下一周期"
              />
              <Button
                type={customMode || customRange ? "primary" : "default"}
                onClick={toggleCustom}
              >
                {customRange ? "退出自定义" : "自定义范围"}
              </Button>
            </Space>
            <Flex vertical align="flex-end">
              <Typography.Text type="secondary">当前统计周期</Typography.Text>
              <Typography.Text strong>{currentRange}</Typography.Text>
            </Flex>
          </Flex>
        ) : (
          <Flex vertical gap={14} className="analytics-mobile-controls">
            <Segmented<Scope>
              block
              value={scope}
              disabled={Boolean(customRange)}
              onChange={setScope}
              options={[
                { label: "日", value: "day" },
                { label: "周", value: "week" },
                { label: "月", value: "month" },
                { label: "年", value: "year" },
              ]}
            />
            <div className="analytics-period-nav">
              <Button
                icon={<ArrowLeftOutlined />}
                disabled={Boolean(customRange)}
                onClick={() => setAnchor(shiftPeriod(selected, scope, -1))}
                aria-label="上一周期"
              />
              {periodPicker}
              <Button
                icon={<ArrowRightOutlined />}
                disabled={Boolean(customRange)}
                onClick={() => setAnchor(shiftPeriod(selected, scope, 1))}
                aria-label="下一周期"
              />
            </div>
            <Flex
              align="end"
              justify="space-between"
              gap={12}
              className="analytics-mobile-range"
            >
              <Flex vertical gap={2} style={{ minWidth: 0 }}>
                <Typography.Text type="secondary">
                  {customRange ? "自定义统计范围" : "当前统计范围"}
                </Typography.Text>
                <Typography.Text strong className="analytics-range-value">
                  {currentRange}
                </Typography.Text>
              </Flex>
              <Button
                type="link"
                icon={<CalendarOutlined />}
                onClick={toggleCustom}
              >
                {customRange ? "退出" : "自定义"}
              </Button>
            </Flex>
          </Flex>
        )}
      </Card>
      {customMode &&
        !customRange &&
        (screens.md ? (
          <Card className="analytics-custom-range">
            <Space wrap>
              {rangePicker}
              <Typography.Text type="secondary">
                选择起止日期后立即应用
              </Typography.Text>
            </Space>
          </Card>
        ) : (
          <Drawer
            className="analytics-range-drawer"
            title="自定义统计范围"
            placement="bottom"
            height="auto"
            open
            onClose={() => setCustomMode(false)}
            destroyOnHidden
          >
            {mobileRangePicker}
          </Drawer>
        ))}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Metric
            title="周期支出"
            value={activeFlow.expense}
            trend={change}
            trendLabel={
              change == null
                ? "暂无可比数据"
                : change === 0
                  ? "与上一周期持平"
                  : `较上一周期${change > 0 ? "增加" : "减少"} ${Math.abs(change * 100).toFixed(1)}%`
            }
          />
        </Col>
        <Col xs={24} md={8}>
          <Metric title="周期收入" value={activeFlow.income} />
        </Col>
        <Col xs={24} md={8}>
          <Metric
            title="净结余"
            value={activeFlow.balance}
            valueStyle={{
              color: activeFlow.balance < 0 ? "#c65f43" : "#176b62",
            }}
          />
        </Col>
      </Row>
      <Card
        title="支出趋势"
        extra={
          <Typography.Text type="secondary">
            {customData
              ? customData.days > 120
                ? "自定义范围按月"
                : "自定义范围按日"
              : scope === "year"
                ? "本年按月"
                : "当前范围按日"}
          </Typography.Text>
        }
      >
        {chartData.length === 1 ? (
          <SinglePointSummary row={chartData[0]} />
        ) : chartData.length ? (
          <>
            <Column {...columnConfig} />
            <ChartSummary rows={chartData} />
          </>
        ) : (
          <Empty />
        )}
      </Card>
      <Row gutter={[20, 20]}>
        <Col xs={24} xl={12}>
          <Card title="一级分类支出">
            {primaryRows.length ? (
              <CategoryBreakdownBars
                rows={primaryRows}
                onCategoryClick={(row) =>
                  setParam("focusCategory", row.category)
                }
              />
            ) : (
              <Empty />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            title={
              focusedCategory ? `${focusedCategory} · 二级分类` : "二级分类支出"
            }
          >
            {focusedSecondaryRows.length ? (
              <CategoryBreakdownBars
                rows={focusedSecondaryRows}
                onCategoryClick={(row) =>
                  navigate(
                    `/transactions?start=${activeRange[0]}&end=${activeRange[1]}&category1=${encodeURIComponent(row.parent || focusedCategory)}&category2=${encodeURIComponent(row.category)}`,
                  )
                }
              />
            ) : (
              <Empty
                description={
                  focusedCategory ? "该分类暂无二级支出" : "暂无二级分类"
                }
              />
            )}
          </Card>
        </Col>
      </Row>
      {contributionRows.length > 0 && (
        <Card
          title="分类变化贡献"
          extra={
            <Typography.Text type="secondary">与上一周期相比</Typography.Text>
          }
        >
          <CategoryContribution rows={contributionRows} />
        </Card>
      )}
      <div
        className={`analytics-insight-grid${budgetPaceRows.length > 0 ? " has-budget" : ""}`}
      >
        <Card
          title="预算消耗节奏"
          extra={
            data.budget ? (
              <Typography.Text type="secondary">
                预算 {money(data.budget.amount)}
              </Typography.Text>
            ) : (
              <Tag>未设置预算</Tag>
            )
          }
        >
          {budgetPaceRows.length > 0 ? (
            <>
              <Line {...budgetConfig} />
              <Typography.Text
                type="secondary"
                className="chart-summary-visible"
              >
                当前累计支出 {money(data.budget!.used)}，预算使用率{" "}
                {(data.budget!.usageRate * 100).toFixed(1)}%。
              </Typography.Text>
            </>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="尚未设置本月总预算"
            >
              <Button
                type="primary"
                onClick={() =>
                  navigate(`/budgets?month=${selected.slice(0, 7)}`)
                }
              >
                去设置预算
              </Button>
            </Empty>
          )}
        </Card>
        <Card
          className="large-expense-card"
          title="大额支出"
          extra={
            <Typography.Text type="secondary">{currentRange}</Typography.Text>
          }
        >
          {largeError ? (
            <ErrorState
              message="大额支出加载失败"
              onRetry={() => refetchLarge()}
            />
          ) : (
            <List
              className="large-expense-list"
              loading={largeLoading}
              dataSource={large?.records || []}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="当前范围没有支出"
                  />
                ),
              }}
              renderItem={(row, index) => (
                <List.Item className="large-expense-item">
                  <Typography.Text
                    type="secondary"
                    className="large-expense-rank"
                  >
                    {index + 1}
                  </Typography.Text>
                  <div className="large-expense-main">
                    <Typography.Text strong ellipsis={{ tooltip: row.item }}>
                      {row.item}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      {row.date} · {row.category1}
                    </Typography.Text>
                  </div>
                  <Button
                    type="link"
                    onClick={() =>
                      navigate(
                        `/transactions?start=${activeRange[0]}&end=${activeRange[1]}&query=${encodeURIComponent(row.item)}`,
                      )
                    }
                  >
                    {money(Math.abs(row.amount))}
                  </Button>
                </List.Item>
              )}
            />
          )}
        </Card>
      </div>
      <Card className="expense-calendar-card" title="每日支出日历">
        <div className="expense-calendar-layout">
          <aside className="expense-calendar-side">
            <Typography.Text className="expense-calendar-eyebrow">
              按月查看
            </Typography.Text>
            <Typography.Title level={4}>
              {dayjs(calendarMonthStart).format("YYYY年M月")}
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              每格代表一天，颜色越深支出越高。点击日期查看当天账目。
            </Typography.Paragraph>
            <div className="expense-calendar-controls">
              <Button
                icon={<ArrowLeftOutlined />}
                disabled={!canGoPreviousMonth}
                onClick={() => setParam("calendarMonth", previousCalendarMonth)}
                aria-label="上一个月"
              />
              {calendarMonthPicker}
              <Button
                icon={<ArrowRightOutlined />}
                disabled={!canGoNextMonth}
                onClick={() => setParam("calendarMonth", nextCalendarMonth)}
                aria-label="下一个月"
              />
            </div>
            <ExpenseLegend thresholds={heatThresholds} />
            {customRange && (
              <Typography.Text
                className="expense-calendar-range-note"
                type="secondary"
              >
                当前自定义范围跨月或跨年时，上方趋势展示整体变化；这里逐月查看每日明细。
              </Typography.Text>
            )}
          </aside>
          <div
            className={`expense-calendar-pane${calendarLoading ? " loading" : ""}`}
          >
            {calendarError ? (
              <ErrorState
                message="日历数据加载失败"
                onRetry={() => refetchCalendar()}
              />
            ) : (
              <ExpenseMonth
                year={Number(calendarMonth.slice(0, 4))}
                month={Number(calendarMonth.slice(5, 7)) - 1}
                amounts={heatAmounts}
                thresholds={heatThresholds}
                minDate={customRange?.[0]}
                maxDate={customRange?.[1]}
                onSelect={setSelectedHeatDate}
                mobile
              />
            )}
          </div>
        </div>
      </Card>
      <Drawer
        className="expense-day-drawer"
        title={
          selectedHeatDate
            ? dayjs(selectedHeatDate).format("M月D日")
            : "当天支出"
        }
        placement={screens.md ? "right" : "bottom"}
        height={screens.md ? undefined : "72vh"}
        open={Boolean(selectedHeatDate)}
        onClose={() => setSelectedHeatDate("")}
        destroyOnHidden
      >
        <Statistic
          title="当天支出"
          value={heatAmounts.get(selectedHeatDate) || 0}
          precision={2}
          prefix="¥"
        />
        {heatDay && heatDay.total > heatDay.records.length && (
          <Alert
            type="info"
            showIcon
            message={`当天共 ${heatDay.total} 笔，当前显示前 ${heatDay.records.length} 笔`}
          />
        )}
        <List
          className="expense-day-list"
          loading={heatDayLoading}
          dataSource={heatDay?.records || []}
          locale={{ emptyText: <Empty description="当天没有支出" /> }}
          renderItem={(row) => (
            <List.Item
              extra={
                <Typography.Text strong type="danger">
                  −{money(Math.abs(row.amount))}
                </Typography.Text>
              }
            >
              <List.Item.Meta
                title={row.item}
                description={`${row.category1} / ${row.category2}${row.note ? ` · ${row.note}` : ""}`}
              />
            </List.Item>
          )}
        />
      </Drawer>
    </div>
  )
}

function expenseLevel(amount: number, thresholds: number[]) {
  if (!amount) return 0
  if (amount <= thresholds[0]) return 1
  if (amount <= thresholds[1]) return 2
  if (amount <= thresholds[2]) return 3
  return 4
}

function ExpenseLegend({ thresholds }: { thresholds: number[] }) {
  const labels = [
    "无",
    thresholds[0] ? `≤${money(thresholds[0])}` : "低",
    thresholds[1] ? `≤${money(thresholds[1])}` : "中",
    thresholds[2] ? `≤${money(thresholds[2])}` : "高",
    thresholds[2] ? `>${money(thresholds[2])}` : "最高",
  ]
  return (
    <Flex className="expense-legend" align="center" gap={6} wrap>
      <Typography.Text type="secondary">支出强度</Typography.Text>
      {labels.map((label, level) => (
        <Flex key={level} align="center" gap={3}>
          <span className={`expense-legend-swatch level-${level}`} />
          <Typography.Text type="secondary">{label}</Typography.Text>
        </Flex>
      ))}
    </Flex>
  )
}

function ExpenseMonth({
  year,
  month,
  amounts,
  thresholds,
  onSelect,
  minDate,
  maxDate,
  mobile = false,
}: {
  year: number
  month: number
  amounts: Map<string, number>
  thresholds: number[]
  onSelect: (date: string) => void
  minDate?: string
  maxDate?: string
  mobile?: boolean
}) {
  const first = dayjs(`${year}-${String(month + 1).padStart(2, "0")}-01`)
  const days = first.daysInMonth()
  const leading = (first.day() + 6) % 7
  const cells = [
    ...Array(leading).fill(null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ]
  return (
    <section
      className={`expense-month${mobile ? " mobile" : ""}`}
      aria-label={`${year}年${month + 1}月支出日历`}
    >
      {!mobile && <Typography.Title level={5}>{month + 1} 月</Typography.Title>}
      <div className="expense-weekdays" role="row">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} role="columnheader">
            {weekday}
          </span>
        ))}
      </div>
      <div className="expense-days">
        {cells.map((day, index) => {
          if (!day)
            return <span className="expense-day-empty" key={`empty-${index}`} />
          const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          const amount = amounts.get(date) || 0
          const outsideRange = Boolean(
            (minDate && date < minDate) || (maxDate && date > maxDate),
          )
          return (
            <button
              type="button"
              key={date}
              disabled={outsideRange}
              className={`expense-day level-${expenseLevel(amount, thresholds)}${outsideRange ? " outside-range" : ""}`}
              title={
                outsideRange
                  ? `${date} · 不在当前统计范围`
                  : `${date} · 支出 ${money(amount)}`
              }
              aria-label={
                outsideRange
                  ? `${month + 1}月${day}日，不在当前统计范围`
                  : `${month + 1}月${day}日，支出${money(amount)}`
              }
              onClick={() => onSelect(date)}
            >
              <span>{day}</span>
              {mobile && amount > 0 && (
                <small>{amount >= 1000 ? "1k+" : Math.round(amount)}</small>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <Alert
      type="error"
      showIcon
      message={message}
      action={
        <Button size="small" onClick={onRetry}>
          重试
        </Button>
      }
    />
  )
}

function ChartSummary({
  rows,
}: {
  rows: { period: string; amount: number }[]
}) {
  const peak = rows.reduce(
    (highest, row) => (row.amount > highest.amount ? row : highest),
    rows[0],
  )
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  return (
    <Typography.Text type="secondary" className="chart-summary-visible">
      共支出 {money(total)}，最高支出出现在 {peak.period}，金额{" "}
      {money(peak.amount)}。
    </Typography.Text>
  )
}

function SinglePointSummary({
  row,
}: {
  row: { period: string; amount: number }
}) {
  return (
    <div className="chart-single-summary">
      <Typography.Text type="secondary">{row.period} 支出</Typography.Text>
      <Typography.Text strong>{money(row.amount)}</Typography.Text>
      <Typography.Text type="secondary">
        当前范围只有一个时间点，直接显示总额。
      </Typography.Text>
    </div>
  )
}

function CategoryContribution({ rows }: { rows: BreakdownChange[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.difference)))
  return (
    <div className="category-contribution-list" aria-label="分类变化贡献">
      {rows.map((row) => (
        <div className="category-contribution-row" key={row.category}>
          <Typography.Text
            strong
            className="category-contribution-label"
            ellipsis={{ tooltip: row.category }}
          >
            {row.category}
          </Typography.Text>
          <div className="category-contribution-track">
            <span
              className={`category-contribution-bar ${row.difference >= 0 ? "increase" : "decrease"}`}
              style={{
                width: `${Math.max(4, Math.round((Math.abs(row.difference) / max) * 100))}%`,
              }}
            />
          </div>
          <Typography.Text
            strong
            className={
              row.difference > 0
                ? "category-contribution-increase"
                : row.difference < 0
                  ? "category-contribution-decrease"
                  : "category-contribution-flat"
            }
          >
            {row.difference > 0 ? "+" : ""}
            {money(row.difference)}
          </Typography.Text>
        </div>
      ))}
    </div>
  )
}

function Metric({
  title,
  value,
  trend,
  trendLabel,
  valueStyle,
}: {
  title: string
  value: number | null
  trend?: number | null
  trendLabel?: string
  valueStyle?: CSSProperties
}) {
  const trendColor =
    trend == null || trend === 0 ? undefined : trend > 0 ? "#c65f43" : "#4d7a5a"
  return (
    <Card>
      <Statistic
        title={title}
        value={value ?? 0}
        formatter={value == null ? () => "—" : undefined}
        precision={value == null ? undefined : 2}
        prefix={value == null ? undefined : "¥"}
        valueStyle={valueStyle || { color: trendColor }}
      />
      <Flex gap={6} align="center">
        {trend != null &&
          trend !== 0 &&
          (trend > 0 ? (
            <ArrowUpOutlined style={{ color: "#c65f43" }} />
          ) : (
            <ArrowDownOutlined style={{ color: "#4d7a5a" }} />
          ))}
        <Typography.Text type="secondary">{trendLabel || ""}</Typography.Text>
      </Flex>
    </Card>
  )
}
