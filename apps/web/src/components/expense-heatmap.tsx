import { Flex, Typography } from "antd"
import dayjs from "dayjs"
import { money } from "@/lib/utils"

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"]

export function expenseLevel(amount: number, thresholds: number[]) {
  if (!amount) return 0
  if (amount <= thresholds[0]) return 1
  if (amount <= thresholds[1]) return 2
  if (amount <= thresholds[2]) return 3
  return 4
}

export function expenseThresholds(amounts: Iterable<number>) {
  const values = [...amounts].filter((amount) => amount > 0).sort((a, b) => a - b)
  const at = (ratio: number) =>
    values.length
      ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))]
      : 0
  return [at(0.25), at(0.5), at(0.75)]
}

export function ExpenseLegend({ thresholds }: { thresholds: number[] }) {
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

export function ExpenseMonth({
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
