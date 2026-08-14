import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  WalletOutlined,
} from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Form,
  InputNumber,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { CategoryIcon } from "@/components/category-icon"
import { api } from "@/lib/api"

type Category = {
  id: string
  category1: string
  category2: string
  primaryIcon: string
  secondaryIcon: string
  enabled: boolean
}
type ManagementData = { categories: Category[] }
type Budget = {
  id: string
  month: string
  category1: string | null
  amount: number
  used: number
  remaining: number
  usageRate: number
  status: "normal" | "warning" | "over"
}
type BudgetData = {
  month: string
  monthExpense: number
  totalBudget: Budget | null
  categoryBudgets: Budget[]
}
const budgetMonthStorageKey = "qing-zhang-budget-month"

export function BudgetsPage() {
  const [params, setParams] = useSearchParams()
  const requestedMonth = params.get("month") || ""
  const storedMonth = sessionStorage.getItem(budgetMonthStorageKey) || ""
  const month = /^\d{4}-\d{2}$/.test(requestedMonth)
    ? requestedMonth
    : /^\d{4}-\d{2}$/.test(storedMonth)
      ? storedMonth
      : dayjs().format("YYYY-MM")
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()
  useEffect(() => {
    sessionStorage.setItem(budgetMonthStorageKey, month)
  }, [month])
  const { data: management } = useQuery({
    queryKey: ["management"],
    queryFn: () => api<ManagementData>("/api/management"),
  })
  const { data, isLoading } = useQuery({
    queryKey: ["budgets", month],
    queryFn: () => api<BudgetData>(`/api/management/budgets?month=${month}`),
  })
  const categories = useMemo(
    () => [
      ...new Set(
        management?.categories
          .filter((row) => row.enabled)
          .map((row) => row.category1) || [],
      ),
    ],
    [management?.categories],
  )
  const primaryIcon = (name: string | null) =>
    management?.categories.find((row) => row.category1 === name)?.primaryIcon
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["budgets"] }),
      // 分析页（预算曲线）与首页（预算卡片）都读取预算数据，
      // 设置/删除预算后同步失效，避免需要刷新浏览器才能看到新曲线。
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ])
  const save = useMutation({
    mutationFn: (values: any) =>
      editing
        ? api(`/api/management/budgets/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              ...values,
              month: values.month.format("YYYY-MM"),
              category1:
                values.category1 === "__total__" ? null : values.category1,
            }),
          })
        : api("/api/management/budgets", {
            method: "POST",
            body: JSON.stringify({
              ...values,
              month: values.month.format("YYYY-MM"),
              category1:
                values.category1 === "__total__" ? null : values.category1,
            }),
          }),
    onSuccess: async () => {
      setCreating(false)
      setEditing(null)
      form.resetFields()
      await refresh()
      message.success(editing ? "预算已更新" : "预算已设置")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const copy = useMutation({
    mutationFn: () =>
      api<{ copied: number; from: string }>(
        "/api/management/budgets/copy-previous",
        { method: "POST", body: JSON.stringify({ month }) },
      ),
    onSuccess: async (result) => {
      await refresh()
      message.success(
        result.copied
          ? `已从 ${result.from} 复制 ${result.copied} 条预算`
          : "本月已有相同预算，无需复制",
      )
    },
    onError: (error: Error) => message.error(error.message),
  })
  const changeMonth = (value: dayjs.Dayjs | null) =>
    value && setParams({ month: value.format("YYYY-MM") })
  const openCreate = () => {
    const used = new Set(
      data?.categoryBudgets.map((row) => row.category1) || [],
    )
    const firstCategory = categories.find((name) => !used.has(name))
    setEditing(null)
    setCreating(true)
    form.resetFields()
    form.setFieldsValue({
      month: dayjs(`${month}-01`),
      category1: data?.totalBudget ? firstCategory : "__total__",
    })
  }
  const openEdit = (budget: Budget) => {
    setCreating(false)
    setEditing(budget)
    form.setFieldsValue({
      month: dayjs(`${budget.month}-01`),
      category1: budget.category1 || "__total__",
      amount: budget.amount,
    })
  }
  const remove = (budget: Budget) =>
    modal.confirm({
      title: "删除预算",
      content: `确定删除 ${budget.month} 的${budget.category1 ? `“${budget.category1}”分类预算` : "总预算"}吗？`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await api(`/api/management/budgets/${budget.id}`, { method: "DELETE" })
        await refresh()
        message.success("预算已删除")
      },
    })
  const total = data?.totalBudget
  const risk =
    total?.status === "over"
      ? {
          type: "error" as const,
          text: `本月已经超出预算 ¥${Math.abs(total.remaining).toFixed(2)}`,
        }
      : total?.status === "warning"
        ? {
            type: "warning" as const,
            text: `本月预算已使用 ${(total.usageRate * 100).toFixed(1)}%，请留意后续支出`,
          }
        : null
  return (
    <div className="page-stack budget-workspace">
      <Card className="budget-toolbar">
        <Flex align="center" justify="space-between" gap={12} wrap>
          <Flex vertical gap={3}>
            <Typography.Text strong>预算月份</Typography.Text>
            <Typography.Text type="secondary">
              每个月只设置一个总预算，分类预算按需添加。
            </Typography.Text>
          </Flex>
          <Flex gap={8} wrap>
            <DatePicker
              className="budget-month-picker"
              picker="month"
              allowClear={false}
              value={dayjs(`${month}-01`)}
              onChange={changeMonth}
            />
            <Button
              icon={<CopyOutlined />}
              loading={copy.isPending}
              onClick={() => copy.mutate()}
            >
              复制上月
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              设置预算
            </Button>
          </Flex>
        </Flex>
      </Card>
      <Card
        title={
          <Space>
            <WalletOutlined />
            <span>本月总预算</span>
          </Space>
        }
        loading={isLoading}
      >
        {risk && (
          <Alert
            className="budget-alert"
            type={risk.type}
            showIcon
            message={risk.text}
          />
        )}
        {total ? (
          <BudgetSummary budget={total} onEdit={openEdit} onDelete={remove} />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={`${month} 尚未设置总预算`}
          >
            <Button type="primary" onClick={openCreate}>
              设置本月总预算
            </Button>
          </Empty>
        )}
      </Card>
      <Card
        title="分类预算"
        extra={
          <Typography.Text type="secondary">
            可选 · 只控制需要重点关注的类别
          </Typography.Text>
        }
        loading={isLoading}
      >
        {data?.categoryBudgets.length ? (
          <Row gutter={[16, 16]}>
            {data.categoryBudgets.map((budget) => (
              <Col xs={24} md={12} xl={8} key={budget.id}>
                <BudgetCategoryCard
                  budget={budget}
                  icon={primaryIcon(budget.category1)}
                  onEdit={openEdit}
                  onDelete={remove}
                />
              </Col>
            ))}
          </Row>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="本月还没有分类预算"
          >
            <Button onClick={openCreate}>添加分类预算</Button>
          </Empty>
        )}
      </Card>
      <Drawer
        className="responsive-drawer"
        title={editing ? "编辑预算" : "设置预算"}
        open={creating || Boolean(editing)}
        width={480}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        footer={
          <Flex justify="flex-end" gap={8}>
            <Button
              onClick={() => {
                setCreating(false)
                setEditing(null)
              }}
            >
              取消
            </Button>
            <Button
              type="primary"
              loading={save.isPending}
              onClick={() => form.submit()}
            >
              {editing ? "保存修改" : "保存预算"}
            </Button>
          </Flex>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => save.mutate(values)}
        >
          <Form.Item name="month" label="月份" rules={[{ required: true }]}>
            <DatePicker picker="month" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="category1"
            label="预算范围"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                {
                  label: "整月总预算",
                  value: "__total__",
                  disabled: !editing && Boolean(data?.totalBudget),
                },
                ...categories.map((name) => ({
                  label: (
                    <span className="category-select-label">
                      <CategoryIcon name={primaryIcon(name)} size="small" />
                      {name}
                    </span>
                  ),
                  value: name,
                  disabled:
                    !editing &&
                    Boolean(
                      data?.categoryBudgets.some(
                        (row) => row.category1 === name,
                      ),
                    ),
                })),
              ]}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label="预算金额"
            rules={[{ required: true }]}
          >
            <InputNumber
              min={0.01}
              precision={2}
              prefix="¥"
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}

function BudgetSummary({
  budget,
  onEdit,
  onDelete,
}: {
  budget: Budget
  onEdit: (budget: Budget) => void
  onDelete: (budget: Budget) => void
}) {
  const color = statusColor(budget.status)
  return (
    <div className={`budget-summary ${budget.status}`}>
      <Flex
        justify="space-between"
        align="flex-start"
        gap={16}
        className="budget-summary-head"
      >
        <div>
          <Typography.Text className="section-label">
            MONTHLY SPENDING LIMIT
          </Typography.Text>
          <Typography.Title level={3}>
            ¥{budget.amount.toFixed(2)}
          </Typography.Title>
        </div>
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => onEdit(budget)}
          >
            编辑
          </Button>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => onDelete(budget)}
          >
            删除
          </Button>
        </Space>
      </Flex>
      <Progress
        percent={Math.min(100, Number((budget.usageRate * 100).toFixed(1)))}
        showInfo={false}
        strokeColor={color}
        trailColor="#dfe8e3"
      />
      <Row gutter={[16, 12]}>
        <Col xs={12} md={8}>
          <Statistic
            title="已花"
            value={budget.used}
            precision={2}
            prefix="¥"
          />
        </Col>
        <Col xs={12} md={8}>
          <Statistic
            title={budget.remaining >= 0 ? "剩余" : "已超支"}
            value={Math.abs(budget.remaining)}
            precision={2}
            prefix="¥"
            valueStyle={budget.remaining < 0 ? { color } : undefined}
          />
        </Col>
        <Col xs={24} md={8}>
          <Statistic
            title="使用率"
            value={budget.usageRate * 100}
            precision={1}
            suffix="%"
            valueStyle={{ color }}
          />
        </Col>
      </Row>
    </div>
  )
}

function BudgetCategoryCard({
  budget,
  icon,
  onEdit,
  onDelete,
}: {
  budget: Budget
  icon?: string
  onEdit: (budget: Budget) => void
  onDelete: (budget: Budget) => void
}) {
  const color = statusColor(budget.status)
  return (
    <Card
      size="small"
      className={`budget-category-card ${budget.status}`}
      title={
        <Flex align="center" gap={9}>
          <CategoryIcon name={icon} size="small" />
          <span>{budget.category1}</span>
        </Flex>
      }
      extra={
        <Dropdown
          menu={{
            items: [
              {
                key: "edit",
                icon: <EditOutlined />,
                label: "编辑",
                onClick: () => onEdit(budget),
              },
              {
                key: "delete",
                danger: true,
                icon: <DeleteOutlined />,
                label: "删除",
                onClick: () => onDelete(budget),
              },
            ],
          }}
        >
          <Button
            type="text"
            icon={<MoreOutlined />}
            aria-label={`${budget.category1}预算操作`}
          />
        </Dropdown>
      }
    >
      <Flex justify="space-between" align="baseline">
        <Typography.Text type="secondary">
          已花 ¥{budget.used.toFixed(2)}
        </Typography.Text>
        <Typography.Text strong>¥{budget.amount.toFixed(2)}</Typography.Text>
      </Flex>
      <Progress
        percent={Math.min(100, Number((budget.usageRate * 100).toFixed(1)))}
        showInfo={false}
        strokeColor={color}
        trailColor="#e3eae6"
        size="small"
      />
      <Flex justify="space-between">
        <Typography.Text type="secondary">
          {budget.remaining >= 0
            ? `剩余 ¥${budget.remaining.toFixed(2)}`
            : `超支 ¥${Math.abs(budget.remaining).toFixed(2)}`}
        </Typography.Text>
        <Tag
          color={
            budget.status === "over"
              ? "error"
              : budget.status === "warning"
                ? "warning"
                : "success"
          }
        >
          {budget.status === "over"
            ? "已超支"
            : budget.status === "warning"
              ? "接近上限"
              : "正常"}
        </Tag>
      </Flex>
    </Card>
  )
}

function statusColor(status: Budget["status"]) {
  return status === "over"
    ? "#c65f43"
    : status === "warning"
      ? "#c99748"
      : "#176b62"
}
