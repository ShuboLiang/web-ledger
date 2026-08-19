import { ArrowRightOutlined } from "@ant-design/icons"
import { Button, Card, Empty, Typography } from "antd"
import type { KeyboardEvent } from "react"
import type { Breakdown } from "@/lib/api"
import { money } from "@/lib/utils"
import { CategoryIcon } from "@/components/category-icon"

type DisplayRow = Breakdown & {
  color: string
  isOther?: boolean
}

type ChartRow = DisplayRow & {
  start: number
  angle: number
  labelX: number
  labelY: number
  lineEndX: number
  side: "left" | "right"
}

type ExpenseCategoryOverviewProps = {
  rows: Breakdown[]
  secondaryRows: Breakdown[]
  expense: number
  income: number
  balance: number
  selectedCategory: string
  budgetUsageRate?: number
  onSelectedCategoryChange: (category: string) => void
  onOpenPrimary: (category: string) => void
  onOpenSecondary: (parent: string, category: string) => void
}

const categoryColors = [
  "#176b62",
  "#4d8a78",
  "#7da78a",
  "#c99748",
  "#d77b4e",
  "#a9bbb4",
]

function displayRows(rows: Breakdown[]): DisplayRow[] {
  const source = rows
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const visible = source.slice(0, 5)
  const remainder = source.slice(5)
  const total = source.reduce((sum, row) => sum + row.amount, 0)
  const result: Array<Breakdown & { isOther?: boolean }> = [...visible]

  if (remainder.length) {
    const amount = remainder.reduce((sum, row) => sum + row.amount, 0)
    result.push({
      category: "其他",
      amount,
      share: total ? amount / total : 0,
      isOther: true,
    })
  }

  return result.map((row, index) => ({
    ...row,
    color: categoryColors[index % categoryColors.length],
  }))
}

function chartRows(rows: DisplayRow[]): ChartRow[] {
  let offset = 0
  const source = rows.map((row) => {
    const start = offset
    const angle = ((start + row.share * 50) / 100) * Math.PI * 2 - Math.PI / 2
    offset += row.share * 100
    const side: ChartRow["side"] = Math.cos(angle) >= 0 ? "right" : "left"
    return {
      ...row,
      start,
      angle,
      side,
      labelX: side === "right" ? 252 : -32,
      labelY: 110 + Math.sin(angle) * 108,
      lineEndX: side === "right" ? 242 : -22,
    }
  })

  for (const side of ["left", "right"] as const) {
    const labels = source
      .filter((row) => row.side === side)
      .sort((a, b) => a.labelY - b.labelY)
    const minY = 18
    const maxY = 196
    const gap = 27

    labels.forEach((row, index) => {
      row.labelY = Math.max(
        minY,
        index ? labels[index - 1].labelY + gap : row.labelY,
      )
    })
    if (labels.length && labels[labels.length - 1].labelY > maxY) {
      labels[labels.length - 1].labelY = maxY
      for (let index = labels.length - 2; index >= 0; index -= 1) {
        labels[index].labelY = Math.min(
          labels[index].labelY,
          labels[index + 1].labelY - gap,
        )
      }
    }
  }

  return source
}

function activateWithKeyboard(
  event: KeyboardEvent<SVGCircleElement>,
  activate: () => void,
) {
  if (event.key !== "Enter" && event.key !== " ") return
  event.preventDefault()
  activate()
}

export function ExpenseCategoryOverview({
  rows,
  secondaryRows,
  expense,
  income,
  balance,
  selectedCategory,
  budgetUsageRate,
  onSelectedCategoryChange,
  onOpenPrimary,
  onOpenSecondary,
}: ExpenseCategoryOverviewProps) {
  const categories = displayRows(rows)
  const selected =
    categories.find((row) => row.category === selectedCategory) || null
  const focusedSecondary = selected
    ? secondaryRows
        .filter((row) => row.parent === selected.category)
        .sort((a, b) => b.amount - a.amount)
    : []
  const secondaryTotal = focusedSecondary.reduce(
    (sum, row) => sum + row.amount,
    0,
  )
  const budgetValue =
    budgetUsageRate == null ? null : Math.max(0, budgetUsageRate * 100)
  const budgetArcPercent =
    budgetValue == null ? null : Math.min(100, budgetValue)
  const chartCategories = chartRows(categories)

  return (
    <Card
      className="expense-structure-card"
      title={<Typography.Title level={4}>分类结构总览</Typography.Title>}
    >
      <div className="expense-structure-summary" aria-label="周期收支摘要">
        <div className="expense-structure-metric expense">
          <span>周期支出</span>
          <strong>{money(expense)}</strong>
        </div>
        <div className="expense-structure-metric income">
          <span>周期收入</span>
          <strong>{money(income)}</strong>
        </div>
        <div className="expense-structure-metric balance">
          <span>净结余</span>
          <strong className={balance < 0 ? "negative" : "positive"}>
            {money(balance)}
          </strong>
        </div>
      </div>

      {categories.length ? (
        <>
          <div className="expense-structure-main">
            <figure className="expense-donut-figure">
              <div className="expense-donut-wrap">
                <svg
                  className="expense-donut"
                  viewBox="-70 -15 360 250"
                  role="group"
                  aria-label="支出分类环形图"
                >
                  <title>支出分类结构</title>
                  <circle
                    className="expense-donut-track"
                    cx="110"
                    cy="110"
                    r="78"
                    pathLength="100"
                  />
                  {chartCategories.map((row) => {
                    const segment = Math.max(row.share * 100 - 0.7, 0.35)
                    const active = selected?.category === row.category
                    const muted = Boolean(selected && !active)
                    const selectRow = () =>
                      !row.isOther &&
                      onSelectedCategoryChange(active ? "" : row.category)
                    return (
                      <circle
                        key={row.category}
                        className={`expense-donut-segment${active ? " active" : ""}${muted ? " muted" : ""}${row.isOther ? " is-other" : ""}`}
                        cx="110"
                        cy="110"
                        r="78"
                        pathLength="100"
                        stroke={row.color}
                        strokeDasharray={`${segment} ${100 - segment}`}
                        strokeDashoffset={-row.start}
                        role={row.isOther ? undefined : "button"}
                        tabIndex={row.isOther ? undefined : 0}
                        aria-label={
                          row.isOther
                            ? `其他分类，占 ${(row.share * 100).toFixed(1)}%`
                            : `${row.category}，${money(row.amount)}，占 ${(row.share * 100).toFixed(1)}%`
                        }
                        onClick={selectRow}
                        onKeyDown={(event) =>
                          activateWithKeyboard(event, selectRow)
                        }
                      />
                    )
                  })}
                  {budgetArcPercent != null && (
                    <>
                      <circle
                        className="expense-budget-track"
                        cx="110"
                        cy="110"
                        r="57"
                        pathLength="100"
                      />
                      <circle
                        className={`expense-budget-progress${budgetValue != null && budgetValue > 100 ? " over" : ""}`}
                        cx="110"
                        cy="110"
                        r="57"
                        pathLength="100"
                        strokeDasharray={`${budgetArcPercent} ${100 - budgetArcPercent}`}
                      />
                    </>
                  )}
                  <g className="expense-donut-labels" aria-hidden="true">
                    {chartCategories.map((row) => {
                      const active = selected?.category === row.category
                      const muted = Boolean(selected && !active)
                      const startX = 110 + Math.cos(row.angle) * 94
                      const startY = 110 + Math.sin(row.angle) * 94
                      const bendX = 110 + Math.cos(row.angle) * 108
                      const bendY = 110 + Math.sin(row.angle) * 108
                      return (
                        <g
                          key={`label-${row.category}`}
                          className={`expense-donut-label${active ? " active" : ""}${muted ? " muted" : ""}${row.isOther ? " is-other" : ""}`}
                          onClick={() =>
                            !row.isOther &&
                            onSelectedCategoryChange(active ? "" : row.category)
                          }
                        >
                          <path
                            d={`M ${startX} ${startY} L ${bendX} ${bendY} L ${row.lineEndX} ${row.labelY}`}
                            stroke={row.color}
                          />
                          <circle
                            cx={startX}
                            cy={startY}
                            r="2.2"
                            fill={row.color}
                          />
                          <text
                            x={row.labelX}
                            y={row.labelY - 2}
                            textAnchor={row.side === "right" ? "start" : "end"}
                          >
                            <tspan className="expense-donut-label-name">
                              {row.category}
                            </tspan>
                            <tspan
                              className="expense-donut-label-share"
                              x={row.labelX}
                              dy="12"
                            >
                              {(row.share * 100).toFixed(1)}%
                            </tspan>
                          </text>
                        </g>
                      )
                    })}
                  </g>
                </svg>
                <div className="expense-donut-center" aria-live="polite">
                  <span>{selected ? selected.category : "周期支出"}</span>
                  <strong>{money(selected ? selected.amount : expense)}</strong>
                  <small>
                    {selected
                      ? `占 ${(selected.share * 100).toFixed(1)}%`
                      : `${categories.length} 个分类`}
                  </small>
                </div>
              </div>
              <figcaption>
                {budgetValue != null ? (
                  <span className="expense-budget-caption">
                    <i
                      className={budgetValue > 100 ? "over" : ""}
                      aria-hidden="true"
                    />
                    内环为预算使用 {budgetValue.toFixed(1)}%
                  </span>
                ) : (
                  "选择一个分类查看二级明细"
                )}
              </figcaption>
            </figure>

            <div className="expense-category-ledger">
              <div className="expense-category-ledger-head">
                <div>
                  <Typography.Text strong>支出大类</Typography.Text>
                  <Typography.Text type="secondary">金额与占比</Typography.Text>
                </div>
                <Typography.Text type="secondary">
                  共 {rows.filter((row) => row.amount > 0).length} 类
                </Typography.Text>
              </div>
              <ul>
                {categories.map((row) => {
                  const active = selected?.category === row.category
                  const content = (
                    <>
                      <span
                        className="expense-category-color"
                        style={{ backgroundColor: row.color }}
                        aria-hidden="true"
                      />
                      <CategoryIcon
                        name={row.isOther ? "folder" : row.icon}
                        size="small"
                      />
                      <span className="expense-category-copy">
                        <span className="expense-category-name">
                          {row.category}
                        </span>
                        <span
                          className="expense-category-bar"
                          aria-hidden="true"
                        >
                          <i
                            style={{
                              width: `${Math.max(row.share * 100, 2)}%`,
                              backgroundColor: row.color,
                            }}
                          />
                        </span>
                      </span>
                      <span className="expense-category-values">
                        <strong>{money(row.amount)}</strong>
                        <small>{(row.share * 100).toFixed(1)}%</small>
                      </span>
                      {!row.isOther && (
                        <ArrowRightOutlined aria-hidden="true" />
                      )}
                    </>
                  )
                  return (
                    <li key={row.category}>
                      {row.isOther ? (
                        <div className="expense-category-row is-other">
                          {content}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`expense-category-row${active ? " active" : ""}`}
                          aria-pressed={active}
                          onClick={() =>
                            onSelectedCategoryChange(active ? "" : row.category)
                          }
                        >
                          {content}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>

          {selected && !selected.isOther && (
            <section
              className="expense-structure-drilldown"
              aria-label={`${selected.category}二级分类`}
            >
              <div className="expense-drilldown-head">
                <div>
                  <Typography.Text type="secondary">当前分类</Typography.Text>
                  <Typography.Title level={5}>
                    {selected.category} · 二级分类
                  </Typography.Title>
                </div>
                <Button
                  type="link"
                  onClick={() => onOpenPrimary(selected.category)}
                >
                  查看全部账目
                </Button>
              </div>
              {focusedSecondary.length ? (
                <div className="expense-secondary-grid">
                  {focusedSecondary.slice(0, 6).map((row) => {
                    const share = secondaryTotal
                      ? (row.amount / secondaryTotal) * 100
                      : 0
                    return (
                      <button
                        key={`${row.parent}-${row.category}`}
                        type="button"
                        className="expense-secondary-row"
                        onClick={() =>
                          onOpenSecondary(selected.category, row.category)
                        }
                      >
                        <CategoryIcon name={row.icon} size="small" />
                        <span>
                          <strong>{row.category}</strong>
                          <small>{share.toFixed(1)}%</small>
                        </span>
                        <b>{money(row.amount)}</b>
                        <ArrowRightOutlined aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="该分类暂无二级分类，可直接查看全部账目"
                />
              )}
            </section>
          )}
        </>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前范围没有支出，记一笔后即可查看分类结构"
        />
      )}
    </Card>
  )
}
