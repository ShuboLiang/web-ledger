import {
  CalendarOutlined,
  ClearOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FilterOutlined,
  MoreOutlined,
  SearchOutlined,
  SettingOutlined,
  TagsOutlined,
  WalletOutlined,
} from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  List,
  Popover,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  type MenuProps,
  type TableColumnsType,
} from "antd"
import dayjs, { type Dayjs } from "dayjs"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { TransactionDrawer } from "@/components/transaction-drawer"
import { api, type Dictionaries, type Transaction } from "@/lib/api"
import { CategoryIcon } from "@/components/category-icon"
import { money, readPersist, writePersist } from "@/lib/utils"

type Page = {
  records: Transaction[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  summary?: {
    expense: number
    income: number
    balance: number
  }
}
type TimePreset =
  "all" | "today" | "week" | "month" | "lastMonth" | "year" | "custom"
const columnLabels: Record<string, string> = {
  date: "日期",
  item: "项目",
  category: "分类",
  account: "账户",
  amount: "金额",
}
const transactionFilterKeys = [
  "date",
  "month",
  "start",
  "end",
  "direction",
  "category1",
  "category2",
  "query",
  "tagId",
  "tagIds",
  "tagMatch",
] as const
const transactionStateKeys = [
  ...transactionFilterKeys,
  "page",
  "pageSize",
  "sortBy",
  "sortOrder",
] as const
const transactionFilterStorageKey = "qing-zhang-transaction-filter"
const transactionColumnsStorageKey = "qing-zhang-transaction-columns"

function savedTransactionState(source: URLSearchParams) {
  const saved = new URLSearchParams()
  transactionStateKeys.forEach((key) => {
    const value = source.get(key)
    if (value) saved.set(key, value)
  })
  return saved
}

export function TransactionsPage() {
  const [params, setParams] = useSearchParams()
  const screens = Grid.useBreakpoint()
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()
  const searchRef = useRef<any>(null)
  const pendingFilterRestore = useRef<string | null | undefined>(undefined)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    try {
      return {
        date: true,
        item: true,
        category: true,
        account: true,
        amount: true,
        ...JSON.parse(readPersist(transactionColumnsStorageKey) || "{}"),
      }
    } catch {
      return {
        date: true,
        item: true,
        category: true,
        account: true,
        amount: true,
      }
    }
  })
  const [bulkOpen, setBulkOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)
  const [searchValue, setSearchValue] = useState(params.get("query") || "")
  const [bulkForm] = Form.useForm()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [drawer, setDrawer] = useState(false)
  const page = Number(params.get("page") || 1)
  const pageSize = Number(params.get("pageSize") || 20)
  const selectedTagIds = useMemo(() => {
    const fromIds = params.get("tagIds")
    if (fromIds)
      return fromIds.split(",").map((value) => value.trim()).filter(Boolean)
    const legacy = params.get("tagId")
    return legacy ? [legacy] : []
  }, [params])
  const tagMatch = params.get("tagMatch") === "all" ? "all" : "any"
  const set = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      value ? next.set(key, value) : next.delete(key)
      if (key !== "page") next.set("page", "1")
      if (key === "category1") next.delete("category2")
      return next
    })
  useEffect(() => {
    setSearchValue(params.get("query") || "")
    if (params.get("focus") === "search") searchRef.current?.focus()
    const currentState = savedTransactionState(params).toString()
    if (pendingFilterRestore.current === undefined) {
      const storedFilters = readPersist(transactionFilterStorageKey)
      if (!currentState && storedFilters) {
        const restored = new URLSearchParams(params)
        savedTransactionState(new URLSearchParams(storedFilters)).forEach(
          (value, key) => restored.set(key, value),
        )
        pendingFilterRestore.current =
          savedTransactionState(restored).toString()
        setParams(restored, { replace: true })
        return
      }
      pendingFilterRestore.current = null
    }

    if (pendingFilterRestore.current) {
      if (currentState !== pendingFilterRestore.current) return
      pendingFilterRestore.current = null
    }

    writePersist(transactionFilterStorageKey, currentState)
  }, [params, setParams])
  useEffect(() => {
    writePersist(transactionColumnsStorageKey, JSON.stringify(visible))
  }, [visible])
  const queryString = useMemo(() => {
    const q = new URLSearchParams(params)
    q.delete("focus")
    if (!q.has("page")) q.set("page", "1")
    if (!q.has("pageSize")) q.set("pageSize", "20")
    return q.toString()
  }, [params])
  const { data, isLoading } = useQuery({
    queryKey: ["transactions", queryString],
    queryFn: () => api<Page>(`/api/transactions?${queryString}`),
  })
  const { data: dictionaries } = useQuery({
    queryKey: ["dictionaries"],
    queryFn: () => api<Dictionaries>("/api/dictionaries"),
  })
  const primary = [
    ...new Set(dictionaries?.categories.map((row) => row.category1)),
  ]
  const categoryOptions = primary.map((category1) => ({
    label: (
      <span className="category-select-label">
        <CategoryIcon
          name={
            dictionaries?.categories.find((row) => row.category1 === category1)
              ?.primaryIcon
          }
          size="small"
        />
        {category1}
      </span>
    ),
    options: [
      {
        label: `全部${category1}`,
        value: JSON.stringify([category1]),
        searchText: `${category1} 全部`,
      },
      ...[
        ...new Set(
          dictionaries?.categories
            .filter((row) => row.category1 === category1)
            .map((row) => row.category2),
        ),
      ].map((category2) => ({
        label: (
          <span className="category-select-label">
            <CategoryIcon
              name={
                dictionaries?.categories.find(
                  (row) =>
                    row.category1 === category1 && row.category2 === category2,
                )?.secondaryIcon
              }
              size="small"
            />
            {category2}
          </span>
        ),
        value: JSON.stringify([category1, category2]),
        searchText: `${category1} ${category2}`,
      })),
    ],
  }))
  const remove = useMutation({
    mutationFn: (id: number) =>
      api(`/api/transactions/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      message.success("账目已删除")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const bulk = useMutation({
    mutationFn: (values: any) =>
      api<{ updated: number }>("/api/transactions/bulk-categorize", {
        method: "POST",
        body: JSON.stringify({ ids: selectedRowKeys.map(Number), ...values }),
      }),
    onSuccess: async (result) => {
      setBulkOpen(false)
      setSelectedRowKeys([])
      bulkForm.resetFields()
      await queryClient.invalidateQueries()
      message.success(`已批量更新 ${result.updated} 笔账目`)
    },
    onError: (error: Error) => message.error(error.message),
  })
  const openEdit = (record: Transaction) => {
    setEditing(record)
    setDrawer(true)
  }
  const confirmDelete = (record: Transaction) =>
    modal.confirm({
      title: "删除账目",
      content: `确定删除“${record.item}”吗？`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => remove.mutateAsync(record.id),
    })
  const columns: TableColumnsType<Transaction> = [
    {
      key: "date",
      dataIndex: "date",
      title: "日期",
      width: 120,
      sorter: true,
      hidden: !visible.date,
    },
    {
      key: "item",
      dataIndex: "item",
      title: "项目",
      width: 320,
      hidden: !visible.item,
      render: (value, row) => (
        <Flex vertical gap={2} className="transaction-item-cell">
          <Typography.Text strong ellipsis={{ tooltip: value }}>
            {value}
          </Typography.Text>
          {row.note && (
            <Typography.Text type="secondary" ellipsis={{ tooltip: row.note }}>
              {row.note}
            </Typography.Text>
          )}
          {!!row.tags?.length && (
            <span className="transaction-tag-line">
              {row.tags.map((tag) => (
                <Tag key={tag.id} color={tag.color}>
                  {tag.name}
                </Tag>
              ))}
            </span>
          )}
        </Flex>
      ),
    },
    {
      key: "category",
      title: "分类",
      width: 180,
      hidden: !visible.category,
      render: (_, row) => (
        <Tag color="cyan" className="transaction-category-tag">
          <CategoryIcon name={row.secondaryIcon} size="small" />
          {row.category1} · {row.category2}
        </Tag>
      ),
    },
    {
      key: "account",
      dataIndex: "accountName",
      title: "账户",
      width: 160,
      hidden: !visible.account,
      render: (value) => (
        <span className="transaction-account-label">
          <WalletOutlined />
          <span>{value || "未指定账户"}</span>
        </span>
      ),
    },
    {
      key: "amount",
      dataIndex: "amount",
      title: "金额",
      width: 130,
      align: "right",
      sorter: true,
      hidden: !visible.amount,
      render: (value) => (
        <Typography.Text strong type={value < 0 ? "danger" : "success"}>
          {value < 0 ? "−" : "+"}
          {money(Math.abs(value))}
        </Typography.Text>
      ),
    },
    {
      key: "actions",
      title: "操作",
      width: 100,
      fixed: "right",
      render: (_, row) => (
        <Space size={2}>
          <Button
            type="text"
            icon={<EditOutlined />}
            aria-label={`编辑${row.item}`}
            onClick={() => openEdit(row)}
          />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={`删除${row.item}`}
            onClick={() => confirmDelete(row)}
          />
        </Space>
      ),
    },
  ]
  const exportCsv = async () => {
    const exportParams = new URLSearchParams(params)
    exportParams.delete("focus")
    exportParams.set("pageSize", "100")
    const rows: Transaction[] = []
    for (let current = 1; ; current += 1) {
      exportParams.set("page", String(current))
      const result = await api<Page>(`/api/transactions?${exportParams}`)
      rows.push(...result.records)
      if (current >= result.totalPages) break
    }
    const csv = [
      "日期,项目,一级分类,二级分类,标签,账户,备注,金额",
      ...rows.map((row) =>
        [
          row.date,
          row.item,
          row.category1,
          row.category2,
          row.tags?.map((tag) => tag.name).join("|") || "",
          row.accountName || "",
          row.note,
          row.amount,
        ]
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      ),
    ].join("\n")
    const link = document.createElement("a")
    link.href = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv" }),
    )
    link.download = `轻账-${params.get("month") || params.get("date") || params.get("start") || "全部"}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
    message.success(`已导出 ${rows.length} 笔账目`)
  }
  const columnMenu: MenuProps = {
    items: Object.entries(columnLabels).map(([key, label]) => ({
      key,
      label: (
        <Checkbox
          checked={visible[key]}
          onChange={(event) =>
            setVisible((current) => ({
              ...current,
              [key]: event.target.checked,
            }))
          }
        >
          {label}
        </Checkbox>
      ),
    })),
  }
  const mobileActionMenu: MenuProps = {
    items: [
      {
        key: "export",
        icon: <DownloadOutlined />,
        label: "导出当前结果",
        onClick: () =>
          exportCsv().catch((error) => message.error(error.message)),
      },
    ],
  }
  const clearFilterKeys = (keys: string[]) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      keys.forEach((key) => next.delete(key))
      next.set("page", "1")
      return next
    })
  const clearTimeFilter = () =>
    clearFilterKeys(["date", "month", "start", "end"])
  const clearAllFilters = () =>
    clearFilterKeys([
      "date",
      "month",
      "start",
      "end",
      "direction",
      "category1",
      "category2",
      "query",
      "tagId",
      "tagIds",
      "tagMatch",
    ])
  const today = dayjs().startOf("day")
  const weekStart = today.subtract((today.day() + 6) % 7, "day")
  const timePresets: {
    key: Exclude<TimePreset, "all" | "custom">
    label: string
    range: [Dayjs, Dayjs]
  }[] = [
    { key: "today", label: "今天", range: [today, today] },
    { key: "week", label: "本周", range: [weekStart, weekStart.add(6, "day")] },
    {
      key: "month",
      label: "本月",
      range: [today.startOf("month"), today.endOf("month")],
    },
    {
      key: "lastMonth",
      label: "上月",
      range: [
        today.subtract(1, "month").startOf("month"),
        today.subtract(1, "month").endOf("month"),
      ],
    },
    {
      key: "year",
      label: "今年",
      range: [today.startOf("year"), today.endOf("year")],
    },
  ]
  const selectedRange: [Dayjs, Dayjs] | null =
    params.get("start") && params.get("end")
      ? [dayjs(params.get("start")), dayjs(params.get("end"))]
      : params.get("date")
        ? [dayjs(params.get("date")), dayjs(params.get("date"))]
        : params.get("month")
          ? [
              dayjs(`${params.get("month")}-01`).startOf("month"),
              dayjs(`${params.get("month")}-01`).endOf("month"),
            ]
          : null
  const activeTimePreset: TimePreset = selectedRange
    ? timePresets.find(
        ({ range }) =>
          range[0].isSame(selectedRange[0], "day") &&
          range[1].isSame(selectedRange[1], "day"),
      )?.key || "custom"
    : "all"
  const timeLabel =
    activeTimePreset === "all"
      ? "全部时间"
      : activeTimePreset === "custom"
        ? selectedRange![0].isSame(selectedRange![1], "day")
          ? selectedRange![0].format("YYYY年M月D日")
          : `${selectedRange![0].format("YYYY.M.D")} - ${selectedRange![1].format("YYYY.M.D")}`
        : timePresets.find((preset) => preset.key === activeTimePreset)!.label
  const mobileTimeLabel =
    activeTimePreset === "all"
      ? "时间"
      : activeTimePreset === "custom"
        ? selectedRange![0].isSame(selectedRange![1], "day")
          ? selectedRange![0].format("M/D")
          : `${selectedRange![0].format("M/D")}-${selectedRange![1].format("M/D")}`
        : timePresets.find((preset) => preset.key === activeTimePreset)!.label
  const setTimeRange = (range: [Dayjs, Dayjs] | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (range) {
        next.set("start", range[0].format("YYYY-MM-DD"))
        next.set("end", range[1].format("YYYY-MM-DD"))
      } else {
        next.delete("start")
        next.delete("end")
      }
      next.delete("date")
      next.delete("month")
      next.set("page", "1")
      return next
    })
  const setCategoryFilter = (value?: string) => {
    const selected = value ? (JSON.parse(value) as string[]) : []
    setParams((current) => {
      const next = new URLSearchParams(current)
      selected[0]
        ? next.set("category1", selected[0])
        : next.delete("category1")
      selected[1]
        ? next.set("category2", selected[1])
        : next.delete("category2")
      next.set("page", "1")
      return next
    })
  }
  const timePresetButtons = (
    <div className="transaction-time-presets">
      <Button
        type={activeTimePreset === "all" ? "primary" : "text"}
        onClick={() => {
          setTimeRange(null)
          setTimeOpen(false)
        }}
      >
        全部时间
      </Button>
      {timePresets.map((preset) => (
        <Button
          key={preset.key}
          type={activeTimePreset === preset.key ? "primary" : "text"}
          onClick={() => {
            setTimeRange(preset.range)
            setTimeOpen(false)
          }}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  )
  const desktopTimeFilterContent = (
    <div className="transaction-time-panel">
      {timePresetButtons}
      <div className="transaction-custom-time">
        <Typography.Text type="secondary">自定义日期范围</Typography.Text>
        <DatePicker.RangePicker
          value={selectedRange}
          allowClear
          onChange={(values) => {
            if (values?.[0] && values?.[1]) {
              setTimeRange([values[0], values[1]])
              setTimeOpen(false)
            } else if (!values) {
              setTimeRange(null)
            }
          }}
          format="YYYY年M月D日"
        />
      </div>
    </div>
  )
  const mobileTimeFilterContent = (
    <div className="transaction-time-panel transaction-time-panel-mobile">
      {timePresetButtons}
      <div className="transaction-custom-time">
        <Typography.Text type="secondary">自定义日期范围</Typography.Text>
        <div className="transaction-mobile-date-fields">
          <Flex vertical gap={6}>
            <Typography.Text>开始日期</Typography.Text>
            <DatePicker
              value={selectedRange?.[0] || null}
              maxDate={selectedRange?.[1]}
              placeholder="选择开始日期"
              format="YYYY年M月D日"
              onChange={(value) => {
                if (!value) return setTimeRange(null)
                const end =
                  selectedRange?.[1] && !selectedRange[1].isBefore(value, "day")
                    ? selectedRange[1]
                    : value
                setTimeRange([value, end])
              }}
            />
          </Flex>
          <Flex vertical gap={6}>
            <Typography.Text>结束日期</Typography.Text>
            <DatePicker
              value={selectedRange?.[1] || null}
              minDate={selectedRange?.[0]}
              placeholder="选择结束日期"
              format="YYYY年M月D日"
              onChange={(value) => {
                if (!value) return setTimeRange(null)
                const start =
                  selectedRange?.[0] && !selectedRange[0].isAfter(value, "day")
                    ? selectedRange[0]
                    : value
                setTimeRange([start, value])
              }}
            />
          </Flex>
        </div>
        <Button type="primary" onClick={() => setTimeOpen(false)}>
          完成
        </Button>
      </div>
    </div>
  )
  const timeTrigger = (className = "", label = timeLabel) => (
    <Button
      className={`transaction-time-trigger ${activeTimePreset !== "all" ? "is-active" : ""} ${className}`}
      icon={<CalendarOutlined />}
      onClick={screens.md ? undefined : () => setTimeOpen(true)}
    >
      {label}
    </Button>
  )
  const renderTimeFilter = (className = "") =>
    screens.md ? (
      <Popover
        open={timeOpen}
        onOpenChange={setTimeOpen}
        trigger="click"
        placement="bottomLeft"
        content={desktopTimeFilterContent}
      >
        {timeTrigger(className)}
      </Popover>
    ) : (
      timeTrigger(className)
    )
  const renderCategoryFilter = (className = "") => (
    <Select
      className={className}
      allowClear
      showSearch
      popupClassName="transaction-category-popup"
      popupMatchSelectWidth={false}
      placeholder="全部分类"
      value={
        params.get("category1")
          ? JSON.stringify([
              params.get("category1"),
              ...(params.get("category2") ? [params.get("category2")] : []),
            ])
          : undefined
      }
      options={categoryOptions}
      filterOption={(input, option) =>
        String(
          option && "searchText" in option
            ? option.searchText
            : option?.label || "",
        )
          .toLocaleLowerCase()
          .includes(input.trim().toLocaleLowerCase())
      }
      onChange={setCategoryFilter}
    />
  )
  const renderTagFilter = (className = "", stacked = !screens.md) => (
    <Flex
      gap={8}
      align={stacked ? "stretch" : "center"}
      vertical={stacked}
      className={`transaction-tag-filter-wrap${stacked ? " is-mobile" : ""}`}
    >
      <Select
        className={`transaction-tag-filter ${className}`.trim()}
        mode="multiple"
        allowClear
        showSearch
        maxTagCount={stacked ? 2 : "responsive"}
        placeholder="筛选标签"
        value={selectedTagIds}
        optionFilterProp="label"
        options={(dictionaries?.tags || []).map((tag) => ({
          value: tag.id,
          label: tag.name,
        }))}
        onChange={(values) =>
          setParams((current) => {
            const next = new URLSearchParams(current)
            next.delete("tagId")
            if (values.length) next.set("tagIds", values.join(","))
            else {
              next.delete("tagIds")
              next.delete("tagMatch")
            }
            if (values.length <= 1) next.delete("tagMatch")
            next.set("page", "1")
            return next
          })
        }
      />
      {selectedTagIds.length > 1 && (
        <Segmented
          block={stacked}
          size="small"
          className="transaction-tag-match"
          value={tagMatch}
          options={
            stacked
              ? [
                  { label: "任一标签", value: "any" },
                  { label: "全部标签", value: "all" },
                ]
              : [
                  { label: "或", value: "any" },
                  { label: "且", value: "all" },
                ]
          }
          onChange={(value) => set("tagMatch", value === "all" ? "all" : "")}
        />
      )}
    </Flex>
  )
  const renderMobileFilters = () => (
    <div className="advanced-filter-panel">
      <Flex vertical gap={14}>
        <Flex vertical gap={6}>
          <Typography.Text type="secondary">分类</Typography.Text>
          {renderCategoryFilter()}
        </Flex>
        <Flex vertical gap={6}>
          <Typography.Text type="secondary">标签</Typography.Text>
          {renderTagFilter("transaction-tag-filter-mobile", true)}
        </Flex>
        <Flex justify="flex-end">
          <Button type="primary" onClick={() => setFilterOpen(false)}>
            完成
          </Button>
        </Flex>
      </Flex>
    </div>
  )
  const filterChips = [
    selectedRange && { key: "time", label: timeLabel, clear: clearTimeFilter },
    params.get("direction") && {
      key: "direction",
      label: params.get("direction") === "expense" ? "支出" : "收入",
      clear: () => clearFilterKeys(["direction"]),
    },
    params.get("category1") && {
      key: "category",
      label: params.get("category2")
        ? `${params.get("category1")} / ${params.get("category2")}`
        : params.get("category1")!,
      clear: () => clearFilterKeys(["category1", "category2"]),
    },
    params.get("query") && {
      key: "query",
      label: `搜索：${params.get("query")}`,
      clear: () => clearFilterKeys(["query"]),
    },
    selectedTagIds.length > 0 && {
      key: "tag",
      label:
        selectedTagIds.length > 1
          ? `${selectedTagIds.length} 个标签${tagMatch === "all" ? " · 且" : ""}`
          : dictionaries?.tags?.find((tag) => tag.id === selectedTagIds[0])
              ?.name || "标签",
      clear: () => clearFilterKeys(["tagId", "tagIds", "tagMatch"]),
    },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[]
  const activeFilterCount = filterChips.length
  const mobileMoreFilterCount =
    Number(Boolean(params.get("category1"))) + selectedTagIds.length
  const mobileActiveFilterChips = filterChips.filter(
    (chip) => !["time", "direction"].includes(chip.key),
  )
  const renderFilterSummary = () => (
    <div className="transaction-filter-summary">
      <Typography.Text type="secondary" className="transaction-result-count">
        {data?.total || 0} 笔账目
      </Typography.Text>
      {filterChips.map((chip) => (
        <Tag
          key={chip.key}
          closable
          onClose={(event) => {
            event.preventDefault()
            chip.clear()
          }}
        >
          {chip.label}
        </Tag>
      ))}
      {activeFilterCount > 1 && (
        <Button
          type="link"
          size="small"
          icon={<ClearOutlined />}
          onClick={clearAllFilters}
        >
          清除全部
        </Button>
      )}
    </div>
  )
  const renderMobileActiveFilters = () => {
    if (!mobileActiveFilterChips.length) return null
    return (
      <div className="transaction-mobile-active-filters">
        <div className="transaction-mobile-active-filters-scroll">
          {mobileActiveFilterChips.map((chip) => (
            <Tag
              key={chip.key}
              closable
              onClose={(event) => {
                event.preventDefault()
                chip.clear()
              }}
            >
              {chip.label}
            </Tag>
          ))}
        </div>
        {activeFilterCount > 1 && (
          <Button
            type="link"
            size="small"
            icon={<ClearOutlined />}
            onClick={clearAllFilters}
          >
            清除
          </Button>
        )}
      </div>
    )
  }
  const direction = params.get("direction") || "all"
  const renderResultSummary = () => {
    if (!data?.summary) return null
    const { expense, income, balance } = data.summary
    const items = [
      {
        key: "count",
        title: "笔数",
        value: data.total,
        precision: 0,
        prefix: undefined as string | undefined,
        type: undefined as "success" | "danger" | undefined,
      },
      ...(direction !== "income"
        ? [
            {
              key: "expense",
              title: "支出合计",
              value: expense,
              precision: 2,
              prefix: "¥",
              type: undefined as "success" | "danger" | undefined,
            },
          ]
        : []),
      ...(direction !== "expense"
        ? [
            {
              key: "income",
              title: "收入合计",
              value: income,
              precision: 2,
              prefix: "¥",
              type: "success" as const,
            },
          ]
        : []),
      ...(direction === "all"
        ? [
            {
              key: "balance",
              title: balance >= 0 ? "结余" : "超支",
              value: Math.abs(balance),
              precision: 2,
              prefix: "¥",
              type: (balance >= 0 ? "success" : "danger") as
                | "success"
                | "danger"
                | undefined,
            },
          ]
        : []),
    ]
    return (
      <Card size="small" className="transaction-result-summary">
        <div
          className="transaction-result-stats"
          style={{
            gridTemplateColumns: `repeat(${Math.min(items.length, screens.md ? 4 : 2)}, minmax(0, 1fr))`,
          }}
        >
          {items.map((item) => (
            <Statistic
              key={item.key}
              title={item.title}
              value={item.value}
              precision={item.precision}
              prefix={item.prefix}
              valueStyle={
                item.type ? { color: item.type === "success" ? "#176b62" : "#c65f43" } : undefined
              }
            />
          ))}
        </div>
      </Card>
    )
  }
  const sorter = params.get("sortBy")
    ? {
        field: params.get("sortBy"),
        order: params.get("sortOrder") === "asc" ? "ascend" : "descend",
      }
    : null
  return (
    <div className="page-stack">
      {screens.md ? (
        <Card size="small" className="transaction-filter-card">
          <div className="transaction-filter-desktop">
            <div className="transaction-filter-primary">
              {renderTimeFilter()}
              <Segmented
                className="transaction-direction-filter"
                value={params.get("direction") || "all"}
                options={[
                  { label: "全部", value: "all" },
                  { label: "支出", value: "expense" },
                  { label: "收入", value: "income" },
                ]}
                onChange={(value) =>
                  set("direction", value === "all" ? "" : String(value))
                }
              />
              {renderCategoryFilter("transaction-category-filter")}
              <Input.Search
                ref={searchRef}
                allowClear
                placeholder="搜索项目、备注、分类或标签"
                value={searchValue}
                onChange={(event) => {
                  setSearchValue(event.target.value)
                  if (!event.target.value) set("query", "")
                }}
                onSearch={(value) => set("query", value.trim())}
                className="transaction-search"
              />
            </div>
            <div className="transaction-filter-secondary">
              {renderTagFilter("transaction-tag-filter")}
              {renderFilterSummary()}
              <Flex
                align="center"
                wrap
                gap={8}
                className="transaction-table-actions"
              >
                <Button
                  icon={<DownloadOutlined />}
                  onClick={() =>
                    exportCsv().catch((error) => message.error(error.message))
                  }
                >
                  导出结果
                </Button>
                <Dropdown menu={columnMenu} trigger={["click"]}>
                  <Button icon={<SettingOutlined />}>显示列</Button>
                </Dropdown>
              </Flex>
            </div>
          </div>
        </Card>
      ) : (
        <Card
          size="small"
          className="transaction-filter-card transaction-filter-mobile"
        >
          <Flex vertical gap={8}>
            <div className="transaction-mobile-search-row">
              <Input
                ref={searchRef}
                allowClear
                placeholder="搜索项目、备注、分类或标签"
                value={searchValue}
                onChange={(event) => {
                  setSearchValue(event.target.value)
                  if (!event.target.value) set("query", "")
                }}
                onPressEnter={() => set("query", searchValue.trim())}
                className="transaction-search-mobile"
                suffix={
                  <button
                    type="button"
                    className="transaction-search-mobile-go"
                    aria-label="搜索"
                    onClick={() => set("query", searchValue.trim())}
                  >
                    <SearchOutlined />
                  </button>
                }
              />
              <Badge
                count={mobileMoreFilterCount}
                size="small"
                offset={[-4, 4]}
              >
                <Button
                  className="transaction-mobile-icon-btn"
                  icon={<FilterOutlined />}
                  aria-label="筛选分类和标签"
                  onClick={() => setFilterOpen(true)}
                />
              </Badge>
              <Dropdown menu={mobileActionMenu} trigger={["click"]}>
                <Button
                  className="transaction-mobile-icon-btn"
                  icon={<MoreOutlined />}
                  aria-label="更多账目操作"
                />
              </Dropdown>
            </div>
            <div className="transaction-mobile-switcher">
              <button
                type="button"
                className={`transaction-mobile-switcher-item is-time${
                  activeTimePreset !== "all" ? " is-active" : ""
                }`}
                onClick={() => setTimeOpen(true)}
              >
                {mobileTimeLabel}
              </button>
              {(
                [
                  ["all", "全部"],
                  ["expense", "支出"],
                  ["income", "收入"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`transaction-mobile-switcher-item${
                    (params.get("direction") || "all") === value
                      ? " is-active"
                      : ""
                  }`}
                  onClick={() => set("direction", value === "all" ? "" : value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {renderMobileActiveFilters()}
          </Flex>
        </Card>
      )}
      {selectedRowKeys.length > 0 && (
        <Alert
          className="transaction-selection-alert"
          type="info"
          showIcon
          message={`已选择 ${selectedRowKeys.length} 笔账目`}
          action={
            <Space>
              <Button size="small" onClick={() => setSelectedRowKeys([])}>
                取消选择
              </Button>
              <Button
                size="small"
                type="primary"
                icon={<TagsOutlined />}
                onClick={() => setBulkOpen(true)}
              >
                批量分类
              </Button>
            </Space>
          }
        />
      )}
      {renderResultSummary()}
      {screens.md ? (
        <Card styles={{ body: { padding: 0 } }}>
          <Table<Transaction>
            rowKey="id"
            loading={isLoading}
            columns={columns}
            dataSource={data?.records || []}
            scroll={{ x: 980 }}
            rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
            pagination={{
              current: data?.page || page,
              pageSize,
              total: data?.total || 0,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (total) => `共 ${total} 笔`,
            }}
            onChange={(pagination, _filters, sort: any) => {
              setParams((current) => {
                const next = new URLSearchParams(current)
                next.set("page", String(pagination.current || 1))
                next.set("pageSize", String(pagination.pageSize || 20))
                const active = Array.isArray(sort) ? sort[0] : sort
                if (active?.field && active?.order) {
                  next.set("sortBy", String(active.field))
                  next.set(
                    "sortOrder",
                    active.order === "ascend" ? "asc" : "desc",
                  )
                } else {
                  next.delete("sortBy")
                  next.delete("sortOrder")
                }
                return next
              })
            }}
          />
        </Card>
      ) : (
        <Card styles={{ body: { padding: 0 } }}>
          <List
            className="transaction-mobile-list"
            loading={isLoading}
            dataSource={data?.records || []}
            locale={{ emptyText: <Empty /> }}
            renderItem={(row) => (
              <List.Item
                className="transaction-mobile-row"
                onClick={() => openEdit(row)}
                actions={[
                  <Button
                    key="delete"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`删除${row.item}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      confirmDelete(row)
                    }}
                  />,
                ]}
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
                  title={row.item}
                  description={
                    <span className="transaction-mobile-description">
                      <span className="transaction-mobile-category-line">
                        <span>{row.date}</span>
                        <span>·</span>
                        <CategoryIcon name={row.secondaryIcon} size="small" />
                        <span>
                          {row.category1} / {row.category2}
                        </span>
                      </span>
                      <span className="transaction-account-label">
                        <WalletOutlined />
                        <span>{row.accountName || "未指定账户"}</span>
                      </span>
                      {!!row.tags?.length && (
                        <span className="transaction-tag-line">
                          {row.tags.map((tag) => (
                            <Tag key={tag.id} color={tag.color}>
                              {tag.name}
                            </Tag>
                          ))}
                        </span>
                      )}
                    </span>
                  }
                />
              </List.Item>
            )}
            pagination={{
              current: data?.page || 1,
              pageSize,
              total: data?.total || 0,
              onChange: (value) => set("page", String(value)),
              size: "small",
            }}
          />
        </Card>
      )}
      <TransactionDrawer
        open={drawer}
        onOpenChange={setDrawer}
        record={editing}
      />
      {!screens.md && (
        <Drawer
          className="mobile-time-drawer"
          title="账目时间"
          placement="bottom"
          height="auto"
          open={timeOpen}
          onClose={() => setTimeOpen(false)}
          destroyOnHidden
        >
          {mobileTimeFilterContent}
        </Drawer>
      )}
      {!screens.md && (
        <Drawer
          className="mobile-filter-drawer"
          title="分类与标签"
          placement="bottom"
          height="auto"
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          destroyOnHidden
        >
          {renderMobileFilters()}
        </Drawer>
      )}
      <Drawer
        title="批量分类"
        open={bulkOpen}
        width={440}
        onClose={() => setBulkOpen(false)}
        extra={
          <Typography.Text type="secondary">
            已选 {selectedRowKeys.length} 笔
          </Typography.Text>
        }
        footer={
          <Flex justify="flex-end" gap={8}>
            <Button onClick={() => setBulkOpen(false)}>取消</Button>
            <Button
              type="primary"
              loading={bulk.isPending}
              onClick={() => bulkForm.submit()}
            >
              确认更新
            </Button>
          </Flex>
        }
      >
        <Form
          form={bulkForm}
          layout="vertical"
          onFinish={(values) => bulk.mutate(values)}
        >
          <Form.Item
            name="category1"
            label="一级分类"
            rules={[{ required: true }]}
          >
            <Select
              options={primary.map((value) => ({ label: value, value }))}
              onChange={(value) => {
                bulkForm.setFieldValue("category2", undefined)
              }}
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, next) => prev.category1 !== next.category1}
          >
            {({ getFieldValue }) => (
              <Form.Item
                name="category2"
                label="二级分类"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    ...new Set(
                      dictionaries?.categories
                        .filter(
                          (row) => row.category1 === getFieldValue("category1"),
                        )
                        .map((row) => row.category2),
                    ),
                  ].map((value) => ({ label: value, value }))}
                />
              </Form.Item>
            )}
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}
