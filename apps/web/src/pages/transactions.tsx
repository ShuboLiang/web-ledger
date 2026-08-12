import { ClearOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, FilterOutlined, FolderOpenOutlined, MoreOutlined, SaveOutlined, SettingOutlined, TagsOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Badge, Button, Card, Checkbox, DatePicker, Drawer, Dropdown, Empty, Flex, Form, Grid, Input, List, Popover, Select, Space, Table, Tag, Typography, type MenuProps, type TableColumnsType } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TransactionDrawer } from "@/components/transaction-drawer";
import { api, type Dictionaries, type Transaction } from "@/lib/api";
import { money } from "@/lib/utils";

type Page = { records: Transaction[]; total: number; page: number; pageSize: number; totalPages: number };
const columnLabels: Record<string, string> = { date: "日期", item: "项目", category: "分类", amount: "金额" };

export function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const screens = Grid.useBreakpoint();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const searchRef = useRef<any>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [visible, setVisible] = useState<Record<string, boolean>>({ date: true, item: true, category: true, amount: true });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(params.get("query") || "");
  const [hasSavedFilter, setHasSavedFilter] = useState(() => Boolean(localStorage.getItem("ledger-saved-filter")));
  const [bulkForm] = Form.useForm();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [drawer, setDrawer] = useState(false);
  const page = Number(params.get("page") || 1);
  const pageSize = Number(params.get("pageSize") || 20);
  const set = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); value ? next.set(key, value) : next.delete(key); if (key !== "page") next.set("page", "1"); if (key === "category1") next.delete("category2"); return next; });
  useEffect(() => { setSearchValue(params.get("query") || ""); if (params.get("focus") === "search") searchRef.current?.focus(); }, [params]);
  const queryString = useMemo(() => { const q = new URLSearchParams(params); q.delete("focus"); if (!q.has("page")) q.set("page", "1"); if (!q.has("pageSize")) q.set("pageSize", "20"); return q.toString(); }, [params]);
  const { data, isLoading } = useQuery({ queryKey: ["transactions", queryString], queryFn: () => api<Page>(`/api/transactions?${queryString}`) });
  const { data: dictionaries } = useQuery({ queryKey: ["dictionaries"], queryFn: () => api<Dictionaries>("/api/dictionaries") });
  const primary = [...new Set(dictionaries?.categories.map((row) => row.category1))];
  const secondary = [...new Set(dictionaries?.categories.filter((row) => !params.get("category1") || row.category1 === params.get("category1")).map((row) => row.category2))];
  const remove = useMutation({ mutationFn: (id: number) => api(`/api/transactions/${id}`, { method: "DELETE" }), onSuccess: async () => { await queryClient.invalidateQueries(); message.success("账目已删除"); }, onError: (error: Error) => message.error(error.message) });
  const bulk = useMutation({ mutationFn: (values: any) => api<{ updated: number }>("/api/transactions/bulk-categorize", { method: "POST", body: JSON.stringify({ ids: selectedRowKeys.map(Number), ...values }) }), onSuccess: async (result) => { setBulkOpen(false); setSelectedRowKeys([]); bulkForm.resetFields(); await queryClient.invalidateQueries(); message.success(`已批量更新 ${result.updated} 笔账目`); }, onError: (error: Error) => message.error(error.message) });
  const openEdit = (record: Transaction) => { setEditing(record); setDrawer(true); };
  const confirmDelete = (record: Transaction) => modal.confirm({ title: "删除账目", content: `确定删除“${record.item}”吗？`, okText: "删除", okButtonProps: { danger: true }, cancelText: "取消", onOk: () => remove.mutateAsync(record.id) });
  const columns: TableColumnsType<Transaction> = [
    { key: "date", dataIndex: "date", title: "日期", width: 120, sorter: true, hidden: !visible.date },
    { key: "item", dataIndex: "item", title: "项目", width: 320, hidden: !visible.item, render: (value, row) => <Flex vertical gap={2} className="transaction-item-cell"><Typography.Text strong ellipsis={{ tooltip: value }}>{value}</Typography.Text>{row.note && <Typography.Text type="secondary" ellipsis={{ tooltip: row.note }}>{row.note}</Typography.Text>}</Flex> },
    { key: "category", title: "分类", width: 180, hidden: !visible.category, render: (_, row) => <Tag color="cyan">{row.category1} · {row.category2}</Tag> },
    { key: "amount", dataIndex: "amount", title: "金额", width: 130, align: "right", sorter: true, hidden: !visible.amount, render: (value) => <Typography.Text strong type={value < 0 ? "danger" : "success"}>{value < 0 ? "−" : "+"}{money(Math.abs(value))}</Typography.Text> },
    { key: "actions", title: "操作", width: 100, fixed: "right", render: (_, row) => <Space size={2}><Button type="text" icon={<EditOutlined />} aria-label={`编辑${row.item}`} onClick={() => openEdit(row)} /><Button type="text" danger icon={<DeleteOutlined />} aria-label={`删除${row.item}`} onClick={() => confirmDelete(row)} /></Space> },
  ];
  const exportCsv = async () => { const exportParams = new URLSearchParams(params); exportParams.delete("focus"); exportParams.set("pageSize", "100"); const rows: Transaction[] = []; for (let current = 1; ; current += 1) { exportParams.set("page", String(current)); const result = await api<Page>(`/api/transactions?${exportParams}`); rows.push(...result.records); if (current >= result.totalPages) break; } const csv = ["日期,项目,一级分类,二级分类,备注,金额", ...rows.map((row) => [row.date, row.item, row.category1, row.category2, row.note, row.amount].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); link.download = `轻账-${params.get("month") || "全部"}.csv`; link.click(); URL.revokeObjectURL(link.href); message.success(`已导出 ${rows.length} 笔账目`); };
  const columnMenu: MenuProps = { items: Object.entries(columnLabels).map(([key, label]) => ({ key, label: <Checkbox checked={visible[key]} onChange={(event) => setVisible((current) => ({ ...current, [key]: event.target.checked }))}>{label}</Checkbox> })) };
  const saveCurrentFilter = () => { const saved = new URLSearchParams(params); ["page", "pageSize", "sortBy", "sortOrder", "focus"].forEach((key) => saved.delete(key)); localStorage.setItem("ledger-saved-filter", saved.toString()); setHasSavedFilter(true); message.success("筛选方案已保存"); };
  const applySavedFilter = () => setParams(new URLSearchParams(localStorage.getItem("ledger-saved-filter") || ""));
  const removeSavedFilter = () => { localStorage.removeItem("ledger-saved-filter"); setHasSavedFilter(false); message.success("已删除筛选方案"); };
  const savedFilterMenu: MenuProps = { items: [
    { key: "save", icon: <SaveOutlined />, label: hasSavedFilter ? "覆盖已保存方案" : "保存当前筛选", onClick: saveCurrentFilter },
    { key: "apply", icon: <FolderOpenOutlined />, label: "应用已保存方案", disabled: !hasSavedFilter, onClick: applySavedFilter },
    { type: "divider" },
    { key: "remove", icon: <DeleteOutlined />, danger: true, label: "删除已保存方案", disabled: !hasSavedFilter, onClick: removeSavedFilter },
  ] };
  const mobileActionMenu: MenuProps = { items: [
    { key: "export", icon: <DownloadOutlined />, label: "导出当前结果", onClick: () => exportCsv().catch((error) => message.error(error.message)) },
    { type: "divider" },
    { key: "save", icon: <SaveOutlined />, label: hasSavedFilter ? "覆盖筛选方案" : "保存筛选方案", onClick: saveCurrentFilter },
    { key: "apply", icon: <FolderOpenOutlined />, label: "应用筛选方案", disabled: !hasSavedFilter, onClick: applySavedFilter },
    { key: "remove", icon: <DeleteOutlined />, danger: true, label: "删除筛选方案", disabled: !hasSavedFilter, onClick: removeSavedFilter },
  ] };
  const activeFilterCount = ["date", "month", "start", "end", "direction", "category1", "category2", "query"].filter((key) => params.has(key)).length;
  const advancedFilterCount = ["direction", "category1", "category2"].filter((key) => params.has(key)).length;
  const clearAdvancedFilters = () => setParams((current) => { const next = new URLSearchParams(current); ["direction", "category1", "category2"].forEach((key) => next.delete(key)); next.set("page", "1"); return next; });
  const renderAdvancedFilters = (inDrawer = false) => <div className="advanced-filter-panel">
    <Flex vertical gap={14}>
      {!inDrawer && <Flex align="center" justify="space-between"><Typography.Text strong>更多筛选</Typography.Text>{advancedFilterCount > 0 && <Typography.Text type="secondary">已启用 {advancedFilterCount} 项</Typography.Text>}</Flex>}
      <Flex vertical gap={6}><Typography.Text type="secondary">收支类型</Typography.Text><Select allowClear placeholder="全部类型" value={params.get("direction") || undefined} options={[{ label: "支出", value: "expense" }, { label: "收入", value: "income" }]} onChange={(value) => set("direction", value || "")} /></Flex>
      <Flex gap={10} className="advanced-category-grid"><Flex vertical gap={6} flex={1}><Typography.Text type="secondary">一级分类</Typography.Text><Select allowClear placeholder="全部一级分类" value={params.get("category1") || undefined} options={primary.map((value) => ({ label: value, value }))} onChange={(value) => set("category1", value || "")} /></Flex><Flex vertical gap={6} flex={1}><Typography.Text type="secondary">二级分类</Typography.Text><Select allowClear placeholder="全部二级分类" value={params.get("category2") || undefined} options={secondary.map((value) => ({ label: value, value }))} onChange={(value) => set("category2", value || "")} /></Flex></Flex>
      <Flex align="center" justify="space-between"><Button type="text" disabled={!advancedFilterCount} onClick={clearAdvancedFilters}>清除更多筛选</Button><Button type="primary" onClick={() => setFilterOpen(false)}>完成</Button></Flex>
    </Flex>
  </div>;
  const sorter = params.get("sortBy") ? { field: params.get("sortBy"), order: params.get("sortOrder") === "asc" ? "ascend" : "descend" } : null;
  return <div className="page-stack">
    {params.get("start") && params.get("end") && <Alert type="info" showIcon message={`当前账目范围：${params.get("start")} 至 ${params.get("end")}`} />}
    {screens.md ? <Card size="small" className="transaction-filter-card"><Flex align="center" justify="space-between" wrap gap={12}>
      <Flex align="center" wrap gap={8} className="transaction-filter-main">
      <DatePicker picker="month" allowClear value={params.get("month") ? dayjs(params.get("month")) : null} onChange={(value) => { setParams((current) => { const next = new URLSearchParams(current); value ? next.set("month", value.format("YYYY-MM")) : next.delete("month"); next.delete("date"); next.delete("start"); next.delete("end"); next.set("page", "1"); return next; }); }} placeholder="全部月份" />
      <DatePicker allowClear value={params.get("date") ? dayjs(params.get("date")) : null} onChange={(value) => { setParams((current) => { const next = new URLSearchParams(current); value ? next.set("date", value.format("YYYY-MM-DD")) : next.delete("date"); next.delete("month"); next.delete("start"); next.delete("end"); next.set("page", "1"); return next; }); }} placeholder="具体日期" />
      <Input.Search ref={searchRef} allowClear placeholder="搜索项目、备注或分类" value={searchValue} onChange={(event) => { setSearchValue(event.target.value); if (!event.target.value) set("query", ""); }} onSearch={(value) => set("query", value.trim())} className="transaction-search" />
      <Popover open={filterOpen} onOpenChange={setFilterOpen} trigger="click" placement="bottomLeft" content={renderAdvancedFilters()}><Badge count={advancedFilterCount} size="small" offset={[-2, 2]}><Button icon={<FilterOutlined />}>更多筛选</Button></Badge></Popover>
      <Dropdown menu={savedFilterMenu} trigger={["click"]}><Badge dot={hasSavedFilter} offset={[-2, 3]}><Button icon={<FolderOpenOutlined />}>筛选方案</Button></Badge></Dropdown>
      {activeFilterCount > 0 && <Button type="text" icon={<ClearOutlined />} onClick={() => setParams(new URLSearchParams())}>清除全部</Button>}
      </Flex>
      <Flex align="center" wrap gap={8} className="transaction-table-actions"><Typography.Text type="secondary">{data?.total || 0} 笔账目</Typography.Text><Button icon={<DownloadOutlined />} onClick={() => exportCsv().catch((error) => message.error(error.message))}>导出结果</Button><Dropdown menu={columnMenu} trigger={["click"]}><Button icon={<SettingOutlined />}>显示列</Button></Dropdown></Flex>
    </Flex></Card> : <Card size="small" className="transaction-filter-card transaction-filter-mobile">
      <Flex vertical gap={10}>
        <Input.Search ref={searchRef} allowClear placeholder="搜索项目、备注或分类" value={searchValue} onChange={(event) => { setSearchValue(event.target.value); if (!event.target.value) set("query", ""); }} onSearch={(value) => set("query", value.trim())} className="transaction-search" />
        <Flex gap={8} align="center">
          <DatePicker className="mobile-month-picker" picker="month" allowClear value={params.get("month") ? dayjs(params.get("month")) : null} onChange={(value) => { setParams((current) => { const next = new URLSearchParams(current); value ? next.set("month", value.format("YYYY-MM")) : next.delete("month"); next.delete("date"); next.delete("start"); next.delete("end"); next.set("page", "1"); return next; }); }} placeholder="全部月份" />
          <DatePicker className="mobile-date-picker" allowClear value={params.get("date") ? dayjs(params.get("date")) : null} onChange={(value) => { setParams((current) => { const next = new URLSearchParams(current); value ? next.set("date", value.format("YYYY-MM-DD")) : next.delete("date"); next.delete("month"); next.delete("start"); next.delete("end"); next.set("page", "1"); return next; }); }} placeholder="具体日期" />
          <Badge count={advancedFilterCount} size="small" offset={[-2, 2]}><Button icon={<FilterOutlined />} onClick={() => setFilterOpen(true)}>筛选</Button></Badge>
          <Dropdown menu={mobileActionMenu} trigger={["click"]}><Badge dot={hasSavedFilter} offset={[-2, 3]}><Button icon={<MoreOutlined />} aria-label="更多账目操作" /></Badge></Dropdown>
        </Flex>
        <Flex align="center" justify="space-between" className="mobile-filter-summary">
          <Typography.Text type="secondary">共 {data?.total || 0} 笔账目{activeFilterCount > 0 ? ` · 已筛选 ${activeFilterCount} 项` : ""}</Typography.Text>
          {activeFilterCount > 0 && <Button type="link" size="small" icon={<ClearOutlined />} onClick={() => setParams(new URLSearchParams())}>清除筛选</Button>}
        </Flex>
      </Flex>
    </Card>}
    {selectedRowKeys.length > 0 && <Alert className="transaction-selection-alert" type="info" showIcon message={`已选择 ${selectedRowKeys.length} 笔账目`} action={<Space><Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button><Button size="small" type="primary" icon={<TagsOutlined />} onClick={() => setBulkOpen(true)}>批量分类</Button></Space>} />}
    {screens.md ? <Card styles={{ body: { padding: 0 } }}><Table<Transaction> rowKey="id" loading={isLoading} columns={columns} dataSource={data?.records || []} scroll={{ x: 980 }} rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }} pagination={{ current: data?.page || page, pageSize, total: data?.total || 0, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (total) => `共 ${total} 笔` }} onChange={(pagination, _filters, sort: any) => { setParams((current) => { const next = new URLSearchParams(current); next.set("page", String(pagination.current || 1)); next.set("pageSize", String(pagination.pageSize || 20)); const active = Array.isArray(sort) ? sort[0] : sort; if (active?.field && active?.order) { next.set("sortBy", String(active.field)); next.set("sortOrder", active.order === "ascend" ? "asc" : "desc"); } else { next.delete("sortBy"); next.delete("sortOrder"); } return next; }); }} /></Card> : <Card styles={{ body: { padding: 0 } }}><List loading={isLoading} dataSource={data?.records || []} locale={{ emptyText: <Empty /> }} renderItem={(row) => <List.Item className="transaction-mobile-row" onClick={() => openEdit(row)} extra={<Typography.Text strong type={row.amount < 0 ? "danger" : "success"}>{row.amount < 0 ? "−" : "+"}{money(Math.abs(row.amount))}</Typography.Text>}><List.Item.Meta title={row.item} description={`${row.date} · ${row.category1} / ${row.category2}`} /></List.Item>} pagination={{ current: data?.page || 1, pageSize, total: data?.total || 0, onChange: (value) => set("page", String(value)), size: "small" }} /></Card>}
    <TransactionDrawer open={drawer} onOpenChange={setDrawer} record={editing} />
    {!screens.md && <Drawer className="mobile-filter-drawer" title="筛选账目" placement="bottom" height="78vh" open={filterOpen} onClose={() => setFilterOpen(false)} destroyOnHidden>{renderAdvancedFilters(true)}</Drawer>}
    <Drawer title="批量分类" open={bulkOpen} width={440} onClose={() => setBulkOpen(false)} extra={<Typography.Text type="secondary">已选 {selectedRowKeys.length} 笔</Typography.Text>} footer={<Flex justify="flex-end" gap={8}><Button onClick={() => setBulkOpen(false)}>取消</Button><Button type="primary" loading={bulk.isPending} onClick={() => bulkForm.submit()}>确认更新</Button></Flex>}><Form form={bulkForm} layout="vertical" onFinish={(values) => bulk.mutate(values)}><Form.Item name="category1" label="一级分类" rules={[{ required: true }]}><Select options={primary.map((value) => ({ label: value, value }))} onChange={(value) => { bulkForm.setFieldValue("category2", undefined); }} /></Form.Item><Form.Item noStyle shouldUpdate={(prev, next) => prev.category1 !== next.category1}>{({ getFieldValue }) => <Form.Item name="category2" label="二级分类" rules={[{ required: true }]}><Select options={[...new Set(dictionaries?.categories.filter((row) => row.category1 === getFieldValue("category1")).map((row) => row.category2))].map((value) => ({ label: value, value }))} /></Form.Item>}</Form.Item></Form></Drawer>
  </div>;
}
