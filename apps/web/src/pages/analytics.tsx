import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
} from "@ant-design/icons"
import { Line } from "@ant-design/plots"
import { useQuery } from "@tanstack/react-query"
import {
  Alert,
  Button,
  Card,
  Col,
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
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  api,
  type Breakdown,
  type BreakdownChange,
  type Dashboard,
  type Transaction,
} from "@/lib/api"
import { compactMoney, money } from "@/lib/utils"
import {
  isAnalyticsScope,
  readAnalyticsAnchor,
  readAnalyticsScope,
  writeAnalyticsAnchor,
  writeAnalyticsScope,
} from "@/lib/analytics-scope"
import { usePickerInputReadOnly } from "@/lib/use-viewport"
import { ExpenseCategoryOverview } from "@/components/expense-category-overview"
import { DatePicker } from "@/components/sheet-date-picker"

type Scope = "day" | "week" | "month" | "year"
type TrendChartRow = {
  key: string
  period: string
  amount: number
  start?: string
  end?: string
}
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
const scopes: Scope[] = ["day", "week", "month", "year"]
const shift = (date: string, days: number) =>
  dayjs(date).add(days, "day").format("YYYY-MM-DD")
const startOfWeek = (date: string) => {
  const value = dayjs(date)
  const isoDay = value.day() === 0 ? 7 : value.day()
  return value.subtract(isoDay - 1, "day").format("YYYY-MM-DD")
}
const shiftPeriod = (date: string, scope: Scope, direction: -1 | 1) =>
  scope === "day"
    ? shift(date, direction)
    : scope === "week"
      ? shift(startOfWeek(date), direction * 7)
      : dayjs(date).add(direction, scope).startOf(scope).format("YYYY-MM-DD")
const isScope = (value: string | null): value is Scope =>
  Boolean(value && scopes.includes(value as Scope))
const currentPeriodLabel = (value: Scope) =>
  value === "day"
    ? "今天"
    : value === "week"
      ? "本周"
      : value === "year"
        ? "本年"
        : "本月"
const isCurrentPeriod = (date: string, value: Scope) => {
  const today = dayjs()
  const selectedDate = dayjs(date)
  if (value === "day") return selectedDate.isSame(today, "day")
  if (value === "week")
    return startOfWeek(date) === startOfWeek(today.format("YYYY-MM-DD"))
  if (value === "month") return selectedDate.isSame(today, "month")
  return selectedDate.isSame(today, "year")
}
const dateText = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dayjs(value).toDate())
const rangeText = (range: [string, string]) =>
  `${dateText(range[0])} — ${dateText(range[1])}`
const rangeTransactionsQuery = (range: [string, string]) => {
  const [start, end] = range
  if (start === end) return `date=${start}`
  if (
    start.endsWith("-01") &&
    dayjs(start).endOf("month").format("YYYY-MM-DD") === end
  )
    return `month=${start.slice(0, 7)}`
  return `start=${start}&end=${end}`
}

function clipTrendToToday(rows: TrendChartRow[]) {
  const today = dayjs().format("YYYY-MM-DD")
  const thisMonth = today.slice(0, 7)
  return rows.filter((row) =>
    row.key.length === 7 ? row.key <= thisMonth : row.key <= today,
  )
}

function weekPeriodLabel(start: string, end: string) {
  const startDate = dayjs(start)
  const endDate = dayjs(end)
  if (start === end) return startDate.format("M/D")
  return startDate.month() === endDate.month()
    ? `${startDate.format("M/D")}–${endDate.format("D")}`
    : `${startDate.format("M/D")}–${endDate.format("M/D")}`
}

function mobileTrendRows(rows: TrendChartRow[]) {
  const occurred = clipTrendToToday(rows)
  if (occurred.length <= 31) {
    return occurred.map((row) =>
      row.key.length === 7
        ? row
        : { ...row, period: dayjs(row.key).format("M/D") },
    )
  }

  if (occurred.length <= 90) {
    const groups = new Map<string, TrendChartRow>()
    for (const row of occurred) {
      const weekStart = startOfWeek(row.key)
      const existing = groups.get(weekStart)
      if (existing) {
        existing.amount += row.amount
        existing.end = row.key
        existing.period = weekPeriodLabel(weekStart, row.key)
      } else {
        groups.set(weekStart, {
          key: weekStart,
          start: weekStart,
          end: row.key,
          period: weekPeriodLabel(weekStart, row.key),
          amount: row.amount,
        })
      }
    }
    return [...groups.values()]
  }

  const months = new Map<string, TrendChartRow>()
  for (const row of occurred) {
    const month = row.key.slice(0, 7)
    const existing = months.get(month)
    if (existing) {
      existing.amount += row.amount
      existing.end = row.key
    } else {
      months.set(month, {
        key: month,
        start: row.key,
        end: row.key,
        period: dayjs(`${month}-01`).format("M月"),
        amount: row.amount,
      })
    }
  }
  return [...months.values()]
}

function trendGranularity(rows: TrendChartRow[]) {
  if (rows.some((row) => row.start && row.end && row.start !== row.end))
    return "按周"
  if (rows.some((row) => row.key.length === 7)) return "按月"
  return "按日"
}

function trendPeriodQuery(row: TrendChartRow) {
  if (row.start && row.end && row.start !== row.end)
    return `start=${row.start}&end=${row.end}`
  if (row.key.length === 7) return `month=${row.key}`
  return `date=${row.key}`
}

function trendPeriodActionLabel(row: TrendChartRow) {
  if (row.start && row.end && row.start !== row.end) return "查看这周账目"
  if (row.key.length === 7) return "查看当月账目"
  return "查看当日账目"
}

function niceAxisMax(value: number) {
  if (value <= 0) return 100
  if (value <= 100) return Math.ceil(value / 20) * 20
  if (value <= 1000) return Math.ceil(value / 100) * 100
  return Math.ceil(value / 1000) * 1000
}

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  const pickerInputReadOnly = usePickerInputReadOnly()
  const [customMode, setCustomMode] = useState(false)
  const [mobileRangeDraft, setMobileRangeDraft] = useState<
    [string, string] | null
  >(null)
  const [selectedTrendKey, setSelectedTrendKey] = useState("")
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
    if (!params.toString()) {
      const savedScope = readAnalyticsScope()
      const savedAnchor = readAnalyticsAnchor()
      if (savedScope || savedAnchor) {
        const next = new URLSearchParams()
        if (savedScope) next.set("scope", savedScope)
        if (savedAnchor) next.set("anchor", savedAnchor)
        setParams(next, { replace: true })
      }
      return
    }
    const currentScope = params.get("scope")
    if (isAnalyticsScope(currentScope)) writeAnalyticsScope(currentScope)
    if (params.get("start") && params.get("end")) return
    writeAnalyticsAnchor(params.get("anchor") || "")
  }, [params, setParams])
  useEffect(() => {
    setSelectedTrendKey("")
  }, [scope, anchor, customRange?.[0], customRange?.[1]])
  const setScope = (value: Scope) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set("scope", value)
      next.delete("start")
      next.delete("end")
      if (!current.get("anchor")) {
        next.set("anchor", dayjs().format("YYYY-MM-DD"))
      }
      return next
    })
    setCustomMode(false)
  }
  const setAnchor = (value: string) => setParam("anchor", value)
  const goToCurrentPeriod = () => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.delete("start")
      next.delete("end")
      next.set("anchor", dayjs().format("YYYY-MM-DD"))
      return next
    })
    setCustomMode(false)
  }
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
  const comparisonRows =
    customData?.comparisonBreakdown || data.comparisonBreakdowns[scope] || []
  const rawChartData: TrendChartRow[] = trendRows.map((row: any) => ({
    key: row.key,
    period: row.label,
    amount: row.amount,
  }))
  const chartData = mobileTrendRows(rawChartData)
  const selectedTrend =
    chartData.find((row) => row.key === selectedTrendKey) ||
    (chartData.length === 1 ? chartData[0] : null)
  const mobileTrendGranularity = trendGranularity(chartData)
  const requestedCategory = params.get("focusCategory") || ""
  const focusedCategory = primaryRows.some(
    (row) => row.category === requestedCategory,
  )
    ? requestedCategory
    : ""
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
  const openRangeTransactions = () =>
    navigate(`/transactions?${rangeTransactionsQuery(activeRange)}`)
  const showJumpToCurrent =
    Boolean(customRange) || !isCurrentPeriod(selected, scope)
  const jumpToCurrentLabel = currentPeriodLabel(scope)
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
      inputReadOnly={pickerInputReadOnly}
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
      inputReadOnly={pickerInputReadOnly}
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
            inputReadOnly={pickerInputReadOnly}
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
            inputReadOnly={pickerInputReadOnly}
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
              {showJumpToCurrent && (
                <Button onClick={goToCurrentPeriod}>{jumpToCurrentLabel}</Button>
              )}
              <Button
                type={customMode || customRange ? "primary" : "default"}
                onClick={toggleCustom}
              >
                {customRange ? "退出自定义" : "自定义范围"}
              </Button>
            </Space>
            <Flex vertical align="flex-end" gap={2}>
              <Typography.Text type="secondary">当前统计周期</Typography.Text>
              <Typography.Text strong>{currentRange}</Typography.Text>
              <Button
                type="link"
                className="analytics-range-ledger-link"
                onClick={openRangeTransactions}
              >
                查看账目 <ArrowRightOutlined />
              </Button>
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
              align="start"
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
                <Button
                  type="link"
                  className="analytics-range-ledger-link"
                  onClick={openRangeTransactions}
                >
                  查看账目 <ArrowRightOutlined />
                </Button>
              </Flex>
              <Space size={4}>
                {showJumpToCurrent && (
                  <Button type="link" onClick={goToCurrentPeriod}>
                    {jumpToCurrentLabel}
                  </Button>
                )}
                <Button
                  type="link"
                  icon={<CalendarOutlined />}
                  onClick={toggleCustom}
                >
                  {customRange ? "退出" : "自定义"}
                </Button>
              </Space>
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
      <ExpenseCategoryOverview
        rows={primaryRows}
        secondaryRows={secondaryRows}
        expense={activeFlow.expense}
        income={activeFlow.income}
        balance={activeFlow.balance}
        selectedCategory={focusedCategory}
        budgetUsageRate={
          !customRange && scope === "month" ? data.budget?.usageRate : undefined
        }
        onSelectedCategoryChange={(category) =>
          setParam("focusCategory", category)
        }
        onOpenPrimary={(category) =>
          navigate(
            `/transactions?start=${activeRange[0]}&end=${activeRange[1]}&category1=${encodeURIComponent(category)}`,
          )
        }
        onOpenSecondary={(parent, category) =>
          navigate(
            `/transactions?start=${activeRange[0]}&end=${activeRange[1]}&category1=${encodeURIComponent(parent)}&category2=${encodeURIComponent(category)}`,
          )
        }
      />
      {(customRange || scope !== "day") && chartData.length > 1 && (
        <Card
          title="支出趋势"
          extra={
            <Typography.Text type="secondary">
              {!screens.md
                ? `当前范围${mobileTrendGranularity}`
                : customData
                  ? customData.days > 120
                    ? "自定义范围按月"
                    : "自定义范围按日"
                  : scope === "year"
                    ? "本年按月"
                    : "当前范围按日"}
            </Typography.Text>
          }
        >
          <div className="analytics-trend-chart">
            <MobileTrendChart
              rows={chartData}
              selectedKey={selectedTrend?.key || ""}
              desktop={Boolean(screens.md)}
              onSelect={setSelectedTrendKey}
            />
          </div>
          {selectedTrend ? (
            <TrendPeriodAction
              row={selectedTrend}
              onOpen={(row) =>
                navigate(
                  `/transactions?${trendPeriodQuery(row)}&direction=expense`,
                )
              }
            />
          ) : (
            <ChartSummary rows={chartData} />
          )}
        </Card>
      )}
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
          title="支出排行"
          extra={
            <Typography.Text type="secondary">{currentRange}</Typography.Text>
          }
        >
          {largeError ? (
            <ErrorState
              message="支出排行加载失败"
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
    </div>
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
      {money(peak.amount)}。点柱子可查看对应账目。
    </Typography.Text>
  )
}

function mobileTrendAxisLabel(row: TrendChartRow) {
  if (row.key.length === 10) return String(Number(row.key.slice(8)))
  return row.period
}

function MobileTrendChart({
  rows,
  selectedKey,
  desktop = false,
  onSelect,
}: {
  rows: TrendChartRow[]
  selectedKey: string
  desktop?: boolean
  onSelect: (key: string) => void
}) {
  const max = niceAxisMax(Math.max(0, ...rows.map((row) => row.amount)))
  const ticks = [0, 1, 2, 3, 4].map((step) => (max / 4) * step)
  return (
    <div className={`mobile-trend-chart${desktop ? " is-desktop" : ""}`}>
      <div className="mobile-trend-plot">
        <div className="mobile-trend-y" aria-hidden="true">
          {[...ticks].reverse().map((tick) => (
            <span key={tick}>{compactMoney(tick)}</span>
          ))}
        </div>
        <div className="mobile-trend-grid">
          {ticks.map((tick) => (
            <i key={tick} />
          ))}
          <div
            className="mobile-trend-cols"
            style={{
              gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`,
            }}
          >
            {rows.map((row) => {
              const selected = row.key === selectedKey
              const height = max ? (row.amount / max) * 100 : 0
              return (
                <button
                  type="button"
                  key={row.key}
                  className={selected ? "is-selected" : undefined}
                  aria-pressed={selected}
                  aria-label={`${row.period} 支出 ${money(row.amount)}`}
                  onClick={() => onSelect(row.key)}
                >
                  <span
                    className="mobile-trend-bar"
                    style={{
                      height: `${height}%`,
                    }}
                  />
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="mobile-trend-x">
        <span className="mobile-trend-x-spacer" />
        <div
          className="mobile-trend-x-labels"
          style={{
            gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`,
          }}
        >
          {rows.map((row) => (
            <span key={row.key}>{mobileTrendAxisLabel(row)}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function TrendPeriodAction({
  row,
  onOpen,
}: {
  row: TrendChartRow
  onOpen: (row: TrendChartRow) => void
}) {
  return (
    <div className="trend-period-action">
      <div>
        <span>{row.period} 支出</span>
        <strong>{money(row.amount)}</strong>
      </div>
      <Button
        type="link"
        icon={<ArrowRightOutlined />}
        iconPosition="end"
        onClick={() => onOpen(row)}
      >
        {trendPeriodActionLabel(row)}
      </Button>
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
