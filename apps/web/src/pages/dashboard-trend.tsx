import { Line } from "@ant-design/plots"
import { compactMoney } from "@/lib/utils"

export function DashboardTrend({
  data,
}: {
  data: { key: string; label: string; amount: number }[]
}) {
  const config: any = {
    data,
    xField: "label",
    yField: "amount",
    height: 260,
    smooth: true,
    autoFit: true,
    paddingTop: 30,
    paddingRight: 64,
    style: { lineWidth: 2.5, stroke: "#2a8277" },
    label: {
      text: (row: { amount: number }) =>
        row.amount ? compactMoney(row.amount) : "",
      position: "top",
      dy: -8,
      fontSize: 11,
      fill: "#56635e",
      transform: [{ type: "overlapHide" }],
    },
    axis: {
      x: { tick: false },
      y: {
        labelFormatter: (value: number) => compactMoney(value),
        gridStroke: "#e3e9e4",
      },
    },
    tooltip: false,
    interaction: { tooltip: false },
  }

  return <Line {...config} />
}
