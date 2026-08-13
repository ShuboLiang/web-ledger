import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  MessageOutlined,
  PlusOutlined,
  RobotOutlined,
  UserOutlined,
} from "@ant-design/icons"
import { Bubble, Conversations, Sender } from "@ant-design/x"
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  App,
  Avatar,
  Button,
  Card,
  DatePicker,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  InputNumber,
  List,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { api, type Dictionaries } from "@/lib/api"
import { conversationId, money } from "@/lib/utils"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  thinking?: string | null
}
type Proposal = {
  type: "create" | "update" | "delete"
  id?: number
  records?: any[]
  current?: any
  changes?: any
  reason?: string
  _humanEdited?: boolean
}
type AiResponse = {
  message: string
  conversationId: string
  proposals: Proposal[]
  warning?: string
}
type Chat = {
  id: string
  title: string
  messageCount: number
  updatedAt: string
}
type ChatDetail = {
  id: string
  title: string
  messages: Message[]
  proposals: Proposal[]
}

const welcome: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "你好，我可以帮你**记账、查账、改账和分析消费**。\n\n例如：`今天午饭 18 元`，或者问我“这个月餐饮花了多少？”",
}
type SendCommand = { text: string; conversationId: string }
type ProposalFormValues = {
  date: dayjs.Dayjs
  direction: "expense" | "income"
  amount: number
  item: string
  category1: string
  category2: string
  note?: string
}
type EditingProposal = {
  proposalIndex: number
  recordIndex?: number
  label: string
}
const aiConversationStorageKey = "qing-zhang-ai-conversation"

export function AiPage() {
  const queryClient = useQueryClient()
  const screens = Grid.useBreakpoint()
  const { message, modal } = App.useApp()
  const [id, setId] = useState<string>("")
  const [input, setInput] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [editingProposal, setEditingProposal] =
    useState<EditingProposal | null>(null)
  const [proposalForm] = Form.useForm<ProposalFormValues>()
  const creatingInitial = useRef(false)
  const streamAbortRef = useRef<AbortController | null>(null)
  const { data: settings } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => api<any>("/api/ai/settings"),
  })
  // 模型配置里是否开启了思考：只有开启时才有真正的思考文本可展示
  const thinkingEnabled = Boolean(settings?.thinkingEnabled)
  const { data: dictionaries } = useQuery({
    queryKey: ["dictionaries"],
    queryFn: () => api<Dictionaries>("/api/dictionaries"),
  })
  const { data: history = [], isFetched: historyFetched } = useQuery({
    queryKey: ["ai-conversations"],
    queryFn: () => api<Chat[]>("/api/ai/conversations"),
  })
  const { data: chat } = useQuery({
    queryKey: ["ai-conversation", id],
    queryFn: () => api<ChatDetail>(`/api/ai/conversations/${id}`),
    enabled: Boolean(id),
  })
  useEffect(() => {
    if (!historyFetched || id || creatingInitial.current) return
    const savedId = sessionStorage.getItem(aiConversationStorageKey)
    const initialChat =
      history.find((item) => item.id === savedId) || history[0]
    if (initialChat) {
      setId(initialChat.id)
      return
    }
    creatingInitial.current = true
    const next = conversationId()
    api<ChatDetail>("/api/ai/conversations", {
      method: "POST",
      body: JSON.stringify({ id: next }),
    })
      .then(async () => {
        setId(next)
        await queryClient.invalidateQueries({ queryKey: ["ai-conversations"] })
      })
      .catch((error) => message.error(error.message))
      .finally(() => {
        creatingInitial.current = false
      })
  }, [historyFetched, history, id])
  useEffect(() => {
    if (id) sessionStorage.setItem(aiConversationStorageKey, id)
    else if (historyFetched && !history.length)
      sessionStorage.removeItem(aiConversationStorageKey)
  }, [id, historyFetched, history.length])
  const messages = chat?.messages.length ? chat.messages : [welcome]
  const proposals = chat?.proposals || []
  const isCurrentConversationAnswering =
    useIsMutating({ mutationKey: ["ai-command", id], exact: true }) > 0
  const selectModel = useMutation({
    mutationFn: (profileId: string) =>
      api(`/api/ai/settings/profiles/${profileId}/default`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-settings"] })
      message.success("当前模型已切换，新会话起生效")
    },
  })
  const [stream, setStream] = useState<{
    thinking: string
    text: string
    tool: { label: string } | null
  } | null>(null)
  const send = useMutation({
    mutationKey: ["ai-command", id],
    mutationFn: async ({ text, conversationId }: SendCommand) => {
      const controller = new AbortController()
      streamAbortRef.current?.abort()
      streamAbortRef.current = controller
      const response = await fetch("/api/ai/command/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, conversationId }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || "请求失败")
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let finished = false
      while (!finished) {
        const { value, done } = await reader.read()
        finished = done
        buffer += decoder.decode(value || new Uint8Array(), {
          stream: !done,
        })
        const frames = buffer.split("\n\n")
        buffer = frames.pop() || ""
        for (const frame of frames) {
          const eventLine = frame
            .split("\n")
            .find((line) => line.startsWith("event:"))
          const dataLine = frame
            .split("\n")
            .find((line) => line.startsWith("data:"))
          if (!eventLine || !dataLine) continue
          const type = eventLine.slice(6).trim()
          let data: any = {}
          try {
            data = JSON.parse(dataLine.slice(5).trim())
          } catch {
            continue
          }
          if (type === "thinking" && typeof data?.delta === "string") {
            setStream((current) =>
              current
                ? { ...current, thinking: current.thinking + data.delta }
                : current,
            )
          } else if (type === "text" && typeof data?.delta === "string") {
            setStream((current) =>
              current
                ? { ...current, text: current.text + data.delta }
                : current,
            )
          } else if (type === "tool" && data?.label) {
            setStream((current) =>
              current ? { ...current, tool: { label: data.label } } : current,
            )
          } else if (type === "tool_done") {
            setStream((current) =>
              current ? { ...current, tool: null } : current,
            )
          } else if (type === "reset") {
            setStream((current) =>
              current
                ? {
                    ...current,
                    text: data?.text ? "" : current.text,
                    thinking: data?.thinking ? "" : current.thinking,
                    tool: null,
                  }
                : current,
            )
          } else if (type === "error") {
            throw new Error(data?.message || "AI 服务出错")
          }
        }
      }
      return { ok: true } as unknown as AiResponse
    },
    onMutate: async ({ text, conversationId }) => {
      setStream({ thinking: "", text: "", tool: null })
      await queryClient.cancelQueries({
        queryKey: ["ai-conversation", conversationId],
      })
      queryClient.setQueryData<ChatDetail>(
        ["ai-conversation", conversationId],
        (current) =>
          current
            ? {
                ...current,
                messages: [
                  ...current.messages,
                  { id: `pending-${Date.now()}`, role: "user", content: text },
                ],
              }
            : current,
      )
    },
    onSuccess: async (_data, { conversationId }) => {
      const [detail] = await Promise.all([
        api<ChatDetail>(`/api/ai/conversations/${conversationId}`),
        queryClient.invalidateQueries({ queryKey: ["ai-conversations"] }),
      ])
      queryClient.setQueryData(["ai-conversation", conversationId], detail)
      setStream(null)
    },
    onError: async (error: Error, { conversationId }) => {
      const detail = await api<ChatDetail>(
        `/api/ai/conversations/${conversationId}`,
      ).catch(() => null)
      if (detail)
        queryClient.setQueryData(["ai-conversation", conversationId], detail)
      setStream(null)
      if (error.name !== "AbortError") message.error(error.message)
    },
    onSettled: () => {
      streamAbortRef.current = null
    },
  })
  const execute = useMutation({
    mutationFn: () =>
      api("/api/ai/execute", {
        method: "POST",
        body: JSON.stringify({ conversationId: id }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      message.success("账目操作已执行")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const saveProposal = useMutation({
    mutationFn: (nextProposals: Proposal[]) =>
      api<{ proposals: Proposal[] }>(`/api/ai/conversations/${id}/proposals`, {
        method: "PUT",
        body: JSON.stringify({ proposals: nextProposals }),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData<ChatDetail>(
        ["ai-conversation", id],
        (current) =>
          current ? { ...current, proposals: result.proposals } : current,
      )
      setEditingProposal(null)
      message.success("待确认内容已更新")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const removeProposal = useMutation({
    mutationFn: (row: { proposalIndex: number; recordIndex?: number }) =>
      api<{ proposals: Proposal[] }>(
        `/api/ai/conversations/${id}/proposals/remove`,
        {
          method: "POST",
          body: JSON.stringify({
            proposalIndex: row.proposalIndex,
            recordIndex: row.recordIndex,
          }),
        },
      ),
    onSuccess: (result) => {
      queryClient.setQueryData<ChatDetail>(
        ["ai-conversation", id],
        (current) =>
          current ? { ...current, proposals: result.proposals } : current,
      )
      message.success("已移除该待确认操作")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const submit = (text = input) => {
    const value = text.trim()
    if (!value || !id || isCurrentConversationAnswering) return
    setInput("")
    send.mutate({ text: value, conversationId: id })
  }
  const newChat = async () => {
    const next = conversationId()
    await api("/api/ai/conversations", {
      method: "POST",
      body: JSON.stringify({ id: next }),
    })
    setId(next)
    await queryClient.invalidateQueries({ queryKey: ["ai-conversations"] })
  }
  const switchChat = (key: string) => {
    if (key !== id) setId(key)
    setHistoryOpen(false)
  }
  const cancel = async () => {
    try {
      await api(`/api/ai/conversations/${id}/outcome`, {
        method: "POST",
        body: JSON.stringify({ outcome: "cancelled" }),
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ai-conversation", id] }),
        queryClient.invalidateQueries({ queryKey: ["ai-conversations"] }),
      ])
      message.info("已取消待确认操作")
    } catch (error) {
      message.error(error instanceof Error ? error.message : "取消失败")
    }
  }
  const canDelete =
    Boolean(id) &&
    (history.length > 1 ||
      (history.find((c) => c.id === id)?.messageCount ?? 0) > 0)
  const deleteChat = () =>
    modal.confirm({
      title: "删除当前对话",
      content: "会永久删除这段对话的消息，但不会删除已经写入的账目。",
      okText: "删除对话",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await api(`/api/ai/conversations/${id}`, { method: "DELETE" })
        const remaining = history.filter((chat) => chat.id !== id)
        queryClient.setQueryData<Chat[]>(["ai-conversations"], remaining)
        setId(remaining[0]?.id || "")
        await queryClient.invalidateQueries({ queryKey: ["ai-conversations"] })
        message.success("对话已删除")
      },
    })
  const proposalRows = useMemo(
    () =>
      proposals.flatMap((proposal, proposalIndex) =>
        proposal.type === "create"
          ? (proposal.records || []).map((record, recordIndex) => ({
              ...record,
              label: "新增",
              proposalIndex,
              recordIndex,
              editable: true,
              humanEdited: proposal._humanEdited,
            }))
          : [
              {
                ...(proposal.current || {}),
                ...(proposal.changes || {}),
                direction:
                  proposal.changes?.direction ||
                  proposal.current?.direction ||
                  (Number(proposal.current?.amount) > 0 ? "income" : "expense"),
                label: proposal.type === "update" ? "修改" : "删除",
                proposalIndex,
                editable: proposal.type === "update",
                humanEdited: proposal._humanEdited,
              },
            ],
      ),
    [proposals],
  )
  const primaryCategories = useMemo(
    () => [
      ...new Set((dictionaries?.categories || []).map((row) => row.category1)),
    ],
    [dictionaries?.categories],
  )
  const selectedProposalCategory = Form.useWatch("category1", proposalForm)
  const selectedProposalSubcategory = Form.useWatch("category2", proposalForm)
  const secondaryCategories = useMemo(
    () => [
      ...new Set(
        (dictionaries?.categories || [])
          .filter((row) => row.category1 === selectedProposalCategory)
          .map((row) => row.category2),
      ),
    ],
    [dictionaries?.categories, selectedProposalCategory],
  )
  const proposalPrimaryChoices = [
    ...primaryCategories,
    ...(selectedProposalCategory &&
    !primaryCategories.includes(selectedProposalCategory)
      ? [selectedProposalCategory]
      : []),
  ].map((value) => ({ label: value, value }))
  const proposalSecondaryChoices = [
    ...secondaryCategories,
    ...(selectedProposalSubcategory &&
    !secondaryCategories.includes(selectedProposalSubcategory)
      ? [selectedProposalSubcategory]
      : []),
  ].map((value) => ({ label: value, value }))
  const openProposalEditor = (row: any) => {
    setEditingProposal({
      proposalIndex: row.proposalIndex,
      recordIndex: row.recordIndex,
      label: row.label,
    })
    proposalForm.setFieldsValue({
      date: dayjs(row.date),
      direction:
        row.direction || (Number(row.amount) > 0 ? "income" : "expense"),
      amount: Math.abs(Number(row.amount)),
      item: row.item || "",
      category1: row.category1 || "",
      category2: row.category2 || "",
      note: row.note || "",
    })
  }
  const submitProposalEdit = (values: ProposalFormValues) => {
    if (!editingProposal) return
    const record = { ...values, date: values.date.format("YYYY-MM-DD") }
    const next = proposals.map((proposal, proposalIndex) => {
      if (proposalIndex !== editingProposal.proposalIndex) return proposal
      if (proposal.type === "create")
        return {
          ...proposal,
          records: (proposal.records || []).map((existing, recordIndex) =>
            recordIndex === editingProposal.recordIndex ? record : existing,
          ),
        }
      if (proposal.type === "update") return { ...proposal, changes: record }
      return proposal
    })
    saveProposal.mutate(next)
  }
  const bubbleItems: any[] = messages.map((item) =>
    item.role === "assistant" && thinkingEnabled && item.thinking
      ? {
          key: item.id,
          role: "ai-persisted",
          content: (
            <div className="markdown-body">
              <details className="ai-thinking">
                <summary>思考过程</summary>
                <div className="ai-thinking-text">{item.thinking}</div>
              </details>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {item.content}
              </ReactMarkdown>
            </div>
          ),
        }
      : {
          key: item.id,
          role: item.role === "assistant" ? "ai" : "user",
          content: item.content,
        },
  )
  if (isCurrentConversationAnswering && stream) {
    bubbleItems.push({
      key: "streaming",
      role: "ai-streaming",
      content: (
        <div className="markdown-body">
          {thinkingEnabled && stream.thinking ? (
            <details open={!stream.text} className="ai-thinking">
              <summary>思考过程</summary>
              {stream.tool ? (
                <div className="ai-thinking-tool">
                  正在调用工具：{stream.tool.label} …
                </div>
              ) : null}
              <div className="ai-thinking-text">{stream.thinking}</div>
            </details>
          ) : stream.tool ? (
            <div className="ai-thinking-tool">
              正在调用工具：{stream.tool.label} …
            </div>
          ) : null}
          {stream.text ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {stream.text}
            </ReactMarkdown>
          ) : (
            <Typography.Text type="secondary">
              {stream.tool || stream.thinking
                ? thinkingEnabled
                  ? "正在思考…"
                  : "正在处理…"
                : thinkingEnabled
                  ? "正在查询账本并思考…"
                  : "正在查询账本…"}
            </Typography.Text>
          )}
        </div>
      ),
    })
  }
  const roles: any = {
    ai: {
      placement: "start",
      avatar: (
        <Avatar icon={<RobotOutlined />} style={{ background: "#176b62" }} />
      ),
      shape: "corner",
      contentRender: (content: string) => (
        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {String(content)}
          </ReactMarkdown>
        </div>
      ),
    },
    "ai-streaming": {
      placement: "start",
      avatar: (
        <Avatar icon={<RobotOutlined />} style={{ background: "#176b62" }} />
      ),
      shape: "corner",
    },
    "ai-persisted": {
      placement: "start",
      avatar: (
        <Avatar icon={<RobotOutlined />} style={{ background: "#176b62" }} />
      ),
      shape: "corner",
    },
    user: {
      placement: "end",
      avatar: <Avatar icon={<UserOutlined />} />,
      shape: "corner",
      variant: "filled",
    },
  }
  const modelMenu = {
    items: (settings?.profiles || []).map((profile: any) => ({
      key: profile.id,
      label: `${profile.isDefault ? "✓ " : ""}${profile.name}`,
      onClick: () => selectModel.mutate(profile.id),
    })),
  }
  return (
    <Card
      className="ai-workspace"
      styles={{
        body: { padding: 0, height: "calc(100vh - 150px)", minHeight: 620 },
      }}
    >
      <div className={`ai-grid ${!screens.xl ? "compact" : ""}`}>
        {screens.xl && (
          <Flex vertical className="ai-conversations">
            <Flex gap={8}>
              <Button
                block
                icon={<PlusOutlined />}
                onClick={() =>
                  newChat().catch((error) => message.error(error.message))
                }
              >
                新对话
              </Button>
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                disabled={!canDelete}
                aria-label="删除当前对话"
                onClick={deleteChat}
              />
            </Flex>
            <Typography.Text type="secondary" className="section-label">
              历史对话
            </Typography.Text>
            <Conversations
              activeKey={id}
              items={history.map((item) => ({
                key: item.id,
                label: item.title,
                icon: <MessageOutlined />,
              }))}
              onActiveChange={(key) => switchChat(String(key))}
            />
          </Flex>
        )}
        <section className="ai-chat">
          <Flex
            className="ai-chat-header"
            align="center"
            justify="space-between"
          >
            <Flex gap={8} align="center">
              {!screens.xl && (
                <Button
                  icon={<MessageOutlined />}
                  aria-label="打开历史对话"
                  onClick={() => setHistoryOpen(true)}
                />
              )}
              <Avatar
                icon={<RobotOutlined />}
                style={{ background: "#176b62" }}
              />
              <div>
                <Typography.Text strong>轻账 AI</Typography.Text>
                <Tag color="success" bordered={false}>
                  多轮 Agent 已就绪
                </Tag>
              </div>
            </Flex>
            <Dropdown menu={modelMenu}>
              <Button>当前模型：{settings?.name || "尚未配置"}</Button>
            </Dropdown>
          </Flex>
          <Bubble.List
            className="ai-messages"
            autoScroll
            items={bubbleItems}
            role={roles}
          />
          <div className="ai-sender">
            <Sender
              value={input}
              onChange={setInput}
              onSubmit={(value) => submit(value)}
              loading={isCurrentConversationAnswering}
              onCancel={() => streamAbortRef.current?.abort()}
              placeholder="输入消息，Enter 发送…"
              autoSize={{ minRows: 1, maxRows: 5 }}
            />
            <Typography.Text type="secondary">
              涉及增删改的操作会先进入待确认区，不会直接写入账本
            </Typography.Text>
          </div>
        </section>
        <Flex vertical className="ai-pending">
          <Flex align="center" justify="space-between">
            <div>
              <Typography.Text type="secondary" className="section-label">
                PENDING ACTIONS
              </Typography.Text>
              <Typography.Title level={5}>
                待确认操作（{proposalRows.length}）
              </Typography.Title>
            </div>
            {proposalRows.length > 0 && (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label="全部取消待确认操作"
                disabled={isCurrentConversationAnswering}
                onClick={cancel}
              />
            )}
          </Flex>
          {proposalRows.length ? (
            <List
              dataSource={proposalRows}
              renderItem={(row) => (
                <List.Item>
                  <Card size="small" className="proposal-card">
                    <Flex justify="space-between" align="center" gap={8}>
                      <Flex align="center" gap={4}>
                        <Tag color="cyan">{row.label}</Tag>
                        {row.humanEdited && <Tag color="gold">已微调</Tag>}
                      </Flex>
                      <Flex align="center" gap={4}>
                        <Typography.Text
                          strong
                          type={
                            row.direction === "income" ? "success" : "danger"
                          }
                        >
                          {row.amount ? money(Math.abs(row.amount)) : "—"}
                        </Typography.Text>
                        {row.editable && (
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            disabled={isCurrentConversationAnswering}
                            aria-label={`编辑${row.item || "待确认账目"}`}
                            onClick={() => openProposalEditor(row)}
                          />
                        )}
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          disabled={isCurrentConversationAnswering}
                          aria-label={`移除${row.item || "待确认账目"}`}
                          onClick={() => removeProposal.mutate(row)}
                        />
                      </Flex>
                    </Flex>
                    <Typography.Text strong>
                      {row.item || `账目 #${row.id}`}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      {row.date || ""} · {row.category1 || ""}{" "}
                      {row.category2 ? `/ ${row.category2}` : ""}
                    </Typography.Text>
                  </Card>
                </List.Item>
              )}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无待确认操作"
            />
          )}{" "}
          {proposalRows.length > 0 && (
            <Flex gap={8}>
              <Button
                block
                disabled={isCurrentConversationAnswering}
                onClick={cancel}
              >
                全部取消
              </Button>
              <Button
                block
                type="primary"
                icon={<CheckOutlined />}
                loading={execute.isPending}
                disabled={isCurrentConversationAnswering}
                onClick={() => execute.mutate()}
              >
                确认执行
              </Button>
            </Flex>
          )}
        </Flex>
      </div>
      {!screens.xl && (
        <Drawer
          className="responsive-drawer"
          title="历史对话"
          placement="left"
          width={360}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() =>
                newChat()
                  .then(() => setHistoryOpen(false))
                  .catch((error) => message.error(error.message))
              }
            >
              新对话
            </Button>
          }
        >
          <Conversations
            activeKey={id}
            items={history.map((item) => ({
              key: item.id,
              label: item.title,
              icon: <MessageOutlined />,
            }))}
            onActiveChange={(key) => switchChat(String(key))}
          />
          {canDelete && (
            <Button
              block
              danger
              type="text"
              icon={<DeleteOutlined />}
              onClick={deleteChat}
              style={{ marginTop: 20 }}
            >
              删除当前对话
            </Button>
          )}
        </Drawer>
      )}
      <Drawer
        className="responsive-drawer proposal-edit-drawer"
        title={`编辑${editingProposal?.label || "待确认"}账目`}
        width={520}
        open={Boolean(editingProposal)}
        destroyOnHidden
        onClose={() => setEditingProposal(null)}
        footer={
          <Flex justify="flex-end" gap={8}>
            <Button onClick={() => setEditingProposal(null)}>取消</Button>
            <Button
              type="primary"
              loading={saveProposal.isPending}
              onClick={() => proposalForm.submit()}
            >
              保存调整
            </Button>
          </Flex>
        }
      >
        <Form
          form={proposalForm}
          layout="vertical"
          requiredMark="optional"
          onFinish={submitProposalEdit}
        >
          <div className="form-grid-2">
            <Form.Item
              label="日期"
              name="date"
              rules={[{ required: true, message: "请选择日期" }]}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label="收支"
              name="direction"
              rules={[{ required: true }]}
            >
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
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            label="项目"
            name="item"
            rules={[{ required: true, whitespace: true, max: 80 }]}
          >
            <Input />
          </Form.Item>
          <div className="form-grid-2">
            <Form.Item
              label="一级分类"
              name="category1"
              rules={[{ required: true }]}
            >
              <Select
                options={proposalPrimaryChoices}
                onChange={(category1) =>
                  proposalForm.setFieldValue(
                    "category2",
                    dictionaries?.categories.find(
                      (row) => row.category1 === category1,
                    )?.category2,
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
                disabled={!selectedProposalCategory}
                options={proposalSecondaryChoices}
              />
            </Form.Item>
          </div>
          <Form.Item label="备注" name="note" rules={[{ max: 500 }]}>
            <Input.TextArea rows={4} showCount maxLength={500} />
          </Form.Item>
        </Form>
      </Drawer>
    </Card>
  )
}
