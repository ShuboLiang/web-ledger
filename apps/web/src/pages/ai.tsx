import {
  CheckOutlined,
  ClearOutlined,
  DeleteOutlined,
  EditOutlined,
  MessageOutlined,
  PlusOutlined,
  RobotOutlined,
  UpOutlined,
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
  Badge,
  Button,
  Card,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
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
import {
  api,
  type Dictionaries,
  UNACCOUNTED_ACCOUNT_ID,
  UNACCOUNTED_ACCOUNT_LABEL,
} from "@/lib/api"
import { conversationId, money } from "@/lib/utils"
import { usePickerInputReadOnly, useSearchableSelect } from "@/lib/use-viewport"
import { AmountCalculator } from "@/components/amount-calculator"
import { CategoryIcon } from "@/components/category-icon"
import { DatePicker } from "@/components/sheet-date-picker"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  thinking?: string | null
}
type Proposal = {
  type:
    | "create"
    | "update"
    | "delete"
    | "category-icon"
    | "account-create"
    | "account-update"
    | "account-reconcile"
    | "account-delete"
    | "tag-create"
    | "tag-update"
    | "tag-delete"
    | "transfer"
    | "transfer-reverse"
    | "adjustment-reverse"
    | "repayment"
  id?: number
  records?: any[]
  current?: any
  changes?: any
  reason?: string
  category1?: string
  category2?: string
  icon?: string
  account?: any
  accountId?: string
  tag?: any
  tagId?: string
  transfer?: any
  repayment?: any
  reconcile?: any
  transferId?: string
  adjustmentId?: string
  display?: any
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
  accountId?: string
  tagNames?: string[]
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
  const searchableSelect = useSearchableSelect()
  const pickerInputReadOnly = usePickerInputReadOnly()
  const { message, modal } = App.useApp()
  const [id, setId] = useState<string>("")
  const [input, setInput] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [editingProposal, setEditingProposal] =
    useState<EditingProposal | null>(null)
  const [proposalForm] = Form.useForm<ProposalFormValues>()
  const creatingInitial = useRef(false)
  const streamAbortRef = useRef<AbortController | null>(null)
  const prevProposalCount = useRef(0)
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
      setPendingOpen(false)
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
  const canClear =
    Boolean(id) &&
    !isCurrentConversationAnswering &&
    ((chat?.messages.length ?? 0) > 0 || proposals.length > 0)
  const clearChat = () =>
    modal.confirm({
      title: "清空对话",
      content:
        "会清空当前对话的全部消息和待确认操作，但不会删除已经写入的账目。",
      okText: "清空",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        streamAbortRef.current?.abort()
        await api(`/api/ai/conversations/${id}/clear`, { method: "POST" })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["ai-conversation", id] }),
          queryClient.invalidateQueries({ queryKey: ["ai-conversations"] }),
        ])
        setStream(null)
        setInput("")
        message.success("对话已清空")
      },
    })
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
      proposals.flatMap((proposal, proposalIndex) => {
        if (proposal.type === "create")
          return (proposal.records || []).map((record, recordIndex) => ({
            ...record,
            label: "新增",
            proposalIndex,
            recordIndex,
            editable: true,
            humanEdited: proposal._humanEdited,
          }))
        if (proposal.type === "category-icon")
          return [
            {
              label: "分类图标",
              item: proposal.category2
                ? `${proposal.category1} / ${proposal.category2}`
                : proposal.category1,
              category1: proposal.category1,
              category2: proposal.category2,
              icon: proposal.icon,
              proposalIndex,
              editable: false,
              isIconOperation: true,
            },
          ]
        if (proposal.type === "account-create")
          return [
            {
              label: "新增账户",
              item: proposal.account?.name,
              amount: proposal.account?.openingBalance || 0,
              detail: `账户类型：${proposal.account?.type || "未指定"}`,
              proposalIndex,
              isFinanceOperation: true,
            },
          ]
        if (proposal.type === "account-update") {
          const changes = [
            proposal.changes?.name ? `名称改为“${proposal.changes.name}”` : "",
            proposal.changes?.openingBalance !== undefined
              ? `期初可用额度改为 ${money(proposal.changes.openingBalance)}`
              : "",
            proposal.changes?.isDefault === true
              ? "设为默认账户"
              : proposal.changes?.isDefault === false
                ? "取消默认账户"
                : "",
            proposal.changes?.enabled === true ? "启用账户" : "",
            proposal.changes?.enabled === false ? "停用账户" : "",
          ].filter(Boolean)
          return [
            {
              label: "修改账户",
              item:
                proposal.display?.accountName ||
                proposal.accountId ||
                "未指定账户",
              detail: changes.join(" · ") || "更新账户信息",
              proposalIndex,
              isFinanceOperation: true,
            },
          ]
        }
        if (
          proposal.type === "account-reconcile" ||
          proposal.type === "account-delete"
        )
          return [
            {
              label:
                proposal.type === "account-reconcile"
                  ? "调整账户额度"
                  : "删除账户",
              item:
                proposal.display?.accountName ||
                proposal.accountId ||
                "未指定账户",
              amount:
                proposal.type === "account-reconcile"
                  ? proposal.reconcile?.balance
                  : undefined,
              detail:
                proposal.type === "account-reconcile"
                  ? `当前 ${money(proposal.display?.currentBalance || 0)}，校准差额不计入收支`
                  : "仅零余额且无历史记录的账户可以删除",
              proposalIndex,
              isFinanceOperation: true,
            },
          ]
        if (
          proposal.type === "tag-create" ||
          proposal.type === "tag-update" ||
          proposal.type === "tag-delete"
        ) {
          const isCreate = proposal.type === "tag-create"
          const isDelete = proposal.type === "tag-delete"
          const changes = [
            proposal.changes?.name ? `名称改为“${proposal.changes.name}”` : "",
            proposal.changes?.enabled === true ? "启用标签" : "",
            proposal.changes?.enabled === false ? "停用标签" : "",
          ].filter(Boolean)
          return [
            {
              label: isCreate ? "新增标签" : isDelete ? "删除标签" : "修改标签",
              item:
                proposal.tag?.name ||
                proposal.display?.tagName ||
                proposal.tagId ||
                "未指定标签",
              detail: isCreate
                ? "用于补充消费场景、人物或目的"
                : isDelete
                  ? "只解除账目关联，不删除账目"
                  : changes.join(" · ") || "更新标签信息",
              proposalIndex,
              isFinanceOperation: true,
            },
          ]
        }
        if (proposal.type === "transfer")
          return [
            {
              label: "账户转账",
              item: `${proposal.display?.fromAccountName || "转出账户"} → ${proposal.display?.toAccountName || "转入账户"}`,
              amount: proposal.transfer?.amount,
              date: proposal.transfer?.date,
              detail: "仅移动资金，不计入收支",
              proposalIndex,
              isFinanceOperation: true,
            },
          ]
        if (proposal.type === "transfer-reverse")
          return [
            {
              label: "撤销账户转账",
              item: proposal.display?.route || "账户转账",
              amount: proposal.display?.amount,
              detail: "恢复双方账户额度，不影响收支",
              proposalIndex,
              isFinanceOperation: true,
            },
          ]
        if (proposal.type === "adjustment-reverse")
          return [
            {
              label: "撤销额度调整",
              item: proposal.display?.accountName || "账户",
              amount: proposal.display?.amount,
              detail: proposal.display?.note
                ? `撤销后可用额度恢复；${proposal.display.note}`
                : "撤销后可用额度恢复，不影响收支",
              proposalIndex,
              isFinanceOperation: true,
            },
          ]
        if (proposal.type === "repayment")
          return [
            {
              label: "记录还款",
              item: `${proposal.display?.fromAccountName || "付款账户"} → ${proposal.display?.toAccountName || "信用/贷款账户"}`,
              amount:
                Number(proposal.repayment?.principal || 0) +
                Number(proposal.repayment?.interest || 0) +
                Number(proposal.repayment?.fee || 0),
              date: proposal.repayment?.date,
              detail: `本金 ${money(proposal.repayment?.principal || 0)} 走转账；利息与手续费计入支出`,
              proposalIndex,
              isFinanceOperation: true,
            },
          ]
        return [
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
        ]
      }),
    [proposals],
  )
  useEffect(() => {
    if (
      !screens.md &&
      proposalRows.length > 0 &&
      prevProposalCount.current === 0
    ) {
      setPendingOpen(true)
    }
    if (!screens.md && proposalRows.length === 0) {
      setPendingOpen(false)
    }
    prevProposalCount.current = proposalRows.length
  }, [proposalRows.length, screens.md])
  const primaryCategories = useMemo(
    () => [
      ...new Set((dictionaries?.categories || []).map((row) => row.category1)),
    ],
    [dictionaries?.categories],
  )
  const selectedProposalCategory = Form.useWatch("category1", proposalForm)
  const selectedProposalSubcategory = Form.useWatch("category2", proposalForm)
  const selectedProposalDirection = Form.useWatch("direction", proposalForm)
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
      accountId:
        row.accountId === UNACCOUNTED_ACCOUNT_ID
          ? undefined
          : row.accountId ||
            (row.label === "新增"
              ? dictionaries?.accounts?.find((account) => account.isDefault)?.id
              : undefined),
      tagNames: row.tagNames || row.tags?.map((tag: any) => tag.name) || [],
      note: row.note || "",
    })
  }
  const submitProposalEdit = (values: ProposalFormValues) => {
    if (!editingProposal) return
    const record = {
      ...values,
      date: values.date.format("YYYY-MM-DD"),
      accountId: values.accountId || UNACCOUNTED_ACCOUNT_ID,
    }
    const next = proposals.map((proposal, proposalIndex) => {
      if (proposalIndex !== editingProposal.proposalIndex) return proposal
      if (proposal.type === "create")
        return {
          ...proposal,
          records: (proposal.records || []).map((existing, recordIndex) =>
            recordIndex === editingProposal.recordIndex
              ? { ...existing, ...record }
              : existing,
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
  const actionButtonSize = screens.md ? "small" : "middle"
  const pendingList =
    proposalRows.length > 0 ? (
      <List
        className="ai-pending-list"
        dataSource={proposalRows}
        renderItem={(row) => (
          <List.Item>
            <Card size="small" className="proposal-card">
              <Flex justify="space-between" align="center" gap={8}>
                <Flex align="center" gap={4} wrap="wrap">
                  <Tag color="cyan">{row.label}</Tag>
                  {row.humanEdited && <Tag color="gold">已微调</Tag>}
                </Flex>
                <Flex align="center" gap={4} className="proposal-card-actions">
                  {row.isIconOperation ? (
                    <CategoryIcon name={row.icon} size="small" />
                  ) : (
                    <Typography.Text
                      strong
                      type={
                        row.isFinanceOperation
                          ? undefined
                          : row.direction === "income"
                            ? "success"
                            : "danger"
                      }
                    >
                      {row.amount ? money(Math.abs(row.amount)) : "—"}
                    </Typography.Text>
                  )}
                  {row.editable && (
                    <Button
                      type="text"
                      size={actionButtonSize}
                      icon={<EditOutlined />}
                      disabled={isCurrentConversationAnswering}
                      aria-label={`编辑${row.item || "待确认账目"}`}
                      onClick={() => openProposalEditor(row)}
                    />
                  )}
                  <Button
                    type="text"
                    size={actionButtonSize}
                    danger
                    icon={<DeleteOutlined />}
                    disabled={isCurrentConversationAnswering}
                    aria-label={`移除${row.item || "待确认账目"}`}
                    onClick={() => removeProposal.mutate(row)}
                  />
                </Flex>
              </Flex>
              <Typography.Text strong className="proposal-card-title">
                {row.item || `账目 #${row.id}`}
              </Typography.Text>
              <Typography.Text
                type="secondary"
                className="proposal-card-detail"
              >
                {row.isIconOperation
                  ? `将图标设置为 ${row.icon}`
                  : row.isFinanceOperation
                    ? `${row.date || ""}${row.date && row.detail ? " · " : ""}${row.detail || ""}`
                    : `${row.date || ""} · ${row.category1 || ""} ${row.category2 ? `/ ${row.category2}` : ""}${
                        row.accountId === UNACCOUNTED_ACCOUNT_ID
                          ? ` · ${UNACCOUNTED_ACCOUNT_LABEL}`
                          : row.accountId
                            ? ` · ${
                                dictionaries?.accounts?.find(
                                  (account) => account.id === row.accountId,
                                )?.name || "账户"
                              }`
                            : row.label === "新增"
                              ? dictionaries?.accounts?.some(
                                  (account) => account.isDefault,
                                )
                                ? " · 默认账户"
                                : ` · ${UNACCOUNTED_ACCOUNT_LABEL}`
                              : ` · ${UNACCOUNTED_ACCOUNT_LABEL}`
                      }${row.tagNames?.length ? ` · #${row.tagNames.join(" #")}` : ""}`}
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
    )
  const pendingFooter =
    proposalRows.length > 0 ? (
      <Flex gap={8} className="ai-pending-footer">
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
    ) : null
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
            wrap={screens.md ? undefined : "wrap"}
            gap={screens.md ? undefined : 8}
          >
            <Flex gap={8} align="center" className="ai-chat-header-brand">
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
                {screens.md ? (
                  <Tag color="success" bordered={false}>
                    多轮 Agent 已就绪
                  </Tag>
                ) : null}
              </div>
            </Flex>
            <Flex gap={8} align="center" className="ai-chat-header-actions">
              <Button
                type="text"
                icon={<ClearOutlined />}
                disabled={!canClear}
                aria-label="清空对话"
                onClick={clearChat}
              >
                {screens.md ? "清空对话" : null}
              </Button>
              <Dropdown menu={modelMenu}>
                <Button className="ai-model-button">
                  {screens.md
                    ? `当前模型：${settings?.name || "尚未配置"}`
                    : settings?.name || "模型"}
                </Button>
              </Dropdown>
            </Flex>
          </Flex>
          <Bubble.List
            className="ai-messages"
            autoScroll
            items={bubbleItems}
            role={roles}
          />
          {!screens.md && proposalRows.length > 0 && (
            <button
              type="button"
              className="ai-pending-trigger"
              aria-label={`${proposalRows.length} 项待确认，点击查看`}
              onClick={() => setPendingOpen(true)}
            >
              <Flex align="center" justify="space-between">
                <Flex align="center" gap={10}>
                  <Badge count={proposalRows.length} color="#176b62">
                    <span className="ai-pending-trigger-icon">
                      <CheckOutlined />
                    </span>
                  </Badge>
                  <span className="ai-pending-trigger-copy">
                    <Typography.Text strong>
                      {proposalRows.length} 项待确认
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      点击查看详情并执行
                    </Typography.Text>
                  </span>
                </Flex>
                <UpOutlined className="ai-pending-trigger-chevron" />
              </Flex>
            </button>
          )}
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
              {screens.md || proposalRows.length === 0
                ? "涉及增删改的操作会先进入待确认区，不会直接写入账本"
                : "待确认操作可通过上方入口查看"}
            </Typography.Text>
          </div>
        </section>
        {screens.md && (
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
            {pendingList}
            {pendingFooter}
          </Flex>
        )}
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
          {canClear && (
            <Button
              block
              type="text"
              icon={<ClearOutlined />}
              onClick={clearChat}
              style={{ marginTop: 20 }}
            >
              清空对话
            </Button>
          )}
          {canDelete && (
            <Button
              block
              danger
              type="text"
              icon={<DeleteOutlined />}
              onClick={deleteChat}
              style={{ marginTop: canClear ? 8 : 20 }}
            >
              删除当前对话
            </Button>
          )}
        </Drawer>
      )}
      {!screens.md && (
        <Drawer
          className="responsive-drawer ai-pending-drawer"
          title={`待确认操作（${proposalRows.length}）`}
          placement="bottom"
          height="min(85vh, 640px)"
          open={pendingOpen}
          destroyOnHidden={false}
          onClose={() => setPendingOpen(false)}
          extra={
            proposalRows.length > 0 ? (
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label="全部取消待确认操作"
                disabled={isCurrentConversationAnswering}
                onClick={cancel}
              />
            ) : null
          }
          footer={pendingFooter}
        >
          {pendingList}
        </Drawer>
      )}
      <Drawer
        className="responsive-drawer proposal-edit-drawer"
        title={`编辑${editingProposal?.label || "待确认"}账目`}
        placement={screens.md ? "right" : "bottom"}
        width={520}
        height="auto"
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
              <DatePicker
                style={{ width: "100%" }}
                inputReadOnly={pickerInputReadOnly}
              />
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
            <AmountCalculator min={0.01} />
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
          <Form.Item
            label={
              selectedProposalDirection === "income" ? "收款账户" : "付款账户"
            }
            name="accountId"
            extra="可清空。不选账户时只记消费，不改变任何账户余额。"
          >
            <Select
              allowClear
              showSearch={searchableSelect}
              optionFilterProp="label"
              placeholder="不记账户"
              options={(dictionaries?.accounts || []).map((account) => ({
                value: account.id,
                label: `${account.name}${account.isDefault ? "（默认）" : ""}`,
              }))}
            />
          </Form.Item>
          <Form.Item label="标签" name="tagNames">
            <Select
              mode="tags"
              showSearch={searchableSelect}
              maxTagCount="responsive"
              placeholder="可选择或输入标签"
              options={(dictionaries?.tags || []).map((tag) => ({
                value: tag.name,
                label: tag.name,
              }))}
              onChange={(values) => {
                if (values.length > 8) {
                  message.warning("一笔账最多选择 8 个标签")
                  proposalForm.setFieldValue("tagNames", values.slice(0, 8))
                }
              }}
            />
          </Form.Item>
          <Form.Item label="备注" name="note" rules={[{ max: 500 }]}>
            <Input.TextArea rows={4} showCount maxLength={500} />
          </Form.Item>
        </Form>
      </Drawer>
    </Card>
  )
}
