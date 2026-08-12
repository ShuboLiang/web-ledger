import { AuditOutlined, RobotOutlined, CheckCircleFilled, CloudDownloadOutlined, DatabaseOutlined, DeleteOutlined, KeyOutlined, PlusOutlined, SafetyCertificateOutlined, SettingOutlined, UserOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Col, Empty, Flex, Form, Input, List, Menu, Row, Select, Space, Switch, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Values = { name: string; providerId: string; modelId: string; baseUrl: string; apiType: string; apiKey?: string; authHeader: boolean };
const menu = [
  { key: "profile", label: "个人设置", icon: <UserOutlined />, disabled: true }, { key: "ledger", label: "账本设置", icon: <SettingOutlined />, disabled: true },
  { key: "ai", label: "AI 模型", icon: <RobotOutlined /> }, { key: "security", label: "安全与登录", icon: <SafetyCertificateOutlined /> },
  { key: "data", label: "数据导入导出", icon: <DatabaseOutlined /> }, { key: "backup", label: "备份与恢复", icon: <CloudDownloadOutlined /> },
  { key: "audit", label: "审计日志", icon: <AuditOutlined /> },
].map((item) => item.key === "ai" ? item : { ...item, disabled: true, label: <Flex align="center" justify="space-between" gap={8}><span>{item.label}</span><Tag bordered={false}>规划中</Tag></Flex> });

export function SettingsPage() {
  const [section, setSection] = useState("ai");
  return <Row gutter={[20, 20]}><Col xs={24} lg={6} xl={5}><Card styles={{ body: { padding: 8 } }}><Menu mode="inline" selectedKeys={[section]} items={menu} onClick={({ key }) => setSection(key)} /></Card></Col><Col xs={24} lg={18} xl={19}><AiModelSettings /></Col></Row>;
}

function AiModelSettings() {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { data, isLoading } = useQuery({ queryKey: ["ai-settings"], queryFn: () => api<any>("/api/ai/settings") });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form] = Form.useForm<Values>();
  const selectProfile = (profile: any) => { setSelectedId(profile.id); setIsNew(false); form.setFieldsValue({ ...profile, apiKey: "" }); };
  useEffect(() => { if (data && !selectedId && !isNew) { const profile = data.profiles?.find((item: any) => item.isDefault) || data.profiles?.[0]; if (profile) selectProfile(profile); } }, [data]);
  const save = useMutation({ mutationFn: async (values: Values) => { if (isNew) return api<any>("/api/ai/settings/profiles", { method: "POST", body: JSON.stringify({ ...values, isDefault: true }) }); const result = await api<any>(`/api/ai/settings/profiles/${selectedId}`, { method: "PUT", body: JSON.stringify(values) }); await api(`/api/ai/settings/profiles/${selectedId}/default`, { method: "POST" }); return result; }, onSuccess: async (result) => { setSelectedId(result.id); setIsNew(false); await queryClient.invalidateQueries({ queryKey: ["ai-settings"] }); message.success("模型配置已保存并设为默认"); }, onError: (error: Error) => message.error(error.message) });
  const makeDefault = useMutation({ mutationFn: (id: string) => api(`/api/ai/settings/profiles/${id}/default`, { method: "POST" }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["ai-settings"] }); message.success("默认模型已切换"); } });
  const remove = (id: string) => modal.confirm({ title: "删除模型配置", content: "此操作不会删除账本数据。确定继续吗？", okText: "删除", okButtonProps: { danger: true }, onOk: async () => { await api(`/api/ai/settings/profiles/${id}`, { method: "DELETE" }); setSelectedId(null); await queryClient.invalidateQueries({ queryKey: ["ai-settings"] }); message.success("模型配置已删除"); } });
  const selected = data?.profiles?.find((profile: any) => profile.id === selectedId);
  const newProfile = () => { setIsNew(true); setSelectedId(null); form.resetFields(); form.setFieldsValue({ name: "新模型配置", providerId: "my-provider", modelId: "my-model", baseUrl: "http://127.0.0.1:11434/v1", apiType: "openai-completions", apiKey: "", authHeader: true }); };
  return <div className="page-stack"><Card loading={isLoading} title={<div><Typography.Text strong>AI 模型配置</Typography.Text><Typography.Paragraph type="secondary" className="card-subtitle">只使用你在这里创建的配置；完整 API Key 不会返回浏览器。</Typography.Paragraph></div>} extra={<Button icon={<PlusOutlined />} onClick={newProfile}>新增配置</Button>}><Row gutter={[16, 16]}>{data?.profiles?.map((profile: any) => <Col xs={24} md={12} xl={8} key={profile.id}><Card hoverable size="small" className={selectedId === profile.id ? "model-card active" : "model-card"} onClick={() => selectProfile(profile)}><Flex justify="space-between" align="flex-start"><KeyOutlined className="model-icon" />{profile.isDefault && <CheckCircleFilled className="model-default" />}</Flex><Typography.Title level={5}>{profile.name}</Typography.Title><Typography.Text type="secondary">{profile.providerId} / {profile.modelId}</Typography.Text><Flex gap={8} style={{ marginTop: 14 }}><Tag color={profile.hasApiKey ? "success" : "warning"}>{profile.hasApiKey ? "密钥已配置" : "缺少密钥"}</Tag>{!profile.isDefault && <Button size="small" type="link" onClick={(event) => { event.stopPropagation(); makeDefault.mutate(profile.id); }}>设为默认</Button>}</Flex></Card></Col>)}</Row></Card>
    <Card title={isNew ? "新增配置" : "配置详情"} extra={selectedId && !selected?.isDefault ? <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(selectedId)}>删除</Button> : null}>
      {!selectedId && !isNew ? <Empty description="请选择或新增模型配置" /> : <><Alert type="info" showIcon message="Pi SDK 将使用该配置创建 Agent 会话；保存后不会向浏览器回传完整密钥。" style={{ marginBottom: 20 }} /><Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}><Row gutter={16}><Col xs={24}><Form.Item name="name" label="配置名称" rules={[{ required: true }]}><Input /></Form.Item></Col><Col xs={24} md={12}><Form.Item name="providerId" label="服务商标识" rules={[{ required: true }]}><Input /></Form.Item></Col><Col xs={24} md={12}><Form.Item name="modelId" label="模型标识" rules={[{ required: true }]}><Input /></Form.Item></Col><Col xs={24}><Form.Item name="baseUrl" label="Base URL" rules={[{ required: true }, { type: "url", message: "请输入有效 URL" }]}><Input /></Form.Item></Col><Col xs={24} md={12}><Form.Item name="apiType" label="接口协议" rules={[{ required: true }]}><Select options={[{ label: "OpenAI Chat Completions", value: "openai-completions" }, { label: "OpenAI Responses", value: "openai-responses" }, { label: "Anthropic Messages", value: "anthropic-messages" }, { label: "Google Generative AI", value: "google-generative-ai" }]} /></Form.Item></Col><Col xs={24} md={12}><Form.Item name="apiKey" label="API Key"><Input.Password placeholder={selected?.hasApiKey ? "已配置，留空保持不变" : "输入 API Key"} /></Form.Item></Col><Col xs={24}><Form.Item name="authHeader" label="发送认证请求头" valuePropName="checked"><Switch /></Form.Item></Col></Row><Flex justify="flex-end"><Button type="primary" htmlType="submit" loading={save.isPending}>保存并设为默认</Button></Flex></Form></>}
    </Card>
  </div>;
}
