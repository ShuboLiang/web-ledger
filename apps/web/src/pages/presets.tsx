import {
  ArrowRightOutlined,
  DeleteOutlined,
  EditOutlined,
} from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  App,
  Button,
  Card,
  Cascader,
  Empty,
  Flex,
  Input,
  List,
  Modal,
  Popconfirm,
  Segmented,
  Skeleton,
  Tag,
  Typography,
} from "antd"
import dayjs, { type Dayjs } from "dayjs"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { api, type Dictionaries, type FilterPreset } from "@/lib/api"
import { encodeCatsParam, parseCatsParam } from "@/lib/category-paths"
import { presetSummary } from "@/lib/preset-summary"
import { DatePicker } from "@/components/sheet-date-picker"

const pageMeta: Record<string, { label: string; path: string; color: string }> = {
  analytics: { label: "分析页方案", path: "/analytics", color: "#176b62" },
  transactions: {
    label: "明细页方案",
    path: "/transactions",
    color: "#c99748",
  },
}
const analyticsScopes = [
  { label: "今天", value: "day" },
  { label: "本周", value: "week" },
  { label: "本月", value: "month" },
  { label: "本年", value: "year" },
]

export function PresetsPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<FilterPreset | null>(null)
  const [editName, setEditName] = useState("")
  const [editCats, setEditCats] = useState<string[][]>([])
  const [editScope, setEditScope] = useState<string>("week")
  const [editCustom, setEditCustom] = useState(false)
  const [editRange, setEditRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [editDirection, setEditDirection] = useState("all")
  const [editTimeMode, setEditTimeMode] = useState("all")
  const [editDate, setEditDate] = useState<Dayjs | null>(null)
  const [editMonth, setEditMonth] = useState<Dayjs | null>(null)
  const { data: presets, isLoading } = useQuery({
    queryKey: ["filter-presets", "all"],
    queryFn: () => api<FilterPreset[]>("/api/filter-presets"),
  })
  const { data: dictionaries } = useQuery({
    queryKey: ["dictionaries"],
    queryFn: () => api<Dictionaries>("/api/dictionaries"),
  })
  const categoryOptions = [
    ...new Set(dictionaries?.categories.map((row) => row.category1)),
  ].map((category1) => ({
    value: category1,
    label: category1,
    children: [
      ...new Set(
        dictionaries?.categories
          .filter((row) => row.category1 === category1)
          .map((row) => row.category2),
      ),
    ].map((category2) => ({ value: category2, label: category2 })),
  }))
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["filter-presets"] })
  const update = useMutation({
    mutationFn: (input: { id: string; name: string; params: string }) =>
      api<FilterPreset>(`/api/filter-presets/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: input.name, params: input.params }),
      }),
    onSuccess: () => {
      message.success("方案已更新")
      setEditing(null)
      invalidate()
    },
    onError: (error: Error) => message.error(error.message),
  })
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/api/filter-presets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      message.success("方案已删除")
      invalidate()
    },
    onError: (error: Error) => message.error(error.message),
  })
  const apply = (preset: FilterPreset) => {
    const target = pageMeta[preset.page]?.path || "/analytics"
    navigate(`${target}?${preset.params}`)
  }
  const openEditor = (preset: FilterPreset) => {
    const params = new URLSearchParams(preset.params)
    setEditing(preset)
    setEditName(preset.name)
    setEditCats(parseCatsParam(params.get("cats")))
    const start = params.get("start")
    const end = params.get("end")
    if (preset.page === "analytics") {
      setEditCustom(Boolean(start && end))
      setEditRange(start && end ? [dayjs(start), dayjs(end)] : null)
      setEditScope(params.get("scope") || "week")
    } else {
      setEditDirection(params.get("direction") || "all")
      const date = params.get("date")
      const month = params.get("month")
      setEditTimeMode(
        date ? "date" : month ? "month" : start && end ? "range" : "all",
      )
      setEditDate(date ? dayjs(date) : null)
      setEditMonth(month ? dayjs(`${month}-01`) : null)
      setEditRange(start && end ? [dayjs(start), dayjs(end)] : null)
    }
  }
  const confirmEdit = () => {
    if (!editing) return
    const name = editName.trim()
    if (!name) {
      message.warning("请输入方案名称")
      return
    }
    const next = new URLSearchParams(editing.params)
    const encoded = encodeCatsParam(editCats)
    encoded ? next.set("cats", encoded) : next.delete("cats")
    next.delete("category1")
    next.delete("category2")
    if (editing.page === "analytics") {
      if (editCustom) {
        if (!editRange) {
          message.warning("请选择自定义日期范围")
          return
        }
        next.set("start", editRange[0].format("YYYY-MM-DD"))
        next.set("end", editRange[1].format("YYYY-MM-DD"))
        next.delete("anchor")
      } else {
        next.delete("start")
        next.delete("end")
        next.set("scope", editScope)
      }
    } else {
      if (editDirection === "all") next.delete("direction")
      else next.set("direction", editDirection)
      next.delete("date")
      next.delete("month")
      next.delete("start")
      next.delete("end")
      if (editTimeMode === "date" && editDate)
        next.set("date", editDate.format("YYYY-MM-DD"))
      if (editTimeMode === "month" && editMonth)
        next.set("month", editMonth.format("YYYY-MM"))
      if (editTimeMode === "range" && editRange) {
        next.set("start", editRange[0].format("YYYY-MM-DD"))
        next.set("end", editRange[1].format("YYYY-MM-DD"))
      }
    }
    update.mutate({ id: editing.id, name, params: next.toString() })
  }
  const groups = Object.entries(pageMeta)
    .map(([page, meta]) => ({
      page,
      meta,
      items: (presets || []).filter((preset) => preset.page === page),
    }))
    .filter((group) => group.items.length > 0)
  return (
    <div className="page-stack">
      <Card
        title="筛选方案"
        extra={
          <Typography.Text type="secondary">
            在分析页或明细页保存的筛选组合
          </Typography.Text>
        }
      >
        {isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : groups.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有保存过筛选方案"
          >
            <Typography.Text type="secondary">
              在分析页或明细页选好筛选条件后，点击筛选框旁的保存按钮即可创建方案
            </Typography.Text>
          </Empty>
        ) : (
          groups.map((group) => (
            <div key={group.page} className="preset-group">
              <Typography.Title level={5} className="preset-group-title">
                <Tag color={group.meta.color}>{group.meta.label}</Tag>
                <Typography.Text type="secondary">
                  {group.items.length} 个
                </Typography.Text>
              </Typography.Title>
              <List
                dataSource={group.items}
                renderItem={(preset) => (
                  <List.Item
                    className="preset-item"
                    actions={[
                      <Button
                        key="apply"
                        type="primary"
                        ghost
                        size="small"
                        icon={<ArrowRightOutlined />}
                        onClick={() => apply(preset)}
                      >
                        应用
                      </Button>,
                      <Button
                        key="edit"
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        aria-label={`编辑${preset.name}`}
                        onClick={() => openEditor(preset)}
                      />,
                      <Popconfirm
                        key="delete"
                        title={`删除方案“${preset.name}”？`}
                        okText="删除"
                        okButtonProps={{ danger: true }}
                        cancelText="取消"
                        onConfirm={() => remove.mutate(preset.id)}
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label={`删除${preset.name}`}
                        />
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      title={preset.name}
                      description={
                        <Flex vertical gap={2}>
                          <Typography.Text type="secondary">
                            {presetSummary(preset.page, preset.params)}
                          </Typography.Text>
                          <Typography.Text type="secondary" className="preset-updated">
                            更新于 {dayjs(preset.updatedAt).format("M月D日 HH:mm")}
                          </Typography.Text>
                        </Flex>
                      }
                    />
                  </List.Item>
                )}
              />
            </div>
          ))
        )}
      </Card>
      <Modal
        title={`编辑方案${editing ? `：${editing.name}` : ""}`}
        open={Boolean(editing)}
        onOk={confirmEdit}
        onCancel={() => setEditing(null)}
        okText="保存"
        cancelText="取消"
        confirmLoading={update.isPending}
        destroyOnHidden
        width={520}
      >
        <Flex vertical gap={16} className="preset-editor">
          <Flex vertical gap={6}>
            <Typography.Text type="secondary">名称</Typography.Text>
            <Input
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              maxLength={40}
              placeholder="方案名称"
            />
          </Flex>
          <Flex vertical gap={6}>
            <Typography.Text type="secondary">分类（可多选）</Typography.Text>
            <Cascader
              multiple
              allowClear
              changeOnSelect
              maxTagCount="responsive"
              placeholder="不限制分类"
              value={editCats}
              options={categoryOptions}
              onChange={(value) => setEditCats(value as string[][] )}
            />
          </Flex>
          {editing?.page === "analytics" ? (
            <Flex vertical gap={6}>
              <Typography.Text type="secondary">统计周期</Typography.Text>
              <Segmented
                value={editCustom ? "custom" : editScope}
                onChange={(value) =>
                  value === "custom"
                    ? setEditCustom(true)
                    : (setEditCustom(false), setEditScope(String(value)))
                }
                options={[...analyticsScopes, { label: "自定义", value: "custom" }]}
              />
              {editCustom && (
                <DatePicker.RangePicker
                  value={editRange}
                  onChange={(values) =>
                    setEditRange(
                      values?.[0] && values?.[1] ? [values[0], values[1]] : null,
                    )
                  }
                  format="YYYY年M月D日"
                  placeholder={["开始日期", "结束日期"]}
                />
              )}
            </Flex>
          ) : (
            <>
              <Flex vertical gap={6}>
                <Typography.Text type="secondary">收支方向</Typography.Text>
                <Segmented
                  value={editDirection}
                  onChange={(value) => setEditDirection(String(value))}
                  options={[
                    { label: "全部", value: "all" },
                    { label: "支出", value: "expense" },
                    { label: "收入", value: "income" },
                  ]}
                />
              </Flex>
              <Flex vertical gap={6}>
                <Typography.Text type="secondary">时间范围</Typography.Text>
                <Segmented
                  value={editTimeMode}
                  onChange={(value) => setEditTimeMode(String(value))}
                  options={[
                    { label: "全部时间", value: "all" },
                    { label: "按日", value: "date" },
                    { label: "按整月", value: "month" },
                    { label: "自定义", value: "range" },
                  ]}
                />
                {editTimeMode === "date" && (
                  <DatePicker
                    value={editDate}
                    onChange={(value) => setEditDate(value)}
                    format="YYYY年M月D日"
                    placeholder="选择日期"
                  />
                )}
                {editTimeMode === "month" && (
                  <DatePicker
                    picker="month"
                    value={editMonth}
                    onChange={(value) => setEditMonth(value)}
                    format="YYYY年M月"
                    placeholder="选择月份"
                  />
                )}
                {editTimeMode === "range" && (
                  <DatePicker.RangePicker
                    value={editRange}
                    onChange={(values) =>
                      setEditRange(
                        values?.[0] && values?.[1]
                          ? [values[0], values[1]]
                          : null,
                      )
                    }
                    format="YYYY年M月D日"
                    placeholder={["开始日期", "结束日期"]}
                  />
                )}
              </Flex>
            </>
          )}
        </Flex>
      </Modal>
    </div>
  )
}
