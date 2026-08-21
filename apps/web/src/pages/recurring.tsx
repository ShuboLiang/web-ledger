import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RetweetOutlined,
  StepForwardOutlined,
} from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Radio,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useMemo, useState } from "react"
import { AmountCalculator } from "@/components/amount-calculator"
import { CategoryIcon } from "@/components/category-icon"
import { DatePicker } from "@/components/sheet-date-picker"
import {
  api,
  isUnaccountedAccountId,
  UNACCOUNTED_ACCOUNT_ID,
  UNACCOUNTED_ACCOUNT_LABEL,
  type Dictionaries,
} from "@/lib/api"
import { money } from "@/lib/utils"
import { usePickerInputReadOnly, useSearchableSelect } from "@/lib/use-viewport"

type RecurringRule = {
  id: string
  frequency: "daily" | "weekly" | "monthly" | "yearly"
  frequencyText: string
  interval: number
  dayOfMonth: number | null
  startDate: string
  endDate: string | null
  nextRunDate: string
  amount: number
  direction: "expense" | "income"
  item: string
  category1: string
  category2: string
  accountId: string | null
  accountName: string | null
  note: string
  autoCreate: boolean
  enabled: boolean
}

type PendingGeneration = {
  id: string
  ruleId: string
  runDate: string
  status: string
  item?: string
  amount?: number
  direction?: "expense" | "income"
  category1?: string
  category2?: string
}

type RecurringData = {
  today: string
  rules: RecurringRule[]
  upcoming: RecurringRule[]
  due: RecurringRule[]
  pending: PendingGeneration[]
}

type FormValues = {
  item: string
  direction: "expense" | "income"
  amount: number
  category1: string
  category2: string
  accountId?: string
  note?: string
  frequency: RecurringRule["frequency"]
  interval: number
  dayOfMonth?: number
  startDate: dayjs.Dayjs
  endDate?: dayjs.Dayjs | null
  autoCreate: boolean
  enabled: boolean
}

const frequencyOptions = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "yearly", label: "每年" },
]

const scheduleLabel = (rule: RecurringRule) => {
  const unit =
    frequencyOptions.find((row) => row.value === rule.frequency)?.label ||
    rule.frequency
  const base =
    rule.interval > 1 ? `每 ${rule.interval} ${unit.replace("每", "")}` : unit
  if (
    (rule.frequency === "monthly" || rule.frequency === "yearly") &&
    rule.dayOfMonth
  )
    return `${base} · ${rule.dayOfMonth} 日`
  return base
}

export function RecurringPage() {
  const pickerInputReadOnly = usePickerInputReadOnly()
  const searchableSelect = useSearchableSelect()
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()
  const [editing, setEditing] = useState<RecurringRule | null | undefined>(
    undefined,
  )
  const [form] = Form.useForm<FormValues>()
  const { data, isLoading } = useQuery({
    queryKey: ["recurring"],
    queryFn: () => api<RecurringData>("/api/recurring"),
  })
  const { data: dictionaries } = useQuery({
    queryKey: ["dictionaries"],
    queryFn: () => api<Dictionaries>("/api/dictionaries"),
  })
  const categories = dictionaries?.categories || []
  const primaryOptions = useMemo(
    () => [...new Set(categories.map((row) => row.category1))],
    [categories],
  )
  const selectedPrimary = Form.useWatch("category1", form)
  const selectedFrequency = Form.useWatch("frequency", form)
  const secondaryOptions = useMemo(
    () => [
      ...new Set(
        categories
          .filter((row) => row.category1 === selectedPrimary)
          .map((row) => row.category2),
      ),
    ],
    [categories, selectedPrimary],
  )
  const accountOptions = useMemo(() => {
    const options = [
      { value: UNACCOUNTED_ACCOUNT_ID, label: UNACCOUNTED_ACCOUNT_LABEL },
      ...(dictionaries?.accounts || []).map((account) => ({
        value: account.id,
        label: `${account.name}${account.isDefault ? "（默认）" : ""}`,
      })),
    ]
    return options
  }, [dictionaries?.accounts])
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recurring"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
    ])
  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const body = {
        item: values.item,
        direction: values.direction,
        amount: values.amount,
        category1: values.category1,
        category2: values.category2,
        accountId: isUnaccountedAccountId(values.accountId)
          ? null
          : values.accountId,
        note: values.note || "",
        frequency: values.frequency,
        interval: values.interval,
        dayOfMonth:
          values.frequency === "monthly" || values.frequency === "yearly"
            ? values.dayOfMonth || values.startDate.date()
            : null,
        startDate: editing
          ? editing.startDate
          : values.startDate.format("YYYY-MM-DD"),
        endDate: values.endDate ? values.endDate.format("YYYY-MM-DD") : null,
        autoCreate: values.autoCreate,
        enabled: values.enabled,
        ...(editing
          ? { nextRunDate: values.startDate.format("YYYY-MM-DD") }
          : {}),
      }
      return editing
        ? api(`/api/recurring/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : api("/api/recurring", {
            method: "POST",
            body: JSON.stringify(body),
          })
    },
    onSuccess: async () => {
      setEditing(undefined)
      form.resetFields()
      await refresh()
      message.success(editing ? "定期规则已更新" : "定期规则已创建")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const action = useMutation({
    mutationFn: ({ url, method }: { url: string; method: string }) =>
      api(url, { method }),
    onSuccess: async (_result, variables) => {
      await refresh()
      if (variables.url.includes("/confirm")) message.success("已确认入账")
      else if (variables.url.includes("/dismiss")) message.success("已忽略本期")
      else if (variables.url.includes("/generate")) message.success("已立即生成")
      else if (variables.url.includes("/skip")) message.success("已跳过本期")
      else message.success("操作成功")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue({
      item: "",
      direction: "expense",
      amount: undefined,
      category1: primaryOptions[0],
      category2: undefined,
      accountId: UNACCOUNTED_ACCOUNT_ID,
      note: "",
      frequency: "monthly",
      interval: 1,
      dayOfMonth: dayjs().date(),
      startDate: dayjs(),
      endDate: null,
      autoCreate: true,
      enabled: true,
    })
  }
  const openEdit = (rule: RecurringRule) => {
    setEditing(rule)
    form.setFieldsValue({
      item: rule.item,
      direction: rule.direction,
      amount: rule.amount,
      category1: rule.category1,
      category2: rule.category2,
      accountId: rule.accountId || UNACCOUNTED_ACCOUNT_ID,
      note: rule.note,
      frequency: rule.frequency,
      interval: rule.interval,
      dayOfMonth: rule.dayOfMonth || dayjs(rule.startDate).date(),
      startDate: dayjs(rule.nextRunDate),
      endDate: rule.endDate ? dayjs(rule.endDate) : null,
      autoCreate: rule.autoCreate,
      enabled: rule.enabled,
    })
  }
  const remove = (rule: RecurringRule) =>
    modal.confirm({
      title: `删除“${rule.item}”`,
      content: "只会删除定期规则，已经生成的账目不会受影响。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await api(`/api/recurring/${rule.id}`, { method: "DELETE" })
        await refresh()
        message.success("定期规则已删除")
      },
    })
  const setEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api(`/api/recurring/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: async (_result, variables) => {
      await refresh()
      message.success(variables.enabled ? "已启用" : "已暂停")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const primaryIcon = (name: string) =>
    categories.find((row) => row.category1 === name)?.primaryIcon

  return (
    <div className="page-stack recurring-page">
      <Card className="recurring-intro">
        <Flex justify="space-between" align="flex-start" gap={16} wrap>
          <div>
            <Typography.Text className="statement-eyebrow">
              RECURRING · 定期账单
            </Typography.Text>
            <Typography.Title level={4}>房租、会员、话费，按期自动入账</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              到日自动生成账目；也可改成「先提醒、确认后再入账」。服务重启后会补齐漏掉的周期。
            </Typography.Paragraph>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建规则
          </Button>
        </Flex>
      </Card>

      {Boolean(data?.pending.length) && (
        <Card title="待确认入账" loading={isLoading}>
          <List
            dataSource={data?.pending || []}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    key="ok"
                    type="link"
                    icon={<CheckOutlined />}
                    loading={action.isPending}
                    onClick={() =>
                      action.mutate({
                        url: `/api/recurring/pending/${item.id}/confirm`,
                        method: "POST",
                      })
                    }
                  >
                    确认
                  </Button>,
                  <Button
                    key="no"
                    type="link"
                    danger
                    icon={<CloseOutlined />}
                    loading={action.isPending}
                    onClick={() =>
                      action.mutate({
                        url: `/api/recurring/pending/${item.id}/dismiss`,
                        method: "POST",
                      })
                    }
                  >
                    忽略
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={`${item.item || "定期账单"} · ${item.runDate}`}
                  description={`${item.category1}/${item.category2} · ${
                    item.direction === "income" ? "收入" : "支出"
                  } ${money(item.amount || 0)}`}
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      {Boolean(data?.due.length || data?.upcoming.length) && (
        <Card title="近期提醒" loading={isLoading}>
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {data?.due.map((rule) => (
              <Alert
                key={`due-${rule.id}`}
                type="warning"
                showIcon
                message={`${rule.item} 已到期（${rule.nextRunDate}）`}
                description={
                  rule.autoCreate
                    ? "系统会自动入账；也可立即生成或跳过本期。"
                    : "当前为提醒模式，请确认后入账。"
                }
                action={
                  <Space>
                    <Button
                      size="small"
                      onClick={() =>
                        action.mutate({
                          url: `/api/recurring/${rule.id}/generate`,
                          method: "POST",
                        })
                      }
                    >
                      立即生成
                    </Button>
                    <Button
                      size="small"
                      onClick={() =>
                        action.mutate({
                          url: `/api/recurring/${rule.id}/skip`,
                          method: "POST",
                        })
                      }
                    >
                      跳过
                    </Button>
                  </Space>
                }
              />
            ))}
            {data?.upcoming
              .filter((rule) => !data.due.some((due) => due.id === rule.id))
              .map((rule) => (
                <Alert
                  key={`up-${rule.id}`}
                  type="info"
                  showIcon
                  message={`${rule.item} 将于 ${rule.nextRunDate} 生成`}
                  description={`${scheduleLabel(rule)} · ${
                    rule.direction === "income" ? "收入" : "支出"
                  } ${money(rule.amount)}`}
                />
              ))}
          </Space>
        </Card>
      )}

      <Card
        title={
          <Space>
            <RetweetOutlined />
            <span>全部规则</span>
          </Space>
        }
        extra={
          <Typography.Text type="secondary">
            {data?.rules.length || 0} 条
          </Typography.Text>
        }
        loading={isLoading}
      >
        {data?.rules.length ? (
          <List
            dataSource={data.rules}
            renderItem={(rule) => (
              <List.Item
                className="recurring-rule-item"
                actions={[
                  <Dropdown
                    key="more"
                    menu={{
                      items: [
                        {
                          key: "edit",
                          icon: <EditOutlined />,
                          label: "编辑",
                          onClick: () => openEdit(rule),
                        },
                        {
                          key: "generate",
                          icon: <PlayCircleOutlined />,
                          label: "立即生成本期",
                          onClick: () =>
                            action.mutate({
                              url: `/api/recurring/${rule.id}/generate`,
                              method: "POST",
                            }),
                        },
                        {
                          key: "skip",
                          icon: <StepForwardOutlined />,
                          label: "跳过本期",
                          onClick: () =>
                            action.mutate({
                              url: `/api/recurring/${rule.id}/skip`,
                              method: "POST",
                            }),
                        },
                        {
                          key: "toggle",
                          icon: rule.enabled ? (
                            <PauseCircleOutlined />
                          ) : (
                            <PlayCircleOutlined />
                          ),
                          label: rule.enabled ? "暂停" : "启用",
                          onClick: () =>
                            setEnabled.mutate({
                              id: rule.id,
                              enabled: !rule.enabled,
                            }),
                        },
                        { type: "divider" },
                        {
                          key: "delete",
                          icon: <DeleteOutlined />,
                          danger: true,
                          label: "删除",
                          onClick: () => remove(rule),
                        },
                      ],
                    }}
                  >
                    <Button type="text" icon={<MoreOutlined />} />
                  </Dropdown>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <CategoryIcon
                      name={primaryIcon(rule.category1) || "folder"}
                      size="large"
                    />
                  }
                  title={
                    <Flex align="center" gap={8} wrap>
                      <span>{rule.item}</span>
                      {!rule.enabled && <Tag>已暂停</Tag>}
                      {!rule.autoCreate && <Tag color="gold">需确认</Tag>}
                      <Tag bordered={false}>{scheduleLabel(rule)}</Tag>
                    </Flex>
                  }
                  description={
                    <Space direction="vertical" size={2}>
                      <Typography.Text type="secondary">
                        {rule.category1} / {rule.category2}
                        {rule.accountName ? ` · ${rule.accountName}` : ""}
                      </Typography.Text>
                      <Typography.Text>
                        {rule.direction === "income" ? "收入" : "支出"}{" "}
                        {money(rule.amount)}
                        {" · 下次 "}
                        {rule.nextRunDate}
                      </Typography.Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有定期账单"
          >
            <Button type="primary" onClick={openCreate}>
              新建第一条
            </Button>
          </Empty>
        )}
      </Card>

      <Drawer
        title={editing ? "编辑定期规则" : "新建定期规则"}
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        width={420}
        destroyOnHidden
        extra={
          <Button
            type="primary"
            loading={save.isPending}
            onClick={() => form.submit()}
          >
            保存
          </Button>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => save.mutate(values)}
        >
          <Form.Item name="item" label="项目" rules={[{ required: true }]}>
            <Input maxLength={80} placeholder="例如：房租、Spotify 会员" />
          </Form.Item>
          <Form.Item name="direction" label="类型" rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              options={[
                { value: "expense", label: "支出" },
                { value: "income", label: "收入" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label="金额"
            rules={[{ required: true, message: "请填写金额" }]}
          >
            <AmountCalculator />
          </Form.Item>
          <Form.Item
            name="category1"
            label="一级分类"
            rules={[{ required: true }]}
          >
            <Select
              options={primaryOptions.map((value) => ({ value, label: value }))}
              showSearch={searchableSelect}
              onChange={() => form.setFieldValue("category2", undefined)}
            />
          </Form.Item>
          <Form.Item
            name="category2"
            label="二级分类"
            rules={[{ required: true }]}
          >
            <Select
              options={secondaryOptions.map((value) => ({
                value,
                label: value,
              }))}
              showSearch={searchableSelect}
            />
          </Form.Item>
          <Form.Item name="accountId" label="账户">
            <Select options={accountOptions} showSearch={searchableSelect} />
          </Form.Item>
          <Form.Item
            name="frequency"
            label="频率"
            rules={[{ required: true }]}
          >
            <Select options={frequencyOptions} />
          </Form.Item>
          <Form.Item
            name="interval"
            label="间隔"
            rules={[{ required: true }]}
            extra="例如每月填 1，每两月填 2"
          >
            <InputNumber min={1} max={365} style={{ width: "100%" }} />
          </Form.Item>
          {(selectedFrequency === "monthly" ||
            selectedFrequency === "yearly") && (
            <Form.Item
              name="dayOfMonth"
              label="每月日期"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={31} style={{ width: "100%" }} />
            </Form.Item>
          )}
          <Form.Item
            name="startDate"
            label={editing ? "下次生成日期" : "开始日期"}
            rules={[{ required: true }]}
          >
            <DatePicker
              allowClear={false}
              inputReadOnly={pickerInputReadOnly}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="endDate" label="结束日期（可选）">
            <DatePicker
              inputReadOnly={pickerInputReadOnly}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            name="autoCreate"
            label="到期自动入账"
            valuePropName="checked"
            extra="关闭后仅生成提醒，需手动确认才会写入账目"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}
