import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons"
import { useQuery } from "@tanstack/react-query"
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Drawer,
  Empty,
  Flex,
  Grid,
  List,
  Skeleton,
  Statistic,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { CategoryIcon } from "@/components/category-icon"
import {
  ExpenseLegend,
  ExpenseMonth,
  expenseThresholds,
} from "@/components/expense-heatmap"
import { api, type Transaction } from "@/lib/api"
import { money } from "@/lib/utils"

type TransactionPage = { records: Transaction[]; total: number }

export function HeatmapPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  const [selectedDate, setSelectedDate] = useState("")
  const month = params.get("month") || dayjs().format("YYYY-MM")
  const monthStart = `${month}-01`
  const monthEnd = dayjs(monthStart).endOf("month").format("YYYY-MM-DD")
  const previousMonth = dayjs(monthStart).subtract(1, "month").format("YYYY-MM")
  const nextMonth = dayjs(monthStart).add(1, "month").format("YYYY-MM")
  const canGoNext = nextMonth <= dayjs().format("YYYY-MM")
  const setMonth = (value: string) =>
    setParams(value === dayjs().format("YYYY-MM") ? {} : { month: value }, {
      replace: true,
    })
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ["expense-calendar", monthStart, monthEnd],
    queryFn: () =>
      api<{ series: { key: string; amount: number }[] }>(
        `/api/dashboard/range?start=${monthStart}&end=${monthEnd}`,
      ),
  })
  const amounts = useMemo(
    () => new Map((data?.series || []).map((row) => [row.key, row.amount])),
    [data?.series],
  )
  const thresholds = useMemo(
    () => expenseThresholds(amounts.values()),
    [amounts],
  )
  const monthTotal = useMemo(
    () => [...amounts.values()].reduce((sum, amount) => sum + amount, 0),
    [amounts],
  )
  const spentDays = useMemo(
    () => [...amounts.values()].filter((amount) => amount > 0).length,
    [amounts],
  )
  const { data: dayPage, isFetching: dayLoading } = useQuery({
    queryKey: ["heat-day", selectedDate],
    enabled: Boolean(selectedDate),
    queryFn: () =>
      api<TransactionPage>(
        `/api/transactions?date=${selectedDate}&direction=expense&page=1&pageSize=100`,
      ),
  })
  return (
    <div className="page-stack heatmap-page">
      <Card className="expense-calendar-card">
        <div className="expense-calendar-layout">
          <aside className="expense-calendar-side">
            <Typography.Text className="expense-calendar-eyebrow">
              按月查看
            </Typography.Text>
            <Typography.Title level={4}>
              {dayjs(monthStart).format("YYYY年M月")}
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              颜色越深当天花得越多。点日期查看当天账目。
            </Typography.Paragraph>
            <div className="heatmap-month-stats">
              <div>
                <span>本月支出</span>
                <strong>{money(monthTotal)}</strong>
              </div>
              <div>
                <span>有支出天数</span>
                <strong>{spentDays} 天</strong>
              </div>
            </div>
            <div className="expense-calendar-controls">
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => setMonth(previousMonth)}
                aria-label="上一个月"
              />
              <DatePicker
                picker="month"
                allowClear={false}
                format="YYYY年M月"
                value={dayjs(monthStart)}
                disabledDate={(value) => value.format("YYYY-MM") > dayjs().format("YYYY-MM")}
                onChange={(value) =>
                  value && setMonth(value.format("YYYY-MM"))
                }
              />
              <Button
                icon={<ArrowRightOutlined />}
                disabled={!canGoNext}
                onClick={() => setMonth(nextMonth)}
                aria-label="下一个月"
              />
            </div>
            <ExpenseLegend thresholds={thresholds} />
          </aside>
          <div
            className={`expense-calendar-pane${isFetching ? " loading" : ""}`}
          >
            {isError ? (
              <Alert
                type="error"
                showIcon
                message="热力图加载失败"
                action={
                  <Button size="small" onClick={() => refetch()}>
                    重试
                  </Button>
                }
              />
            ) : !data && isFetching ? (
              <Skeleton active paragraph={{ rows: 8 }} />
            ) : (
              <ExpenseMonth
                year={Number(month.slice(0, 4))}
                month={Number(month.slice(5, 7)) - 1}
                amounts={amounts}
                thresholds={thresholds}
                onSelect={setSelectedDate}
                mobile
              />
            )}
          </div>
        </div>
      </Card>
      <Drawer
        className="expense-day-drawer"
        title={
          selectedDate ? dayjs(selectedDate).format("M月D日") : "当天支出"
        }
        placement={screens.md ? "right" : "bottom"}
        height={screens.md ? undefined : "72vh"}
        open={Boolean(selectedDate)}
        onClose={() => setSelectedDate("")}
        destroyOnHidden
      >
        <Statistic
          title="当天支出"
          value={amounts.get(selectedDate) || 0}
          precision={2}
          prefix="¥"
        />
        {dayPage && dayPage.total > dayPage.records.length && (
          <Alert
            type="info"
            showIcon
            message={`当天共 ${dayPage.total} 笔，当前显示前 ${dayPage.records.length} 笔`}
          />
        )}
        <List
          className="expense-day-list"
          loading={dayLoading}
          dataSource={dayPage?.records || []}
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
                description={
                  <span className="transaction-mobile-description">
                    <CategoryIcon name={row.secondaryIcon} size="small" />
                    <span>
                      {row.category1} / {row.category2}
                      {row.note ? ` · ${row.note}` : ""}
                    </span>
                  </span>
                }
              />
            </List.Item>
          )}
        />
        {selectedDate && (
          <Flex justify="flex-end" style={{ marginTop: 12 }}>
            <Button
              type="primary"
              onClick={() =>
                navigate(
                  `/transactions?date=${selectedDate}&direction=expense`,
                )
              }
            >
              查看当日账目
            </Button>
          </Flex>
        )}
      </Drawer>
    </div>
  )
}
