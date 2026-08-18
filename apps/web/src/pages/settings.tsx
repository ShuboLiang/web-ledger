import {
  AuditOutlined,
  RobotOutlined,
  CheckCircleFilled,
  CloudDownloadOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  KeyOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Form,
  Input,
  List,
  Menu,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"

type Values = {
  name: string
  providerId: string
  modelId: string
  baseUrl: string
  apiType: string
  apiKey?: string
  authHeader: boolean
  thinkingEnabled: boolean
  thinkingLevel:
    "default" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
}
const thinkingLabels: Record<Values["thinkingLevel"], string> = {
  default: "默认",
  minimal: "极简",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "很高",
  max: "最高",
}
const menu = [
  { key: "profile", label: "个人设置", icon: <UserOutlined />, disabled: true },
  {
    key: "ledger",
    label: "账本设置",
    icon: <SettingOutlined />,
    disabled: true,
  },
  { key: "ai", label: "AI 模型", icon: <RobotOutlined /> },
  { key: "security", label: "安全与登录", icon: <SafetyCertificateOutlined /> },
  { key: "data", label: "数据导入导出", icon: <DatabaseOutlined /> },
  { key: "backup", label: "备份与恢复", icon: <CloudDownloadOutlined /> },
  { key: "audit", label: "审计日志", icon: <AuditOutlined /> },
].map((item) =>
  item.key === "ai"
    ? item
    : {
        ...item,
        disabled: true,
        label: (
          <Flex align="center" justify="space-between" gap={8}>
            <span>{item.label}</span>
            <Tag bordered={false}>规划中</Tag>
          </Flex>
        ),
      },
)
const settingsProfileStorageKey = "qing-zhang-settings-profile"

export function SettingsPage() {
  const [section, setSection] = useState("ai")
  return (
    <Row gutter={[20, 20]}>
      <Col xs={24} lg={6} xl={5}>
        <Card styles={{ body: { padding: 8 } }}>
          <Menu
            mode="inline"
            selectedKeys={[section]}
            items={menu}
            onClick={({ key }) => setSection(key)}
          />
        </Card>
      </Col>
      <Col xs={24} lg={18} xl={19}>
        <AiModelSettings />
      </Col>
    </Row>
  )
}

function AiModelSettings() {
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()
  const { data, isLoading } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => api<any>("/api/ai/settings"),
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form] = Form.useForm<Values>()
  const thinkingEnabled = Form.useWatch("thinkingEnabled", form)
  const selectProfile = (profile: any) => {
    setSelectedId(profile.id)
    setIsNew(false)
    sessionStorage.setItem(settingsProfileStorageKey, profile.id)
    form.setFieldsValue({ ...profile, apiKey: "" })
  }
  useEffect(() => {
    if (data && !selectedId && !isNew) {
      const savedId = sessionStorage.getItem(settingsProfileStorageKey)
      const profile =
        data.profiles?.find((item: any) => item.id === savedId) ||
        data.profiles?.find((item: any) => item.isDefault) ||
        data.profiles?.[0]
      if (profile) selectProfile(profile)
      else sessionStorage.removeItem(settingsProfileStorageKey)
    }
  }, [data, selectedId, isNew])
  const save = useMutation({
    mutationFn: async (values: Values) =>
      isNew
        ? api<any>("/api/ai/settings/profiles", {
            method: "POST",
            body: JSON.stringify(values),
          })
        : api<any>(`/api/ai/settings/profiles/${selectedId}`, {
            method: "PUT",
            body: JSON.stringify(values),
          }),
    onSuccess: async (result) => {
      setSelectedId(result.id)
      setIsNew(false)
      sessionStorage.setItem(settingsProfileStorageKey, result.id)
      await queryClient.invalidateQueries({ queryKey: ["ai-settings"] })
      message.success(
        result.isDefault
          ? "模型配置已保存，当前仍为默认模型"
          : "模型配置已保存",
      )
    },
    onError: (error: Error) => message.error(error.message),
  })
  const makeDefault = useMutation({
    mutationFn: (id: string) =>
      api(`/api/ai/settings/profiles/${id}/default`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-settings"] })
      message.success("默认模型已切换")
    },
  })
  const remove = (id: string) =>
    modal.confirm({
      title: "删除模型配置",
      content: "此操作不会删除账本数据。确定继续吗？",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await api(`/api/ai/settings/profiles/${id}`, { method: "DELETE" })
        setSelectedId(null)
        sessionStorage.removeItem(settingsProfileStorageKey)
        await queryClient.invalidateQueries({ queryKey: ["ai-settings"] })
        message.success("模型配置已删除")
      },
    })
  const selected = data?.profiles?.find(
    (profile: any) => profile.id === selectedId,
  )
  const newProfile = () => {
    setIsNew(true)
    setSelectedId(null)
    form.resetFields()
    form.setFieldsValue({
      name: "新模型配置",
      providerId: "my-provider",
      modelId: "my-model",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiType: "openai-completions",
      apiKey: "",
      authHeader: true,
      thinkingEnabled: false,
      thinkingLevel: "default",
    })
  }
  return (
    <div className="page-stack">
      <Card
        loading={isLoading}
        className="section-card"
        title={
          <div>
            <Typography.Text strong>AI 模型配置</Typography.Text>
            <Typography.Paragraph type="secondary" className="card-subtitle">
              只使用你在这里创建的配置；完整 API Key 不会返回浏览器。
            </Typography.Paragraph>
          </div>
        }
        extra={
          <Button icon={<PlusOutlined />} onClick={newProfile}>
            新增配置
          </Button>
        }
      >
        <Row gutter={[16, 16]}>
          {data?.profiles?.map((profile: any) => (
            <Col xs={24} md={12} xl={8} key={profile.id}>
              <Card
                hoverable
                size="small"
                className={
                  selectedId === profile.id ? "model-card active" : "model-card"
                }
                onClick={() => selectProfile(profile)}
              >
                <Flex
                  className="model-card-head"
                  justify="space-between"
                  align="flex-start"
                >
                  <KeyOutlined className="model-icon" />
                  {profile.isDefault && (
                    <Tag
                      className="model-default-tag"
                      color="success"
                      icon={<CheckCircleFilled />}
                    >
                      当前默认
                    </Tag>
                  )}
                </Flex>
                <div className="model-card-meta">
                  <Typography.Title level={5}>{profile.name}</Typography.Title>
                  <Typography.Text type="secondary" ellipsis>
                    {profile.providerId} / {profile.modelId}
                  </Typography.Text>
                </div>
                <Flex
                  className="model-card-footer"
                  align="center"
                  justify="space-between"
                  gap={12}
                >
                  <Space size={4} wrap>
                    <Tag
                      bordered={false}
                      color={profile.hasApiKey ? "success" : "warning"}
                    >
                      {profile.hasApiKey ? "API Key 已配置" : "缺少 API Key"}
                    </Tag>
                    {profile.thinkingEnabled && (
                      <Tag bordered={false} color="processing">
                        思考 ·{" "}
                        {thinkingLabels[
                          profile.thinkingLevel as Values["thinkingLevel"]
                        ] || profile.thinkingLevel}
                      </Tag>
                    )}
                  </Space>
                  {!profile.isDefault && (
                    <Button
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation()
                        makeDefault.mutate(profile.id)
                      }}
                    >
                      设为默认
                    </Button>
                  )}
                </Flex>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
      <Card
        title={isNew ? "新增配置" : "配置详情"}
        extra={
          selectedId && !selected?.isDefault ? (
            <Button
              danger
              type="text"
              icon={<DeleteOutlined />}
              onClick={() => remove(selectedId)}
            >
              删除
            </Button>
          ) : null
        }
      >
        {!selectedId && !isNew ? (
          <Empty description="请选择或新增模型配置" />
        ) : (
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => save.mutate(values)}
          >
            <Row gutter={16}>
              <Col xs={24}>
                <Form.Item
                  name="name"
                  label="配置名称"
                  rules={[{ required: true }]}
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="providerId"
                  label="服务商标识"
                  rules={[{ required: true }]}
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="modelId"
                  label="模型标识"
                  rules={[{ required: true }]}
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item
                  name="baseUrl"
                  label="Base URL"
                  rules={[
                    { required: true },
                    { type: "url", message: "请输入有效 URL" },
                  ]}
                >
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="apiType"
                  label="接口协议"
                  rules={[{ required: true }]}
                >
                  <Select
                    options={[
                      {
                        label: "OpenAI Chat Completions",
                        value: "openai-completions",
                      },
                      { label: "OpenAI Responses", value: "openai-responses" },
                      {
                        label: "Anthropic Messages",
                        value: "anthropic-messages",
                      },
                      {
                        label: "Google Generative AI",
                        value: "google-generative-ai",
                      },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="apiKey" label="API Key">
                  <Input.Password
                    placeholder={
                      selected?.hasApiKey
                        ? "已配置，留空保持不变"
                        : "输入 API Key"
                    }
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="authHeader"
                  label="发送认证请求头"
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="thinkingEnabled"
                  label="启用思考"
                  valuePropName="checked"
                  tooltip="仅在模型和接口支持推理时启用"
                >
                  <Switch />
                </Form.Item>
              </Col>
              {thinkingEnabled && (
                <Col xs={24} md={12}>
                  <Form.Item
                    name="thinkingLevel"
                    label="思考等级"
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={Object.entries(thinkingLabels).map(
                        ([value, label]) => ({ value, label }),
                      )}
                    />
                  </Form.Item>
                </Col>
              )}
            </Row>
            <Flex justify="flex-end" gap={8}>
              {selectedId && !selected?.isDefault && (
                <Button
                  loading={makeDefault.isPending}
                  onClick={() => makeDefault.mutate(selectedId)}
                >
                  设为默认
                </Button>
              )}
              <Button type="primary" htmlType="submit" loading={save.isPending}>
                保存配置
              </Button>
            </Flex>
          </Form>
        )}
      </Card>
      <AiAssistantPrompt settings={data} loading={isLoading} />
    </div>
  )
}

function AiAssistantPrompt({
  settings,
  loading,
}: {
  settings: any
  loading: boolean
}) {
  const queryClient = useQueryClient()
  const { message } = App.useApp()
  const [form] = Form.useForm<{ customPrompt: string }>()
  useEffect(() => {
    form.setFieldsValue({ customPrompt: settings?.customPrompt || "" })
  }, [settings?.customPrompt, form])
  const save = useMutation({
    mutationFn: (values: { customPrompt: string }) =>
      api("/api/ai/settings/prompt", {
        method: "PUT",
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-settings"] })
      message.success("助手提示词已保存，新对话或下一轮提问起生效")
    },
    onError: (error: Error) => message.error(error.message),
  })
  return (
    <Card
      loading={loading}
      className="section-card"
      title={
        <div>
          <Typography.Text strong>助手提示词</Typography.Text>
          <Typography.Paragraph type="secondary" className="card-subtitle">
            补充你的记账习惯，例如常用账户、分类偏好或回答风格。不会替换内置记账规则。
          </Typography.Paragraph>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="customPrompt"
          extra="最多 4000 字。留空并保存可清除自定义提示词。"
        >
          <Input.TextArea
            autoSize={{ minRows: 5, maxRows: 12 }}
            maxLength={4000}
            showCount
            placeholder="例如：餐饮尽量记到「餐饮/外卖」；日常付款账户是招商银行卡；回答尽量简短。"
          />
        </Form.Item>
        <Flex justify="flex-end">
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            保存提示词
          </Button>
        </Flex>
      </Form>
    </Card>
  )
}
