import { CalendarOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons"
import { Button, Calendar, DatePicker as AntDatePicker, Drawer, Flex } from "antd"
import type { DatePickerProps } from "antd"
import type { Dayjs } from "dayjs"
import dayjs from "dayjs"
import { useMemo, useState } from "react"
import { useIsMobileViewport } from "@/lib/use-viewport"

type PickerKind = NonNullable<DatePickerProps["picker"]>

function pickerTitle(picker: PickerKind) {
  if (picker === "month") return "选择月份"
  if (picker === "year") return "选择年份"
  if (picker === "week") return "选择周"
  return "选择日期"
}

function displayText(value: Dayjs | null | undefined, format: DatePickerProps["format"]) {
  if (!value) return ""
  if (typeof format === "string") return value.format(format)
  return value.format("YYYY年M月D日")
}

function isDisabled(date: Dayjs, minDate?: Dayjs, maxDate?: Dayjs) {
  if (minDate && date.isBefore(minDate, "day")) return true
  if (maxDate && date.isAfter(maxDate, "day")) return true
  return false
}

function MonthGrid({
  value,
  minDate,
  maxDate,
  onSelect,
}: {
  value?: Dayjs | null
  minDate?: Dayjs
  maxDate?: Dayjs
  onSelect: (value: Dayjs) => void
}) {
  const [year, setYear] = useState(value?.year() || dayjs().year())
  return (
    <div className="mobile-date-grid-wrap">
      <Flex align="center" justify="space-between" className="mobile-date-grid-nav">
        <Button
          type="text"
          icon={<LeftOutlined />}
          aria-label="上一年"
          onClick={() => setYear((current) => current - 1)}
        />
        <strong>{year}年</strong>
        <Button
          type="text"
          icon={<RightOutlined />}
          aria-label="下一年"
          onClick={() => setYear((current) => current + 1)}
        />
      </Flex>
      <div className="mobile-date-grid">
        {Array.from({ length: 12 }, (_, index) => {
          const month = index + 1
          const date = dayjs(`${year}-${String(month).padStart(2, "0")}-01`)
          const selected = Boolean(value && value.isSame(date, "month"))
          return (
            <button
              key={month}
              type="button"
              className={selected ? "is-selected" : undefined}
              disabled={
                (minDate && date.endOf("month").isBefore(minDate, "day")) ||
                (maxDate && date.startOf("month").isAfter(maxDate, "day"))
              }
              onClick={() => onSelect(date)}
            >
              {month}月
            </button>
          )
        })}
      </div>
    </div>
  )
}

function YearGrid({
  value,
  minDate,
  maxDate,
  onSelect,
}: {
  value?: Dayjs | null
  minDate?: Dayjs
  maxDate?: Dayjs
  onSelect: (value: Dayjs) => void
}) {
  const selectedYear = value?.year() || dayjs().year()
  const [startYear, setStartYear] = useState(Math.floor(selectedYear / 12) * 12)
  const years = useMemo(
    () => Array.from({ length: 12 }, (_, index) => startYear + index),
    [startYear],
  )
  return (
    <div className="mobile-date-grid-wrap">
      <Flex align="center" justify="space-between" className="mobile-date-grid-nav">
        <Button
          type="text"
          icon={<LeftOutlined />}
          aria-label="上一组年份"
          onClick={() => setStartYear((current) => current - 12)}
        />
        <strong>
          {years[0]}–{years[years.length - 1]}
        </strong>
        <Button
          type="text"
          icon={<RightOutlined />}
          aria-label="下一组年份"
          onClick={() => setStartYear((current) => current + 12)}
        />
      </Flex>
      <div className="mobile-date-grid">
        {years.map((year) => {
          const date = dayjs(`${year}-01-01`)
          const selected = Boolean(value && value.isSame(date, "year"))
          return (
            <button
              key={year}
              type="button"
              className={selected ? "is-selected" : undefined}
              disabled={
                (minDate && date.endOf("year").isBefore(minDate, "day")) ||
                (maxDate && date.startOf("year").isAfter(maxDate, "day"))
              }
              onClick={() => onSelect(date)}
            >
              {year}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MobileDateSheet(props: DatePickerProps) {
  const {
    value,
    onChange,
    picker = "date",
    format,
    allowClear = true,
    disabled,
    placeholder = "选择日期",
    minDate,
    maxDate,
    className,
    style,
    disabledDate,
  } = props
  const [open, setOpen] = useState(false)
  const current = value || null

  const confirm = (next: Dayjs | null) => {
    const dateString = next ? displayText(next, format) : ""
    onChange?.(next, dateString)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className={`mobile-date-trigger ${className || ""}`.trim()}
        style={style}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <span className={current ? undefined : "is-placeholder"}>
          {current ? displayText(current, format) : placeholder}
        </span>
        <CalendarOutlined />
      </button>
      <Drawer
        className="mobile-date-sheet"
        title={pickerTitle(picker)}
        placement="bottom"
        height="auto"
        open={open}
        onClose={() => setOpen(false)}
        destroyOnHidden
      >
        {picker === "month" ? (
          <MonthGrid
            value={current}
            minDate={minDate}
            maxDate={maxDate}
            onSelect={confirm}
          />
        ) : picker === "year" ? (
          <YearGrid
            value={current}
            minDate={minDate}
            maxDate={maxDate}
            onSelect={confirm}
          />
        ) : (
          <Calendar
            fullscreen={false}
            value={current || undefined}
            disabledDate={(date) =>
              Boolean(disabledDate?.(date) || isDisabled(date, minDate, maxDate))
            }
            onSelect={(date, info) => {
              if (info?.source && info.source !== "date") return
              confirm(date)
            }}
          />
        )}
        {allowClear && current && (
          <Button block onClick={() => confirm(null)}>
            清除
          </Button>
        )}
      </Drawer>
    </>
  )
}

export function DatePicker(props: DatePickerProps) {
  const mobile = useIsMobileViewport()
  if (!mobile) return <AntDatePicker {...props} />
  return <MobileDateSheet {...props} />
}

DatePicker.RangePicker = AntDatePicker.RangePicker
