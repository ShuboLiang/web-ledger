import {
  DeleteOutlined,
  RestOutlined,
  SearchOutlined,
  UndoOutlined,
} from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  App,
  Button,
  Card,
  Checkbox,
  Empty,
  Flex,
  Grid,
  Input,
  Pagination,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useMemo, useState } from "react"
import { api, type Transaction } from "@/lib/api"
import { money } from "@/lib/utils"

type TrashRecord = Transaction & {
  deletedAt?: string | null
  expiresAt?: string | null
}

type TrashData = {
  records: TrashRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  retentionDays: number
  query: string
}

export function TrashPage() {
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()
  const screens = Grid.useBreakpoint()
  const desktop = Boolean(screens.md)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<number[]>([])
  const { data, isLoading } = useQuery({
    queryKey: ["trash", page, search],
    queryFn: () =>
      api<TrashData>(
        `/api/trash?page=${page}&pageSize=20&query=${encodeURIComponent(search)}`,
      ),
  })
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["trash"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      queryClient.invalidateQueries({ queryKey: ["finance"] }),
      queryClient.invalidateQueries({ queryKey: ["tags"] }),
      queryClient.invalidateQueries({ queryKey: ["budgets"] }),
    ])
  const restore = useMutation({
    mutationFn: (ids: number[]) =>
      api<{ restored: number }>("/api/trash/restore", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: async (result) => {
      setSelected([])
      await refresh()
      message.success(`已恢复 ${result.restored} 笔账目`)
    },
    onError: (error: Error) => message.error(error.message),
  })
  const purge = useMutation({
    mutationFn: (ids?: number[]) =>
      ids?.length
        ? api<{ purged: number }>("/api/trash/purge", {
            method: "POST",
            body: JSON.stringify({ ids }),
          })
        : api<{ purged: number }>("/api/trash", { method: "DELETE" }),
    onSuccess: async (result) => {
      setSelected([])
      await refresh()
      message.success(`已彻底删除 ${result.purged} 笔账目`)
    },
    onError: (error: Error) => message.error(error.message),
  })
  const confirmPurge = (ids?: number[]) =>
    modal.confirm({
      title: ids?.length ? "彻底删除所选账目" : "清空回收站",
      content: ids?.length
        ? `将永久删除 ${ids.length} 笔账目，无法再恢复。`
        : "将永久删除回收站中的全部账目，无法再恢复。",
      okText: "彻底删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => purge.mutateAsync(ids),
    })
  const submitSearch = (value: string) => {
    setSelected([])
    setPage(1)
    setSearch(value.trim())
  }
  const changePage = (next: number) => {
    setSelected([])
    setPage(next)
  }
  const toggleSelected = (id: number, checked: boolean) =>
    setSelected((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((value) => value !== id),
    )
  const columns = useMemo(
    () => [
      {
        title: "删除时间",
        dataIndex: "deletedAt",
        width: 170,
        render: (value: string) =>
          value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "—",
      },
      {
        title: "日期",
        dataIndex: "date",
        width: 110,
      },
      {
        title: "项目",
        dataIndex: "item",
        ellipsis: true,
      },
      {
        title: "分类",
        key: "category",
        render: (_: unknown, row: TrashRecord) =>
          `${row.category1} / ${row.category2}`,
      },
      {
        title: "金额",
        dataIndex: "amount",
        align: "right" as const,
        width: 110,
        render: (value: number) => (
          <Typography.Text type={value < 0 ? undefined : "success"}>
            {money(Math.abs(value))}
            {value < 0 ? "" : " 收"}
          </Typography.Text>
        ),
      },
      {
        title: "将清理",
        dataIndex: "expiresAt",
        width: 120,
        render: (value: string) =>
          value ? (
            <Tag variant="filled">{dayjs(value).format("MM-DD")}</Tag>
          ) : (
            "—"
          ),
      },
    ],
    [],
  )
  return (
    <div className="page-stack trash-page">
      <Card className="trash-intro">
        <Flex justify="space-between" align="flex-start" gap={16} wrap>
          <div>
            {desktop && (
              <Typography.Text className="statement-eyebrow">
                TRASH · 回收站
              </Typography.Text>
            )}
            <Typography.Title level={4}>
              误删的账目，还能找回来
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              删除账目会先进入回收站。超过 {data?.retentionDays || 30}{" "}
              天未恢复的记录会自动彻底删除。
            </Typography.Paragraph>
          </div>
          {desktop ? (
            <Space wrap>
              <Button
                icon={<UndoOutlined />}
                disabled={!selected.length}
                loading={restore.isPending}
                onClick={() => restore.mutate(selected)}
              >
                恢复所选
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={!selected.length}
                loading={purge.isPending}
                onClick={() => confirmPurge(selected)}
              >
                彻底删除
              </Button>
              <Button
                danger
                type="primary"
                icon={<RestOutlined />}
                disabled={!data?.total}
                loading={purge.isPending}
                onClick={() => confirmPurge()}
              >
                清空回收站
              </Button>
            </Space>
          ) : (
            <Button
              danger
              type="text"
              icon={<RestOutlined />}
              className="trash-mobile-clear"
              disabled={!data?.total}
              loading={purge.isPending}
              onClick={() => confirmPurge()}
            >
              清空回收站
            </Button>
          )}
        </Flex>
      </Card>

      {desktop ? (
        <Card>
          <Flex gap={8} wrap style={{ marginBottom: 16 }}>
            <Input.Search
              allowClear
              placeholder="搜索项目、备注或分类"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onSearch={submitSearch}
              style={{ maxWidth: 320 }}
            />
            <Typography.Text type="secondary" style={{ lineHeight: "32px" }}>
              共 {data?.total || 0} 笔
            </Typography.Text>
          </Flex>
          <Table
            rowKey="id"
            loading={isLoading}
            dataSource={data?.records || []}
            columns={columns}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: (keys) => setSelected(keys.map(Number)),
            }}
            pagination={{
              current: data?.page || page,
              pageSize: data?.pageSize || 20,
              total: data?.total || 0,
              onChange: changePage,
              showSizeChanger: false,
              hideOnSinglePage: true,
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="回收站是空的"
                />
              ),
            }}
            scroll={{ x: 800 }}
          />
        </Card>
      ) : (
        <section className="trash-mobile-panel" aria-label="回收站账目">
          <div className="trash-mobile-toolbar">
            <Input
              allowClear
              className="trash-mobile-search"
              placeholder="搜索回收站"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onPressEnter={() => submitSearch(query)}
              suffix={
                <button
                  type="button"
                  className="trash-mobile-search-submit"
                  aria-label="搜索回收站"
                  onClick={() => submitSearch(query)}
                >
                  <SearchOutlined />
                </button>
              }
            />
            <Typography.Text type="secondary">
              {data?.total || 0} 笔
            </Typography.Text>
          </div>

          {!!selected.length && (
            <div className="trash-mobile-selection">
              <Typography.Text strong role="status" aria-live="polite">
                已选 {selected.length} 笔
              </Typography.Text>
              <div className="trash-mobile-selection-actions">
                <Button
                  type="primary"
                  icon={<UndoOutlined />}
                  loading={restore.isPending}
                  onClick={() => restore.mutate(selected)}
                >
                  恢复
                </Button>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={purge.isPending}
                  onClick={() => confirmPurge(selected)}
                >
                  删除
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div
              className="trash-mobile-loading"
              role="status"
              aria-label="正在加载回收站"
            >
              <Skeleton
                active
                title={{ width: "45%" }}
                paragraph={{ rows: 2 }}
              />
              <Skeleton
                active
                title={{ width: "52%" }}
                paragraph={{ rows: 2 }}
              />
            </div>
          ) : data?.records.length ? (
            <div className="trash-mobile-records">
              {data.records.map((row) => {
                const checked = selected.includes(row.id)
                const category =
                  [row.category1, row.category2].filter(Boolean).join(" / ") ||
                  "未分类"
                return (
                  <Checkbox
                    key={row.id}
                    checked={checked}
                    aria-label={"选择" + (row.item || "未命名账目")}
                    className={
                      "trash-mobile-record" + (checked ? " is-selected" : "")
                    }
                    onChange={(event) =>
                      toggleSelected(row.id, event.target.checked)
                    }
                  >
                    <span className="trash-mobile-record-content">
                      <span className="trash-mobile-record-head">
                        <strong>{row.item || "未命名账目"}</strong>
                        <Typography.Text
                          strong
                          type={row.amount < 0 ? undefined : "success"}
                        >
                          {row.amount < 0 ? "−" : "+"}
                          {money(Math.abs(row.amount))}
                        </Typography.Text>
                      </span>
                      <span className="trash-mobile-record-context">
                        <span>{row.date}</span>
                        <span aria-hidden="true">·</span>
                        <span>{category}</span>
                      </span>
                      <span className="trash-mobile-record-meta">
                        <span>
                          删除于{" "}
                          {row.deletedAt
                            ? dayjs(row.deletedAt).format("MM-DD HH:mm")
                            : "未知时间"}
                        </span>
                        {row.expiresAt && (
                          <Tag variant="filled">
                            {dayjs(row.expiresAt).format("MM-DD")} 自动清理
                          </Tag>
                        )}
                      </span>
                    </span>
                  </Checkbox>
                )
              })}
            </div>
          ) : (
            <div className="trash-mobile-empty">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={search ? "没有匹配的账目" : "回收站是空的"}
              />
            </div>
          )}

          {(data?.totalPages || 1) > 1 && (
            <Pagination
              simple
              current={data?.page || page}
              pageSize={data?.pageSize || 20}
              total={data?.total || 0}
              showSizeChanger={false}
              onChange={changePage}
            />
          )}
        </section>
      )}
    </div>
  )
}
