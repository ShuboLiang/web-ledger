import { RobotOutlined } from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { api, type Dictionaries, type Transaction } from "@/lib/api"
import { CategoryIcon } from "@/components/category-icon"
import { DatePicker } from "@/components/sheet-date-picker"
import { usePickerInputReadOnly, useSearchableSelect } from "@/lib/use-viewport"

type FormValues = {
  date: any
  direction: "expense" | "income"
  amount: number
  item: string
  category1: string
  category2: string
  accountId?: string
  tagIds?: string[]
  note?: string
}

export function TransactionDrawer({
  open,
  onOpenChange,
  record,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record?: Transaction | null
}) {
  const [form] = Form.useForm<FormValues>()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const searchableSelect = useSearchableSelect()
  const pickerInputReadOnly = usePickerInputReadOnly()
  const { data } = useQuery({
    queryKey: ["dictionaries"],
    queryFn: () => api<Dictionaries>("/api/dictionaries"),
  })
  const categories = data?.categories || []
  const primaryOptions = useMemo(
    () => [...new Set(categories.map((row) => row.category1))],
    [categories],
  )
  const selectedPrimary = Form.useWatch("category1", form)
  const selectedDirection = Form.useWatch("direction", form)
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
    const options = (data?.accounts || []).map((account) => ({
      value: account.id,
      label: `${account.name}${account.isDefault ? "（默认）" : ""}`,
    }))
    if (
      record?.accountId &&
      !options.some((option) => option.value === record.accountId)
    ) {
      options.push({
        value: record.accountId,
        label: `${record.accountName || "原账户"}（已停用）`,
      })
    }
    return options
  }, [data?.accounts, record?.accountId, record?.accountName])
  useEffect(() => {
    if (!open) return
    const category1 =
      record?.category1 ||
      (primaryOptions.includes("餐饮") ? "餐饮" : primaryOptions[0]) ||
      ""
    const category2 =
      record?.category2 ||
      categories.find((row) => row.category1 === category1)?.category2 ||
      ""
    form.setFieldsValue({
      date: dayjs(record?.date),
      direction: record
        ? record.amount > 0
          ? "income"
          : "expense"
        : "expense",
      amount: record ? Math.abs(record.amount) : undefined,
      item: record?.item || "",
      category1,
      category2,
      accountId:
        record?.accountId ||
        data?.accounts?.find((account) => account.isDefault)?.id ||
        data?.accounts?.[0]?.id,
      tagIds: record?.tagIds || [],
      note: record?.note || "",
    })
  }, [open, record, data])
  const save = useMutation({
    mutationFn: (values: FormValues) =>
      api(record ? `/api/transactions/${record.id}` : "/api/transactions", {
        method: record ? "PUT" : "POST",
        body: JSON.stringify({
          ...values,
          date: values.date.format("YYYY-MM-DD"),
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      message.success(record ? "账目已更新" : "账目已记录")
      onOpenChange(false)
    },
    onError: (error: Error) => message.error(error.message),
  })
  const primaryChoices = [
    ...primaryOptions.map((value) => ({
      label: (
        <span className="category-select-label">
          <CategoryIcon
            name={
              categories.find((row) => row.category1 === value)?.primaryIcon
            }
            size="small"
          />
          {value}
        </span>
      ),
      value,
    })),
    ...(record?.category1 && !primaryOptions.includes(record.category1)
      ? [{ label: `${record.category1}（已停用）`, value: record.category1 }]
      : []),
  ]
  const secondaryChoices = [
    ...secondaryOptions.map((value) => ({
      label: (
        <span className="category-select-label">
          <CategoryIcon
            name={
              categories.find(
                (row) =>
                  row.category1 === selectedPrimary && row.category2 === value,
              )?.secondaryIcon
            }
            size="small"
          />
          {value}
        </span>
      ),
      value,
    })),
    ...(record?.category1 === selectedPrimary &&
    record?.category2 &&
    !secondaryOptions.includes(record.category2)
      ? [{ label: `${record.category2}（已停用）`, value: record.category2 }]
      : []),
  ]
  return (
    <Drawer
      title={record ? "编辑账目" : "记一笔"}
      open={open}
      width={520}
      destroyOnHidden
      onClose={() => onOpenChange(false)}
      extra={
        <Typography.Text type="secondary">保存后自动更新统计</Typography.Text>
      }
      footer={
        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            type="primary"
            loading={save.isPending}
            onClick={() => form.submit()}
          >
            保存账目
          </Button>
        </Space>
      }
    >
      {!record && (
        <Button
          block
          size="large"
          icon={<RobotOutlined />}
          className="ai-entry-button"
          onClick={() => {
            onOpenChange(false)
            navigate("/ai")
          }}
        >
          使用 AI 自然语言记账
        </Button>
      )}
      <Form
        form={form}
        layout="vertical"
        requiredMark="optional"
        onFinish={(values) => save.mutate(values)}
        style={{ marginTop: 20 }}
      >
        <div className="form-grid-2">
          <Form.Item
            label="日期"
            name="date"
            rules={[{ required: true, message: "请选择日期" }]}
          >
            <DatePicker
              style={{ width: "100%" }}
              inputReadOnly={pickerInputReadOnly}
            />
          </Form.Item>
          <Form.Item label="收支" name="direction" rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: "支出", value: "expense" },
                { label: "收入", value: "income" },
              ]}
            />
          </Form.Item>
        </div>
        <Form.Item
          label="金额"
          name="amount"
          rules={[
            { required: true, message: "请输入金额" },
            { type: "number", min: 0.01, message: "金额必须大于 0" },
          ]}
        >
          <InputNumber
            min={0.01}
            precision={2}
            prefix="¥"
            placeholder="0.00"
            style={{ width: "100%" }}
          />
        </Form.Item>
        <Form.Item
          label="项目"
          name="item"
          rules={[{ required: true, whitespace: true, max: 80 }]}
        >
          <Input placeholder="例如：午饭" list="project-options" />
        </Form.Item>
        <datalist id="project-options">
          {data?.projects.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        <div className="form-grid-2">
          <Form.Item
            label="一级分类"
            name="category1"
            rules={[{ required: true }]}
          >
            <Select
              aria-label="一级分类"
              placeholder="请选择"
              options={primaryChoices}
              onChange={(category1) =>
                form.setFieldValue(
                  "category2",
                  categories.find((row) => row.category1 === category1)
                    ?.category2,
                )
              }
            />
          </Form.Item>
          <Form.Item
            label="二级分类"
            name="category2"
            rules={[{ required: true }]}
          >
            <Select
              aria-label="二级分类"
              disabled={!selectedPrimary}
              placeholder="请先选择一级分类"
              options={secondaryChoices}
            />
          </Form.Item>
        </div>
        <Form.Item
          label={selectedDirection === "income" ? "收款账户" : "付款账户"}
          name="accountId"
          rules={[{ required: true, message: "请选择账户" }]}
          extra={
            accountOptions.length > 1
              ? "默认账户已预选，也可以改为本次实际使用的账户。"
              : "当前只有一个可记账账户，可到账户管理中新增。"
          }
        >
          <Select
            showSearch={searchableSelect}
            optionFilterProp="label"
            placeholder="请选择账户"
            options={accountOptions}
          />
        </Form.Item>
        <Form.Item
          label="标签"
          name="tagIds"
          extra="标签记录用途、场景或人物，例如“人情请客”“朋友聚会”；最多选择 8 个。"
        >
          <Select
            mode="multiple"
            allowClear
            showSearch={searchableSelect}
            popupClassName="transaction-tag-popup"
            popupMatchSelectWidth
            maxTagCount="responsive"
            placeholder={
              data?.tags?.length ? "可选多个标签" : "请先到标签页面新增"
            }
            options={(data?.tags || []).map((tag) => ({
              value: tag.id,
              label: tag.name,
            }))}
            onChange={(values) => {
              if (values.length > 8) {
                message.warning("一笔账最多选择 8 个标签")
                form.setFieldValue("tagIds", values.slice(0, 8))
              }
            }}
          />
        </Form.Item>
        <Form.Item label="备注" name="note" rules={[{ max: 500 }]}>
          <Input.TextArea rows={4} showCount maxLength={500} />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
