import { Progress, Typography } from "antd";
import type { Breakdown } from "@/lib/api";
import { money } from "@/lib/utils";

type CategoryBreakdownBarsProps = {
  rows: Breakdown[];
  limit?: number;
  onCategoryClick?: (row: Breakdown) => void;
};

type DisplayRow = Breakdown & { label: string; isOther?: boolean };

export function CategoryBreakdownBars({ rows, limit = 5, onCategoryClick }: CategoryBreakdownBarsProps) {
  const source = rows
    .filter((row) => row.amount > 0)
    .map((row) => ({ ...row, label: row.parent ? `${row.parent} / ${row.category}` : row.category }))
    .sort((a, b) => b.amount - a.amount);
  const visible = source.slice(0, limit);
  const remainder = source.slice(limit);
  const total = source.reduce((sum, row) => sum + row.amount, 0);
  const displayRows: DisplayRow[] = remainder.length
    ? [...visible, { category: "其他", amount: remainder.reduce((sum, row) => sum + row.amount, 0), share: total ? remainder.reduce((sum, row) => sum + row.amount, 0) / total : 0, label: "其他", isOther: true }]
    : visible;

  if (!displayRows.length) return null;

  return <ul className="category-breakdown-bars" aria-label="分类支出排行">
    {displayRows.map((row, index) => {
      const content = <>
        <div className="category-breakdown-row-head">
          <Typography.Text strong className="category-breakdown-label" ellipsis={{ tooltip: row.label }}>{row.label}</Typography.Text>
          <div className="category-breakdown-values">
            <Typography.Text strong className="category-breakdown-amount">{money(row.amount)}</Typography.Text>
            <Typography.Text type="secondary" className="category-breakdown-share">{(row.share * 100).toFixed(1)}%</Typography.Text>
          </div>
        </div>
        <Progress className="category-breakdown-progress" percent={Number((row.share * 100).toFixed(1))} showInfo={false} strokeColor={index === 0 ? "#176b62" : row.isOther ? "#a9bbb4" : "#6d8f78"} trailColor="#e4eae5" size="small" />
      </>;

      if (onCategoryClick && !row.isOther) {
        return <li key={`${row.parent || "root"}-${row.category}`}><button type="button" className="category-breakdown-row category-breakdown-row-button" onClick={() => onCategoryClick(row)} aria-label={`查看${row.label}账目`}>{content}</button></li>;
      }
      return <li key={`${row.parent || "root"}-${row.category}`} className="category-breakdown-row">{content}</li>;
    })}
  </ul>;
}
