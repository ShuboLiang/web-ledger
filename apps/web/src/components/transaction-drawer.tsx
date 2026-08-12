import { RobotOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, DatePicker, Drawer, Form, Input, InputNumber, Radio, Select, Space, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Dictionaries, type Transaction } from "@/lib/api";

type FormValues = { date: any; direction: "expense" | "income"; amount: number; item: string; category1: string; category2: string; accountId?: string; note?: string };

export function TransactionDrawer({ open, onOpenChange, record }: { open: boolean; onOpenChange: (open: boolean) => void; record?: Transaction | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["dictionaries"], queryFn: () => api<Dictionaries>("/api/dictionaries") });
  const categories = data?.categories || [];
  const primaryOptions = useMemo(() => [...new Set(categories.map((row) => row.category1))], [categories]);
  const selectedPrimary = Form.useWatch("category1", form);
  const secondaryOptions = useMemo(() => [...new Set(categories.filter((row) => row.category1 === selectedPrimary).map((row) => row.category2))], [categories, selectedPrimary]);
  useEffect(() => {
    if (!open) return;
    const category1 = record?.category1 || (primaryOptions.includes("餐饮") ? "餐饮" : primaryOptions[0]) || "";
    const category2 = record?.category2 || categories.find((row) => row.category1 === category1)?.category2 || "";
    form.setFieldsValue({ date: dayjs(record?.date), direction: record ? (record.amount > 0 ? "income" : "expense") : "expense", amount: record ? Math.abs(record.amount) : undefined, item: record?.item || "", category1, category2, accountId: record?.accountId || data?.accounts?.[0]?.id, note: record?.note || "" });
  }, [open, record, data]);
  const save = useMutation({
    mutationFn: (values: FormValues) => api(record ? `/api/transactions/${record.id}` : "/api/transactions", { method: record ? "PUT" : "POST", body: JSON.stringify({ ...values, date: values.date.format("YYYY-MM-DD") }) }),
    onSuccess: async () => { await queryClient.invalidateQueries(); message.success(record ? "账目已更新" : "账目已记录"); onOpenChange(false); },
    onError: (error: Error) => message.error(error.message),
  });
  const primaryChoices = [...primaryOptions.map((value) => ({ label: value, value })), ...(record?.category1 && !primaryOptions.includes(record.category1) ? [{ label: `${record.category1}（已停用）`, value: record.category1 }] : [])];
  const secondaryChoices = [...secondaryOptions.map((value) => ({ label: value, value })), ...(record?.category1 === selectedPrimary && record?.category2 && !secondaryOptions.includes(record.category2) ? [{ label: `${record.category2}（已停用）`, value: record.category2 }] : [])];
  return <Drawer title={record ? "编辑账目" : "记一笔"} open={open} width={520} destroyOnHidden onClose={() => onOpenChange(false)} extra={<Typography.Text type="secondary">保存后自动更新统计</Typography.Text>} footer={<Space style={{ width: "100%", justifyContent: "flex-end" }}><Button onClick={() => onOpenChange(false)}>取消</Button><Button type="primary" loading={save.isPending} onClick={() => form.submit()}>保存账目</Button></Space>}>
    {!record && <Button block size="large" icon={<RobotOutlined />} className="ai-entry-button" onClick={() => { onOpenChange(false); navigate("/ai"); }}>使用 AI 自然语言记账</Button>}
    <Form form={form} layout="vertical" requiredMark="optional" onFinish={(values) => save.mutate(values)} style={{ marginTop: 20 }}>
      <div className="form-grid-2"><Form.Item label="日期" name="date" rules={[{ required: true, message: "请选择日期" }]}><DatePicker style={{ width: "100%" }} /></Form.Item><Form.Item label="收支" name="direction" rules={[{ required: true }]}><Radio.Group optionType="button" buttonStyle="solid" options={[{ label: "支出", value: "expense" }, { label: "收入", value: "income" }]} /></Form.Item></div>
      <Form.Item label="金额" name="amount" rules={[{ required: true, message: "请输入金额" }, { type: "number", min: 0.01, message: "金额必须大于 0" }]}><InputNumber min={0.01} precision={2} prefix="¥" placeholder="0.00" style={{ width: "100%" }} /></Form.Item>
      <Form.Item label="项目" name="item" rules={[{ required: true, whitespace: true, max: 80 }]}><Input placeholder="例如：午饭" list="project-options" /></Form.Item>
      <datalist id="project-options">{data?.projects.map((value) => <option key={value} value={value} />)}</datalist>
      <div className="form-grid-2"><Form.Item label="一级分类" name="category1" rules={[{ required: true }]}><Select aria-label="一级分类" placeholder="请选择" options={primaryChoices} onChange={(category1) => form.setFieldValue("category2", categories.find((row) => row.category1 === category1)?.category2)} /></Form.Item><Form.Item label="二级分类" name="category2" rules={[{ required: true }]}><Select aria-label="二级分类" disabled={!selectedPrimary} placeholder="请先选择一级分类" options={secondaryChoices} /></Form.Item></div>
      <Form.Item label="账户" name="accountId"><Select options={data?.accounts?.map((account) => ({ label: account.name, value: account.id })) || []} placeholder="默认账户" /></Form.Item>
      <Form.Item label="备注" name="note" rules={[{ max: 500 }]}><Input.TextArea rows={4} showCount maxLength={500} /></Form.Item>
    </Form>
  </Drawer>;
}
