import {
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  PoweroffOutlined,
  TagsOutlined,
} from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  List,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  api,
  type LedgerTag,
  type TagAnalytics,
  type TagOverview,
} from "@/lib/api"
import { money } from "@/lib/utils"
import { DatePicker } from "@/components/sheet-date-picker"
import { usePickerInputReadOnly } from "@/lib/use-viewport"

const tagColors = [
  "#0f766e",
  "#287d67",
  "#3d6672",
  "#315f77",
  "#8a6428",
  "#a4513f",
  "#80558c",
  "#636b43",
]

export function TagsPage() {
  const screens = Grid.useBreakpoint()
  const pickerInputReadOnly = usePickerInputReadOnly()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"))
  const [scope, setScope] = useState<"month" | "year">("month")
  const [selectedId, setSelectedId] = useState("")
  const [editing, setEditing] = useState<LedgerTag | null | undefined>(
    undefined,
  )
  const [form] = Form.useForm()
  const period = scope === "year" ? month.slice(0, 4) : month
  const periodQuery = `scope=${scope}&period=${period}`
  const overview = useQuery({
    queryKey: ["tags", scope, period],
    queryFn: () => api<TagOverview>(`/api/tags?${periodQuery}`),
  })
  const selected = overview.data?.tags.find((tag) => tag.id === selectedId)
  const analytics = useQuery({
    queryKey: ["tag-analytics", selectedId, scope, period],
    queryFn: () => api<TagAnalytics>(`/api/tags/${selectedId}?${periodQuery}`),
    enabled: Boolean(selectedId),
  })
  useEffect(() => {
    if (!overview.data?.tags.length) return setSelectedId("")
    if (!overview.data.tags.some((tag) => tag.id === selectedId))
      setSelectedId(
        overview.data.tags.find((tag) => tag.enabled)?.id ||
          overview.data.tags[0].id,
      )
  }, [overview.data, selectedId])
  const action = useMutation({
    mutationFn: ({ url, method, body }: any) =>
      api<any>(url, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: async (_result, variables) => {
      setEditing(undefined)
      form.resetFields()
      await queryClient.invalidateQueries()
      message.success(variables.method === "POST" ? "标签已新增" : "标签已更新")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue({ name: "", color: tagColors[0] })
  }
  const openEdit = (tag: LedgerTag) => {
    setEditing(tag)
    form.setFieldsValue({ name: tag.name, color: tag.color })
  }
  const remove = (tag: LedgerTag) =>
    modal.confirm({
      title: `删除“${tag.name}”标签`,
      content: `会从 ${tag.usageCount} 笔历史账目中移除该标签，账目本身不会删除。`,
      okText: "删除标签",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await api(`/api/tags/${tag.id}`, { method: "DELETE" })
        setSelectedId("")
        await queryClient.invalidateQueries()
        message.success("标签已删除，历史账目保持不变")
      },
    })
  const maxSeries = Math.max(
    1,
    ...(analytics.data?.series.map((item) => item.amount) || []),
  )
  const maxCategory = Math.max(
    1,
    ...(analytics.data?.categories.map((item) => item.amount) || []),
  )
  const periodLabel =
    scope === "year" ? `${period}年` : dayjs(`${month}-01`).format("YYYY年M月")
  const summary = analytics.data?.summary
  const visibleRecords = useMemo(
    () => analytics.data?.records.slice(0, screens.md ? 8 : 5) || [],
    [analytics.data?.records, screens.md],
  )
  return (
    <div className="page-stack tag-page">
      <Card className="tag-guide-card">
        <Flex
          justify="space-between"
          align={screens.md ? "center" : "flex-start"}
          gap={16}
          vertical={!screens.md}
        >
          <div>
            <Typography.Text className="statement-eyebrow">
              CONTEXT LENS · 消费视角
            </Typography.Text>
            <Typography.Title level={4}>
              分类看去向，标签看原因
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              一笔账可以带多个标签。每个标签独立分析，同一笔钱不会在总支出中重复计算。
            </Typography.Paragraph>
          </div>
          <Space className="tag-guide-actions">
            <Segmented
              value={scope}
              options={[
                { label: "按月", value: "month" },
                { label: "按年", value: "year" },
              ]}
              onChange={(value) => setScope(value as "month" | "year")}
            />
            <DatePicker
              picker={scope}
              allowClear={false}
              inputReadOnly={pickerInputReadOnly}
              value={dayjs(`${month}-01`)}
              format={scope === "year" ? "YYYY年" : "YYYY年M月"}
              onChange={(value) => value && setMonth(value.format("YYYY-MM"))}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增标签
            </Button>
          </Space>
        </Flex>
      </Card>

      <Card
        className="tag-selector-card"
        title="我的标签"
        extra={
          <Typography.Text type="secondary">
            {overview.data?.tags.length || 0} 个
          </Typography.Text>
        }
      >
        {overview.isLoading ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : overview.data?.tags.length ? (
          <div className="tag-ribbon" role="list" aria-label="标签列表">
            {overview.data.tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                role="listitem"
                className={`tag-ribbon-item ${selectedId === tag.id ? "active" : ""} ${tag.enabled ? "" : "disabled"}`}
                style={{ "--tag-color": tag.color } as React.CSSProperties}
                onClick={() => setSelectedId(tag.id)}
              >
                <span className="tag-ribbon-dot" />
                <span className="tag-ribbon-copy">
                  <b>{tag.name}</b>
                  <small>
                    {tag.enabled
                      ? `${periodLabel} ${money(tag.expense)}`
                      : "已停用"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Empty description="还没有标签，用“人情请客”或“朋友聚会”开始">
            <Button type="primary" onClick={openCreate}>
              新增第一个标签
            </Button>
          </Empty>
        )}
      </Card>

      {selected && (
        <>
          <Card className="tag-focus-card">
            <Flex justify="space-between" align="center" gap={12} wrap>
              <Flex align="center" gap={10}>
                <span
                  className="tag-focus-mark"
                  style={{ background: selected.color }}
                >
                  <TagsOutlined />
                </span>
                <div>
                  <Typography.Title level={5}>{selected.name}</Typography.Title>
                  <Typography.Text type="secondary">
                    累计关联 {selected.usageCount} 笔 · {periodLabel}视图
                  </Typography.Text>
                </div>
              </Flex>
              <Space>
                <Button
                  icon={<PoweroffOutlined />}
                  onClick={() =>
                    action.mutate({
                      url: `/api/tags/${selected.id}`,
                      method: "PATCH",
                      body: { enabled: !selected.enabled },
                    })
                  }
                >
                  {selected.enabled ? "停用" : "启用"}
                </Button>
                <Button
                  icon={<EditOutlined />}
                  onClick={() => openEdit(selected)}
                >
                  编辑
                </Button>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`删除标签${selected.name}`}
                  onClick={() => remove(selected)}
                />
              </Space>
            </Flex>
          </Card>

          {analytics.isLoading ? (
            <Card>
              <Skeleton active paragraph={{ rows: 8 }} />
            </Card>
          ) : analytics.data ? (
            <>
              <div className="tag-summary-grid">
                <Card>
                  <Statistic
                    title="标签支出"
                    value={summary?.expense || 0}
                    precision={2}
                    prefix="¥"
                  />
                </Card>
                <Card>
                  <Statistic
                    title="相关账目"
                    value={summary?.count || 0}
                    suffix="笔"
                  />
                </Card>
                <Card>
                  <Statistic
                    title="平均每笔支出"
                    value={summary?.averageExpense || 0}
                    precision={2}
                    prefix="¥"
                  />
                </Card>
              </div>
              <div className="tag-analysis-grid">
                <Card title="消费节奏" className="tag-bars-card">
                  {analytics.data.series.length ? (
                    <div className="tag-bar-list">
                      {analytics.data.series.map((item) => (
                        <div className="tag-bar-row" key={item.date}>
                          <span>
                            {dayjs(
                              scope === "year" ? `${item.date}-01` : item.date,
                            ).format(scope === "year" ? "M月" : "M/D")}
                          </span>
                          <span className="tag-bar-track">
                            <span
                              className="tag-bar-fill"
                              style={{
                                width: item.amount
                                  ? `${Math.max(4, (item.amount / maxSeries) * 100)}%`
                                  : 0,
                                background: selected.color,
                              }}
                            />
                          </span>
                          <b>{money(item.amount)}</b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={`${periodLabel}还没有相关支出`}
                    />
                  )}
                </Card>
                <Card title="钱花到了哪里" className="tag-bars-card">
                  {analytics.data.categories.length ? (
                    <div className="tag-bar-list">
                      {analytics.data.categories.slice(0, 6).map((item) => (
                        <div className="tag-bar-row category" key={item.name}>
                          <span>{item.name}</span>
                          <span className="tag-bar-track">
                            <span
                              className="tag-bar-fill"
                              style={{
                                width: `${Math.max(4, (item.amount / maxCategory) * 100)}%`,
                                background: selected.color,
                              }}
                            />
                          </span>
                          <b>{money(item.amount)}</b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="暂无分类数据"
                    />
                  )}
                </Card>
              </div>
              <Card
                title="相关账单"
                extra={
                  <Button
                    type="link"
                    onClick={() =>
                      navigate(
                        scope === "year"
                          ? `/transactions?tagId=${selected.id}&start=${period}-01-01&end=${period}-12-31`
                          : `/transactions?tagId=${selected.id}&month=${month}`,
                      )
                    }
                  >
                    查看全部 <ArrowRightOutlined />
                  </Button>
                }
                styles={{ body: { padding: visibleRecords.length ? 0 : 24 } }}
              >
                {visibleRecords.length ? (
                  <List
                    dataSource={visibleRecords}
                    renderItem={(record) => (
                      <List.Item
                        className="tag-transaction-row"
                        onClick={() =>
                          navigate(
                            scope === "year"
                              ? `/transactions?tagId=${selected.id}&start=${period}-01-01&end=${period}-12-31`
                              : `/transactions?tagId=${selected.id}&month=${month}`,
                          )
                        }
                        extra={
                          <Typography.Text
                            strong
                            type={record.amount < 0 ? "danger" : "success"}
                          >
                            {record.amount < 0 ? "−" : "+"}
                            {money(Math.abs(record.amount))}
                          </Typography.Text>
                        }
                      >
                        <List.Item.Meta
                          title={record.item}
                          description={`${record.date} · ${record.category1} / ${record.category2} · ${record.accountName || "未指定账户"}`}
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty description={`${periodLabel}没有相关账单`} />
                )}
              </Card>
            </>
          ) : null}
        </>
      )}

      <Drawer
        className="responsive-drawer tag-editor-drawer"
        title={editing ? `编辑 ${editing.name}` : "新增标签"}
        open={editing !== undefined}
        placement={screens.md ? "right" : "bottom"}
        width={460}
        height="auto"
        destroyOnHidden
        onClose={() => setEditing(undefined)}
        footer={
          <Flex justify="flex-end" gap={8}>
            <Button onClick={() => setEditing(undefined)}>取消</Button>
            <Button
              type="primary"
              loading={action.isPending}
              onClick={() => form.submit()}
            >
              保存标签
            </Button>
          </Flex>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            action.mutate({
              url: editing ? `/api/tags/${editing.id}` : "/api/tags",
              method: editing ? "PATCH" : "POST",
              body: values,
            })
          }
        >
          <Form.Item
            name="name"
            label="标签名称"
            rules={[{ required: true, whitespace: true, max: 40 }]}
          >
            <Input placeholder="例如：人情请客、朋友聚会" />
          </Form.Item>
          <Form.Item name="color" label="识别颜色" rules={[{ required: true }]}>
            <TagColorChoices />
          </Form.Item>
          <Typography.Text type="secondary">
            建议用标签记录场景、人物或目的，不要重复已有的消费分类。
          </Typography.Text>
        </Form>
      </Drawer>
    </div>
  )
}

function TagColorChoices({
  value,
  onChange,
}: {
  value?: string
  onChange?: (value: string) => void
}) {
  return (
    <div className="tag-color-choices">
      {tagColors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`选择颜色 ${color}`}
          aria-pressed={value === color}
          className={value === color ? "active" : ""}
          style={{ background: color }}
          onClick={() => onChange?.(color)}
        />
      ))}
    </div>
  )
}
