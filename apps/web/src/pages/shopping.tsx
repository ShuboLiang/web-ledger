import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ShoppingOutlined,
} from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  App,
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Typography,
} from "antd"
import { useState } from "react"
import { api, type ShoppingItem, type ShoppingOverview } from "@/lib/api"
import { money } from "@/lib/utils"

type ItemValues = {
  name: string
  unitPrice: number
  quantity: number
  note?: string
}

export function ShoppingPage() {
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<ItemValues>()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ShoppingItem | null>(null)
  const [filter, setFilter] = useState("pending")
  const price = Form.useWatch("unitPrice", form)
  const quantity = Form.useWatch("quantity", form)
  const query = useQuery({
    queryKey: ["shopping"],
    queryFn: () => api<ShoppingOverview>("/api/shopping"),
  })
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["shopping"] })
  const save = useMutation({
    mutationFn: (values: ItemValues) =>
      api(editing ? `/api/shopping/${editing.id}` : "/api/shopping", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      setOpen(false)
      await refresh()
      message.success(editing ? "购物计划已更新" : "已加入购物计划")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const toggle = useMutation({
    mutationFn: (item: ShoppingItem) =>
      api(`/api/shopping/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ purchased: !item.purchased }),
      }),
    onSuccess: async (_result, item) => {
      await refresh()
      message.success(item.purchased ? "已移回待购买" : "已标记购买")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const showForm = (item?: ShoppingItem) => {
    setEditing(item || null)
    form.resetFields()
    form.setFieldsValue(
      item || { name: "", unitPrice: undefined, quantity: 1, note: "" },
    )
    setOpen(true)
  }
  const remove = (item: ShoppingItem) =>
    modal.confirm({
      title: `删除「${item.name}」？`,
      content: "删除后无法恢复，总价会重新计算。",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`/api/shopping/${item.id}`, { method: "DELETE" })
          await refresh()
          message.success("已删除购物计划")
        } catch (error) {
          message.error((error as Error).message)
          throw error
        }
      },
    })
  if (query.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />
  if (!query.data)
    return (
      <Card>
        <Empty description="购物计划加载失败">
          <Button onClick={() => query.refetch()}>重新加载</Button>
        </Empty>
      </Card>
    )
  const { items, summary } = query.data
  const visible = items.filter(
    (item) => filter === "all" || item.purchased === (filter === "purchased"),
  )
  const empty = items.length === 0
  return (
    <div className="page-stack shopping-page">
      <Card>
        <Flex justify="space-between" align="center" gap={16} wrap>
          <div>
            <Typography.Title level={4}>购物计划</Typography.Title>
            <Typography.Text type="secondary">
              先记下想买的东西，看看一共需要多少钱。
            </Typography.Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => showForm()}
          >
            添加想买的
          </Button>
        </Flex>
        <div className="shopping-summary" aria-live="polite">
          <Statistic
            title={`待购总价 · ${summary.pendingCount} 项`}
            value={summary.pendingTotal}
            precision={2}
            prefix="¥"
          />
          <div>
            <Typography.Text type="secondary">
              已购买 · {summary.purchasedCount} 项
            </Typography.Text>
            <div className="shopping-summary-value">
              {money(summary.purchasedTotal)}
            </div>
          </div>
          <div>
            <Typography.Text type="secondary">清单总价</Typography.Text>
            <div className="shopping-summary-value">{money(summary.total)}</div>
          </div>
        </div>
        <Typography.Text type="secondary">
          金额按预计单价 ×
          数量计算。标记已购买只更新清单；实际花费请另记一笔账。
        </Typography.Text>
      </Card>
      <Card>
        <Segmented
          aria-label="筛选购买状态"
          value={filter}
          onChange={setFilter}
          options={[
            { label: `待购买 (${summary.pendingCount})`, value: "pending" },
            { label: `已购买 (${summary.purchasedCount})`, value: "purchased" },
            { label: "全部", value: "all" },
          ]}
        />
        {visible.length === 0 ? (
          <Empty
            image={<ShoppingOutlined className="shopping-empty-icon" />}
            description={
              empty
                ? "还没有购物计划，从第一件想买的东西开始吧。"
                : filter === "purchased"
                  ? "还没有标记已购买的物品。"
                  : "待购清单已清空，想买新的再加进来。"
            }
          >
            {empty && (
              <Button onClick={() => showForm()}>添加第一件物品</Button>
            )}
          </Empty>
        ) : (
          <ul className="shopping-list">
            {visible.map((item) => (
              <li
                key={item.id}
                className={`shopping-row${item.purchased ? " is-purchased" : ""}`}
              >
                <Checkbox
                  checked={item.purchased}
                  disabled={toggle.isPending}
                  onChange={() => toggle.mutate(item)}
                  aria-label={`${item.purchased ? "移回待购买" : "标记已购买"}：${item.name}`}
                />
                <div className="shopping-item-detail">
                  <Typography.Text strong className="shopping-item-name">
                    {item.name}
                  </Typography.Text>
                  <div>
                    <Typography.Text type="secondary">
                      {money(item.unitPrice)} × {item.quantity}
                      {item.purchased ? " · 已购买" : ""}
                    </Typography.Text>
                  </div>
                  {item.note && (
                    <Typography.Paragraph
                      type="secondary"
                      className="shopping-note"
                    >
                      {item.note}
                    </Typography.Paragraph>
                  )}
                </div>
                <div className="shopping-item-total">
                  {money(item.subtotal)}
                </div>
                <Space className="shopping-actions" size={0}>
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    aria-label={`编辑：${item.name}`}
                    onClick={() => showForm(item)}
                  />
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`删除：${item.name}`}
                    onClick={() => remove(item)}
                  />
                </Space>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Drawer
        title={editing ? "编辑购物计划" : "添加想买的"}
        open={open}
        onClose={() => !save.isPending && setOpen(false)}
        width={440}
        closable={!save.isPending}
        maskClosable={!save.isPending}
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
          disabled={save.isPending}
          requiredMark={false}
        >
          <Form.Item
            name="name"
            label="想买什么"
            rules={[
              { required: true, whitespace: true, message: "填一下想买的物品" },
              { max: 80, message: "物品名称不能超过 80 个字" },
            ]}
          >
            <Input placeholder="例如：降噪耳机" maxLength={80} />
          </Form.Item>
          <Form.Item
            name="unitPrice"
            label="预计单价（元）"
            rules={[
              { required: true, message: "填一下预计单价" },
              {
                type: "number",
                min: 0,
                max: 99999999.99,
                message: "单价需在 0–99999999.99 元之间",
              },
            ]}
          >
            <InputNumber
              min={0}
              max={99999999.99}
              precision={2}
              inputMode="decimal"
              placeholder="0.00"
              className="shopping-number-input"
            />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="数量"
            rules={[
              { required: true, message: "填一下购买数量" },
              {
                type: "integer",
                min: 1,
                max: 9999,
                message: "数量需为 1–9999 的整数",
              },
            ]}
          >
            <InputNumber
              min={1}
              max={9999}
              precision={0}
              inputMode="numeric"
              className="shopping-number-input"
            />
          </Form.Item>
          <Form.Item
            name="note"
            label="备注（选填）"
            rules={[{ max: 500, message: "备注不能超过 500 个字" }]}
          >
            <Input.TextArea
              rows={3}
              maxLength={500}
              showCount
              placeholder="型号、颜色，或准备在哪里买"
            />
          </Form.Item>
          <div className="shopping-form-total" aria-live="polite">
            <Typography.Text type="secondary">这件物品预计花费</Typography.Text>
            <Typography.Title level={3}>
              {money((Math.round((price || 0) * 100) * (quantity || 0)) / 100)}
            </Typography.Title>
          </div>
        </Form>
      </Drawer>
    </div>
  )
}
