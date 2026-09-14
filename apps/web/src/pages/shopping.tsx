import {
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ShoppingOutlined,
  WalletOutlined,
} from "@ant-design/icons"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  App,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  List,
  Progress,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { AmountCalculator } from "@/components/amount-calculator"
import { DatePicker } from "@/components/sheet-date-picker"
import {
  api,
  type ShoppingIncome,
  type ShoppingItem,
  type ShoppingMonth,
  type ShoppingOverview,
} from "@/lib/api"
import { money } from "@/lib/utils"
import {
  useIsMobileViewport,
  usePickerInputReadOnly,
} from "@/lib/use-viewport"

const shoppingMonthStorageKey = "qing-zhang-shopping-month"
const incomeSuggestions = ["工资", "奖金", "兼职", "报销", "红包", "其他"]
const statusMeta = {
  normal: { color: "success", text: "还有余量" },
  warning: { color: "warning", text: "所剩不多" },
  over: { color: "error", text: "已经超支" },
} as const

const monthTitle = (value: string) => dayjs(`${value}-01`).format("YYYY年M月")
const monthShort = (value: string) => dayjs(`${value}-01`).format("M月")
const pickerMonth = (value: dayjs.Dayjs | dayjs.Dayjs[] | null) => {
  const selected = Array.isArray(value) ? value[0] : value
  return selected ? selected.format("YYYY-MM") : ""
}

type Draft =
  { kind: "income"; row: ShoppingIncome } | { kind: "item"; row: ShoppingItem }

function incomeSourceOptions(current?: string) {
  const names = incomeSuggestions.includes(current || "")
    ? incomeSuggestions
    : [...incomeSuggestions, ...(current ? [current] : [])]
  return names.map((name) => ({ value: name, label: name }))
}

function IncomeSourceField({
  id,
  value,
  onChange,
}: {
  id?: string
  value?: string
  onChange?: (value: string) => void
}) {
  const mobile = useIsMobileViewport()
  const options = incomeSourceOptions(value)
  if (mobile) {
    return (
      <Select
        id={id}
        allowClear
        showSearch={false}
        placeholder="工资、奖金、兼职…"
        options={options}
        value={value || undefined}
        onChange={(next) => onChange?.(next || "")}
        style={{ width: "100%" }}
      />
    )
  }
  return (
    <AutoComplete
      id={id}
      allowClear
      options={options}
      placeholder="工资、奖金、兼职…"
      value={value}
      onChange={onChange}
    />
  )
}

export function ShoppingPage() {
  const pickerInputReadOnly = usePickerInputReadOnly()
  const [params, setParams] = useSearchParams()
  const requestedMonth = params.get("month") || ""
  const storedMonth = sessionStorage.getItem(shoppingMonthStorageKey) || ""
  const month = /^\d{4}-\d{2}$/.test(requestedMonth)
    ? requestedMonth
    : /^\d{4}-\d{2}$/.test(storedMonth)
      ? storedMonth
      : dayjs().format("YYYY-MM")
  const [incomeForm] = Form.useForm()
  const [itemForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [windowStart, setWindowStart] = useState(month)
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()
  useEffect(() => {
    sessionStorage.setItem(shoppingMonthStorageKey, month)
  }, [month])
  useEffect(() => {
    const offset = dayjs(`${month}-01`).diff(
      dayjs(`${windowStart}-01`),
      "month",
    )
    if (offset < 0 || offset > 5) setWindowStart(month)
  }, [month, windowStart])
  const { data } = useQuery({
    queryKey: ["shopping", windowStart],
    queryFn: () => api<ShoppingOverview>(`/api/shopping?month=${windowStart}`),
    placeholderData: keepPreviousData,
  })
  const view = data?.months.find((row) => row.month === month)
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["shopping"] })
  const addIncome = useMutation({
    mutationFn: (values: { name: string; amount: number }) =>
      api("/api/shopping/incomes", {
        method: "POST",
        body: JSON.stringify({ ...values, month }),
      }),
    onSuccess: async () => {
      incomeForm.resetFields()
      await refresh()
      message.success("已记入本月收入")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const copyIncome = useMutation({
    mutationFn: () =>
      api<{ copied: number; from: string }>(
        "/api/shopping/incomes/copy-previous",
        {
          method: "POST",
          body: JSON.stringify({ month }),
        },
      ),
    onSuccess: async (result) => {
      await refresh()
      message.success(`已从 ${result.from} 复制 ${result.copied} 笔收入`)
    },
    onError: (error: Error) => message.error(error.message),
  })
  const addItem = useMutation({
    mutationFn: (values: { name: string; amount: number }) =>
      api("/api/shopping/items", {
        method: "POST",
        body: JSON.stringify({ ...values, month }),
      }),
    onSuccess: async () => {
      itemForm.resetFields()
      await refresh()
      message.success("已加入清单")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const patchItem = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/api/shopping/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onMutate: async ({ id, body }) => {
      if (!("purchased" in body) || Object.keys(body).length !== 1) return
      await queryClient.cancelQueries({ queryKey: ["shopping", windowStart] })
      const previous = queryClient.getQueryData<ShoppingOverview>([
        "shopping",
        windowStart,
      ])
      const purchased = Boolean(body.purchased)
      const patchItems = (items: ShoppingItem[]) =>
        items.map((item) => (item.id === id ? { ...item, purchased } : item))
      if (previous) {
        queryClient.setQueryData<ShoppingOverview>(["shopping", windowStart], {
          ...previous,
          items: patchItems(previous.items),
          months: previous.months.map((row) =>
            row.month !== month
              ? row
              : {
                  ...row,
                  items: patchItems(row.items),
                  purchasedCount: patchItems(row.items).filter(
                    (item) => item.purchased,
                  ).length,
                },
          ),
        })
      }
      return { previous }
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previous)
        queryClient.setQueryData(["shopping", windowStart], context.previous)
      message.error(error.message)
    },
    onSuccess: async (_result, variables) => {
      if (
        !("purchased" in variables.body) ||
        Object.keys(variables.body).length !== 1
      ) {
        setDraft(null)
        editForm.resetFields()
        message.success("清单已更新")
      }
      await refresh()
    },
  })
  const patchIncome = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/api/shopping/incomes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      setDraft(null)
      editForm.resetFields()
      await refresh()
      message.success("收入已更新")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const changeMonth = (value: dayjs.Dayjs | dayjs.Dayjs[] | null) => {
    const next = pickerMonth(value)
    if (next) setParams({ month: next })
  }
  const openDraft = (next: Draft) => {
    setDraft(next)
    editForm.setFieldsValue({
      month: dayjs(`${next.row.month}-01`),
      name: next.row.name,
      amount: next.row.amount,
      note: next.row.note,
    })
  }
  const removeLine = (next: Draft) =>
    modal.confirm({
      title: next.kind === "income" ? "删除这笔收入" : "从清单移除",
      content:
        next.kind === "income"
          ? `确定删除 ${monthTitle(next.row.month)} 的「${next.row.name}」${money(next.row.amount)} 吗？`
          : `确定把「${next.row.name}」从 ${monthTitle(next.row.month)} 的清单里去掉吗？这不会删除已经记下的账目。`,
      okText: next.kind === "income" ? "删除" : "移除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        const path =
          next.kind === "income"
            ? `/api/shopping/incomes/${next.row.id}`
            : `/api/shopping/items/${next.row.id}`
        await api(path, { method: "DELETE" })
        await refresh()
        message.success(next.kind === "income" ? "收入已删除" : "已从清单移除")
      },
    })
  const remaining = view?.remaining ?? 0
  const income = view?.income ?? 0
  const planned = view?.planned ?? 0
  const status = view?.status || "normal"
  return (
    <div className="page-stack shopping-workspace">
      <Card className="shopping-toolbar">
        <Flex align="center" justify="space-between" gap={12} wrap>
          <Flex vertical gap={3}>
            <Typography.Text strong>规划月份</Typography.Text>
            <Typography.Text type="secondary">
              每个月单独填收入。工资、奖金、兼职都可以分开记，剩余按当月合计计算。
            </Typography.Text>
          </Flex>
          <DatePicker
            className="shopping-month-picker"
            picker="month"
            allowClear={false}
            inputReadOnly={pickerInputReadOnly}
            value={dayjs(`${month}-01`)}
            onChange={changeMonth}
          />
        </Flex>
      </Card>
      <Card className={`shopping-remain ${status}`}>
        <Typography.Text className="section-label shopping-remain-label">
          THIS MONTH LEFT
        </Typography.Text>
        <Statistic
          className="shopping-remain-value"
          title={remaining >= 0 ? "本月剩余" : "本月超支"}
          value={Math.abs(remaining)}
          precision={2}
          prefix="¥"
        />
        <Typography.Text type="secondary">
          本月收入 {money(income)} − 计划购买 {money(planned)}
        </Typography.Text>
        <Progress
          percent={Math.min(100, Math.round((view?.usageRate || 0) * 100))}
          status={status === "over" ? "exception" : "normal"}
          strokeColor={
            status === "over"
              ? "#c65f43"
              : status === "warning"
                ? "#c99748"
                : "#176b62"
          }
        />
        <Flex justify="space-between" align="center" gap={8} wrap>
          <Typography.Text type="secondary">
            {income
              ? `计划购买约占本月收入的 ${((view?.usageRate || 0) * 100).toFixed(1)}%`
              : "先记下这个月能拿到的钱，再往下加要买的东西"}
          </Typography.Text>
          <Tag color={income ? statusMeta[status].color : "default"}>
            {income ? statusMeta[status].text : "待填写收入"}
          </Tag>
        </Flex>
      </Card>
      <Card title="未来六个月">
        <div className="shopping-month-strip">
          {(data?.months || []).map((row) => (
            <MonthChip
              key={row.month}
              row={row}
              active={row.month === month}
              onSelect={() => setParams({ month: row.month })}
            />
          ))}
        </div>
      </Card>
      <Card
        title={
          <Space>
            <WalletOutlined />
            <span>{monthTitle(month)} 收入</span>
          </Space>
        }
        extra={
          <Button
            icon={<CopyOutlined />}
            loading={copyIncome.isPending}
            onClick={() => copyIncome.mutate()}
          >
            复制上月收入
          </Button>
        }
      >
        <Form
          form={incomeForm}
          layout="vertical"
          className="shopping-add-form"
          onFinish={(values) => addIncome.mutate(values)}
        >
          <Form.Item
            name="name"
            label="来源"
            rules={[{ required: true, message: "请填写收入来源" }]}
          >
            <IncomeSourceField />
          </Form.Item>
          <Form.Item
            name="amount"
            label="金额"
            rules={[{ required: true, message: "请填写金额" }]}
          >
            <AmountCalculator min={0.01} placeholder="0.00" />
          </Form.Item>
          <Form.Item label=" ">
            <Button
              type="primary"
              htmlType="submit"
              icon={<PlusOutlined />}
              loading={addIncome.isPending}
              block
            >
              加入本月
            </Button>
          </Form.Item>
        </Form>
        <div className="shopping-income-hints">
          {incomeSuggestions.map((name) => (
            <Tag
              key={name}
              className="shopping-income-hint"
              onClick={() => incomeForm.setFieldValue("name", name)}
            >
              {name}
            </Tag>
          ))}
        </div>
        {view?.incomes.length ? (
          <List
            className="shopping-line-list"
            dataSource={view.incomes}
            renderItem={(row) => (
              <LineItem
                name={row.name}
                note={row.note}
                amount={row.amount}
                onEdit={() => openDraft({ kind: "income", row })}
                onRemove={() => removeLine({ kind: "income", row })}
              />
            )}
          />
        ) : view ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={`${monthTitle(month)} 还没有收入。工资、奖金、兼职都可以分开记。`}
          />
        ) : null}
      </Card>
      <Card
        title={
          <Space>
            <ShoppingOutlined />
            <span>{monthTitle(month)} 要买的东西</span>
          </Space>
        }
        extra={
          <Typography.Text type="secondary">
            {view?.itemCount
              ? `${view.itemCount} 件 · 已勾选 ${view.purchasedCount} 件`
              : "还没有物品"}
          </Typography.Text>
        }
      >
        <Form
          form={itemForm}
          layout="vertical"
          className="shopping-add-form"
          onFinish={(values) => addItem.mutate(values)}
        >
          <Form.Item
            name="name"
            label="物品"
            rules={[{ required: true, message: "请填写要买的东西" }]}
          >
            <Input placeholder="例如：显示器" maxLength={80} allowClear />
          </Form.Item>
          <Form.Item
            name="amount"
            label="价格"
            rules={[{ required: true, message: "请填写价格" }]}
          >
            <AmountCalculator min={0.01} placeholder="0.00" />
          </Form.Item>
          <Form.Item label=" ">
            <Button
              type="primary"
              htmlType="submit"
              icon={<PlusOutlined />}
              loading={addItem.isPending}
              block
            >
              加入本月
            </Button>
          </Form.Item>
        </Form>
        {view?.items.length ? (
          <List
            className="shopping-line-list"
            dataSource={view.items}
            renderItem={(item) => (
              <List.Item
                className={`shopping-item ${item.purchased ? "purchased" : ""}`}
                extra={
                  <Typography.Text strong className="shopping-item-amount">
                    {money(item.amount)}
                  </Typography.Text>
                }
                actions={[
                  <Button
                    key="edit"
                    type="text"
                    icon={<EditOutlined />}
                    aria-label={`编辑 ${item.name}`}
                    onClick={() => openDraft({ kind: "item", row: item })}
                  />,
                  <Button
                    key="delete"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`移除 ${item.name}`}
                    onClick={() => removeLine({ kind: "item", row: item })}
                  />,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <Checkbox
                      checked={item.purchased}
                      aria-label={
                        item.purchased
                          ? `取消已买 ${item.name}`
                          : `标记已买 ${item.name}`
                      }
                      onChange={(event) =>
                        patchItem.mutate({
                          id: item.id,
                          body: { purchased: event.target.checked },
                        })
                      }
                    />
                  }
                  title={
                    <span className="shopping-item-name">{item.name}</span>
                  }
                  description={
                    item.purchased
                      ? item.note
                        ? `已买 · ${item.note}`
                        : "已买"
                      : item.note || "待买"
                  }
                />
              </List.Item>
            )}
          />
        ) : view ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={`${monthTitle(month)} 还没有计划购买的东西`}
          />
        ) : null}
      </Card>
      <Drawer
        className="responsive-drawer"
        title={draft?.kind === "income" ? "修改收入" : "修改清单物品"}
        open={Boolean(draft)}
        width={480}
        onClose={() => setDraft(null)}
        footer={
          <Flex justify="flex-end" gap={8}>
            <Button onClick={() => setDraft(null)}>取消</Button>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={patchItem.isPending || patchIncome.isPending}
              onClick={() => editForm.submit()}
            >
              保存修改
            </Button>
          </Flex>
        }
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) => {
            if (!draft) return
            const nextMonth = pickerMonth(values.month)
            if (!nextMonth) return
            const body = {
              name: values.name,
              amount: values.amount,
              note: values.note,
              month: nextMonth,
            }
            if (draft.kind === "income")
              patchIncome.mutate({ id: draft.row.id, body })
            else patchItem.mutate({ id: draft.row.id, body })
          }}
        >
          <Form.Item
            name="month"
            label="放到哪个月"
            rules={[{ required: true }]}
          >
            <DatePicker
              picker="month"
              style={{ width: "100%" }}
              inputReadOnly={pickerInputReadOnly}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label={draft?.kind === "income" ? "来源" : "物品"}
            rules={[{ required: true, message: "请填写名称" }]}
          >
            {draft?.kind === "income" ? (
              <IncomeSourceField />
            ) : (
              <Input maxLength={80} />
            )}
          </Form.Item>
          <Form.Item
            name="amount"
            label="金额"
            rules={[{ required: true, message: "请填写金额" }]}
          >
            <AmountCalculator min={0.01} />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}

function LineItem({
  name,
  note,
  amount,
  onEdit,
  onRemove,
}: {
  name: string
  note?: string
  amount: number
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <List.Item
      className="shopping-item"
      extra={
        <Typography.Text strong className="shopping-item-amount">
          {money(amount)}
        </Typography.Text>
      }
      actions={[
        <Button
          key="edit"
          type="text"
          icon={<EditOutlined />}
          aria-label={`编辑 ${name}`}
          onClick={onEdit}
        />,
        <Button
          key="delete"
          type="text"
          danger
          icon={<DeleteOutlined />}
          aria-label={`删除 ${name}`}
          onClick={onRemove}
        />,
      ]}
    >
      <List.Item.Meta title={name} description={note || undefined} />
    </List.Item>
  )
}

function MonthChip({
  row,
  active,
  onSelect,
}: {
  row: ShoppingMonth
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`shopping-month-chip ${row.status} ${active ? "active" : ""}`}
      onClick={onSelect}
    >
      <b>{monthShort(row.month)}</b>
      <strong>
        {row.income || row.planned
          ? row.remaining >= 0
            ? `剩 ${money(row.remaining)}`
            : `超 ${money(Math.abs(row.remaining))}`
          : "未填收入"}
      </strong>
      <span>
        {row.incomeCount ? `${row.incomeCount} 笔收入` : "无收入"}
        {row.itemCount ? ` · ${row.itemCount} 件` : ""}
      </span>
    </button>
  )
}
