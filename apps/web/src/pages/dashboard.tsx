import {
  ArrowRightOutlined,
  FileDoneOutlined,
  RobotOutlined,
} from "@ant-design/icons"
import { Line } from "@ant-design/plots"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  App,
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Input,
  List,
  Modal,
  Progress,
  Row,
  Skeleton,
  Statistic,
  Tag,
  Typography,
} from "antd"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  api,
  type Dashboard,
  type DashboardBudget,
  type Transaction,
} from "@/lib/api"
import { useQuickStore, type QuickResult } from "@/lib/quick-store"
import { compactMoney, money } from "@/lib/utils"
import { analyticsPath } from "@/lib/analytics-scope"
import { CategoryBreakdownBars } from "@/components/category-breakdown-bars"
import { CategoryIcon } from "@/components/category-icon"

export function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const [quickText, setQuickText] = useState("")
  const [quickModalOpen, setQuickModalOpen] = useState(false)
  const [quickModalData, setQuickModalData] = useState<QuickResult | null>(null)
  const quickPending = useQuickStore((state) => state.pending)
  const quickResult = useQuickStore((state) => state.result)
  const quickError = useQuickStore((state) => state.error)
  const runQuick = useQuickStore((state) => state.run)
  const consumeQuick = useQuickStore((state) => state.consume)
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/api/dashboard"),
  })
  const { data: recent } = useQuery({
    queryKey: ["transactions", "recent"],
    queryFn: () => api<{ records: Transaction[] }>("/api/transactions?limit=6"),
  })
  // 快捷记账完成（含切到其他页面期间完成）后弹出模型总结
  useEffect(() => {
    if (quickResult) {
      setQuickModalData(quickResult)
      setQuickModalOpen(true)
      consumeQuick()
      queryClient.invalidateQueries()
    }
  }, [quickResult, consumeQuick, queryClient])
  useEffect(() => {
    if (quickError) {
      message.error(quickError)
      consumeQuick()
    }
  }, [quickError, consumeQuick, message])
  const closeQuickModal = () => {
    setQuickModalOpen(false)
    queryClient.invalidateQueries()
  }
  const submitQuick = (value: string) => {
    const text = value.trim()
    if (!text || quickPending) return
    setQuickText("")
    runQuick(text)
  }
  if (isLoading || !data) return <Skeleton active paragraph={{ rows: 12 }} />

  const flow = data.cashflow.month
  const weekFlow = data.cashflow.week
  const monthComparison = data.comparison.month
  const days = Math.max(1, Number(data.anchor.slice(8)))
  const balanceSummary =
    flow.balance === 0
      ? "收支平衡"
      : `${flow.balance > 0 ? "结余" : "超支"} ${money(Math.abs(flow.balance))}`
  const monthChangeText =
    monthComparison.change == null
      ? "—"
      : `${monthComparison.change > 0 ? "+" : ""}${(monthComparison.change * 100).toFixed(1)}%`
  const trendConfig: any = {
    data: data.series.day,
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

  return (
    <div className="page-stack dashboard-page">
      <Row gutter={[18, 18]}>
        <Col xs={24} xl={10}>
          <Card className="statement-card">
            <Flex vertical style={{ minHeight: 292 }}>
              <Flex align="center" justify="space-between" gap={12}>
                <Flex align="center" gap={9}>
                  <FileDoneOutlined style={{ color: "#a8e2d5" }} />
                  <Typography.Text className="statement-eyebrow">
                    MONTHLY CLOSING · {data.anchor.slice(0, 7)}
                  </Typography.Text>
                </Flex>
                <Tag bordered={false} color="cyan">
                  截至 {data.anchor.slice(5)}
                </Tag>
              </Flex>
              <Statistic
                className="statement-value"
                title="本月支出"
                value={flow.expense}
                precision={2}
                prefix="¥"
              />
              <Typography.Text type="secondary" className="statement-summary">
                收入 {money(flow.income)} · {balanceSummary}
              </Typography.Text>
              <Row className="statement-ledger" gutter={18}>
                <Col span={8}>
                  <Statistic
                    title="日均"
                    value={flow.expense / days}
                    precision={2}
                    prefix="¥"
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="本周"
                    value={weekFlow.expense}
                    precision={2}
                    prefix="¥"
                  />
                </Col>
                <Col span={8}>
                  <div className="statement-inline-metric">
                    <Typography.Text className="statement-inline-metric-label">
                      较上月
                    </Typography.Text>
                    <Typography.Text className="statement-inline-metric-value">
                      {monthChangeText}
                    </Typography.Text>
                  </div>
                </Col>
              </Row>
              <Button
                ghost
                style={{ alignSelf: "flex-start", marginTop: 20 }}
                onClick={() =>
                  navigate(`/transactions?month=${data.anchor.slice(0, 7)}`)
                }
              >
                核对本月账目 <ArrowRightOutlined />
              </Button>
            </Flex>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card
            className="trend-card"
            title="每日支出轨迹"
            extra={
              <Button
                type="link"
                onClick={() => navigate(analyticsPath())}
              >
                打开完整分析 <ArrowRightOutlined />
              </Button>
            }
          >
            <Line {...trendConfig} />
          </Card>
        </Col>
      </Row>

      <Card className="dashboard-ai-quick">
        <Flex gap={14} align="center" wrap>
          <Avatar
            size={40}
            icon={<RobotOutlined />}
            style={{ background: "#176b62", flex: "0 0 auto" }}
          />
          <Flex vertical gap={2} className="dashboard-ai-quick-copy">
            <Typography.Text strong>AI 快捷记账</Typography.Text>
            <Typography.Text type="secondary">
              一句话记账，直接写入账本，无需确认。
            </Typography.Text>
          </Flex>
          <Input.Search
            className="dashboard-ai-quick-input"
            enterButton="记账"
            loading={quickPending}
            allowClear
            value={quickText}
            onChange={(event) => setQuickText(event.target.value)}
            onSearch={submitQuick}
            placeholder="例如：今天午饭 18 元"
            aria-label="AI 快捷记账"
          />
        </Flex>
      </Card>

      <Card
        className={`dashboard-budget-card ${data.budget?.status || "unset"}`}
      >
        {data.budget ? (
          <Flex vertical gap={12}>
            <Flex align="center" justify="space-between" gap={16} wrap>
              <div>
                <Typography.Text className="section-label">
                  MONTHLY BUDGET · {data.budget.month}
                </Typography.Text>
                <Typography.Title level={4}>
                  本月预算已使用 {(data.budget.usageRate * 100).toFixed(1)}%
                </Typography.Title>
              </div>
              <Button
                type="link"
                onClick={() => navigate(`/budgets?month=${data.budget!.month}`)}
              >
                管理预算 <ArrowRightOutlined />
              </Button>
            </Flex>
            <Progress
              percent={Math.min(
                100,
                Number((data.budget.usageRate * 100).toFixed(1)),
              )}
              showInfo={false}
              status={data.budget.status === "over" ? "exception" : "normal"}
              strokeColor={
                data.budget.status === "warning"
                  ? "#c99748"
                  : data.budget.status === "over"
                    ? "#c65f43"
                    : "#176b62"
              }
              trailColor="#e2e9e4"
            />
            <Row gutter={[18, 8]}>
              <Col xs={12} md={6}>
                <Statistic
                  title="预算"
                  value={data.budget.amount}
                  precision={2}
                  prefix="¥"
                />
              </Col>
              <Col xs={12} md={6}>
                <Statistic
                  title="已花"
                  value={data.budget.used}
                  precision={2}
                  prefix="¥"
                />
              </Col>
              <Col xs={12} md={6}>
                <Statistic
                  title={data.budget.remaining >= 0 ? "剩余" : "已超支"}
                  value={Math.abs(data.budget.remaining)}
                  precision={2}
                  prefix="¥"
                  valueStyle={
                    data.budget.remaining < 0 ? { color: "#c65f43" } : undefined
                  }
                />
              </Col>
              <Col xs={12} md={6}>
                <Statistic
                  title="状态"
                  value={
                    data.budget.status === "over"
                      ? "已超支"
                      : data.budget.status === "warning"
                        ? "接近上限"
                        : "正常"
                  }
                />
              </Col>
            </Row>
          </Flex>
        ) : (
          <Flex align="center" justify="space-between" gap={16} wrap>
            <div>
              <Typography.Text className="section-label">
                MONTHLY BUDGET
              </Typography.Text>
              <Typography.Title level={4}>
                给本月支出设一个上限
              </Typography.Title>
              <Typography.Text type="secondary">
                设置后会在这里显示已花、剩余和风险提醒。
              </Typography.Text>
            </div>
            <Button
              type="primary"
              onClick={() =>
                navigate(`/budgets?month=${data.anchor.slice(0, 7)}`)
              }
            >
              设置本月预算
            </Button>
          </Flex>
        )}
        {data.categoryBudgets.length > 0 && (
          <div className="dashboard-category-budgets">
            <Flex
              align="end"
              justify="space-between"
              gap={12}
              className="dashboard-category-budget-heading"
            >
              <div>
                <Typography.Text strong>分类预算</Typography.Text>
                <Typography.Text type="secondary" className="block-text">
                  优先显示接近上限和已经超支的分类
                </Typography.Text>
              </div>
              {data.categoryBudgets.length > 6 && (
                <Button
                  type="link"
                  onClick={() =>
                    navigate(`/budgets?month=${data.anchor.slice(0, 7)}`)
                  }
                >
                  查看全部 {data.categoryBudgets.length} 项
                </Button>
              )}
            </Flex>
            <Row gutter={[12, 12]}>
              {data.categoryBudgets.slice(0, 6).map((budget) => (
                <Col xs={24} md={12} xl={8} key={budget.id}>
                  <DashboardCategoryBudget budget={budget} />
                </Col>
              ))}
            </Row>
          </div>
        )}
      </Card>

      <Row gutter={[18, 18]}>
        <Col xs={24} lg={12} xl={8}>
          <Card
            className="category-overview-card"
            title="本月支出结构"
            extra={
              <Typography.Text type="secondary">
                {money(flow.expense)}
              </Typography.Text>
            }
          >
            {data.breakdowns.month.length ? (
              <CategoryBreakdownBars
                rows={data.breakdowns.month}
                onCategoryClick={(row) =>
                  navigate(
                    `/transactions?month=${data.anchor.slice(0, 7)}&category1=${encodeURIComponent(row.parent || row.category)}`,
                  )
                }
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="本月还没有支出"
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12} xl={10}>
          <Card
            className="recent-card"
            title="最近入账"
            extra={
              <Button type="link" onClick={() => navigate("/transactions")}>
                全部账目
              </Button>
            }
          >
            <List
              dataSource={recent?.records || []}
              locale={{ emptyText: "记下第一笔账目后会显示在这里" }}
              renderItem={(row) => (
                <List.Item
                  extra={
                    <Typography.Text
                      strong
                      type={row.amount < 0 ? "danger" : "success"}
                    >
                      {row.amount < 0 ? "−" : "+"}
                      {money(Math.abs(row.amount))}
                    </Typography.Text>
                  }
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        shape="square"
                        style={{
                          background: "#e4eeea",
                          color: "#176b62",
                          fontFamily: "Bahnschrift, monospace",
                        }}
                      >
                        {row.date.slice(8)}
                      </Avatar>
                    }
                    title={row.item}
                    description={
                      <span className="transaction-mobile-description">
                        <CategoryIcon name={row.secondaryIcon} size="small" />
                        {row.category1} · {row.category2}
                      </span>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} xl={6}>
          <Card className="ai-insight-card">
            <Flex vertical className="ai-insight-content">
              <Avatar size={42} icon={<RobotOutlined />} />
              <Typography.Text className="statement-eyebrow">
                AI LEDGER NOTE
              </Typography.Text>
              <Typography.Title level={3}>
                支出重心在
                <br />
                {data.breakdowns.month[0]?.category || "暂无分类"}
              </Typography.Title>
              <Typography.Paragraph>
                占本月支出的{" "}
                {((data.breakdowns.month[0]?.share || 0) * 100).toFixed(1)}
                %。可以继续询问具体账目、分类变化或节省建议。
              </Typography.Paragraph>
              <Button type="primary" onClick={() => navigate("/ai")}>
                继续追问 <ArrowRightOutlined />
              </Button>
            </Flex>
          </Card>
        </Col>
      </Row>
      <Modal
        className="quick-result-modal"
        open={quickModalOpen}
        onCancel={closeQuickModal}
        centered
        title={
          <Flex align="center" gap={8}>
            <RobotOutlined style={{ color: "#176b62" }} />
            AI 快捷记账已完成
          </Flex>
        }
        width="min(640px, calc(100vw - 24px))"
        footer={
          <Button type="primary" onClick={closeQuickModal}>
            知道了
          </Button>
        }
      >
        <div className="markdown-body quick-result-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {quickModalData?.message || ""}
          </ReactMarkdown>
        </div>
        {quickModalData?.warning && (
          <Typography.Text type="warning">
            ⚠️ {quickModalData.warning}
          </Typography.Text>
        )}
      </Modal>
    </div>
  )
}

function DashboardCategoryBudget({ budget }: { budget: DashboardBudget }) {
  const color =
    budget.status === "over"
      ? "#c65f43"
      : budget.status === "warning"
        ? "#c99748"
        : "#176b62"
  const status =
    budget.status === "over"
      ? "已超支"
      : budget.status === "warning"
        ? "接近上限"
        : "正常"
  return (
    <div className={`dashboard-category-budget ${budget.status}`}>
      <Flex align="center" justify="space-between" gap={10}>
        <Typography.Text strong ellipsis>
          <Flex align="center" gap={8}>
            <CategoryIcon name={budget.primaryIcon} size="small" />
            {budget.category1}
          </Flex>
        </Typography.Text>
        <Tag
          bordered={false}
          color={
            budget.status === "over"
              ? "error"
              : budget.status === "warning"
                ? "warning"
                : "success"
          }
        >
          {status}
        </Tag>
      </Flex>
      <Flex align="baseline" justify="space-between" gap={8}>
        <Typography.Text type="secondary">
          已花 {money(budget.used)}
        </Typography.Text>
        <Typography.Text strong>{money(budget.amount)}</Typography.Text>
      </Flex>
      <Progress
        percent={Math.min(100, Number((budget.usageRate * 100).toFixed(1)))}
        showInfo={false}
        size="small"
        strokeColor={color}
        trailColor="#e2e9e4"
      />
      <Flex justify="space-between" gap={8}>
        <Typography.Text type="secondary">
          {budget.remaining >= 0
            ? `剩余 ${money(budget.remaining)}`
            : `超出 ${money(Math.abs(budget.remaining))}`}
        </Typography.Text>
        <Typography.Text style={{ color }}>
          {(budget.usageRate * 100).toFixed(1)}%
        </Typography.Text>
      </Flex>
    </div>
  )
}
