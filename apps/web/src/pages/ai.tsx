import { CheckOutlined, DeleteOutlined, MessageOutlined, PlusOutlined, RobotOutlined, UserOutlined } from "@ant-design/icons";
import { Bubble, Conversations, Sender } from "@ant-design/x";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Avatar, Button, Card, Dropdown, Empty, Flex, Grid, List, Space, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import { conversationId, money } from "@/lib/utils";

type Message = { id: string; role: "user" | "assistant"; content: string };
type Proposal = { type: "create" | "update" | "delete"; id?: number; records?: any[]; current?: any; changes?: any; reason?: string };
type AiResponse = { message: string; conversationId: string; proposals: Proposal[] };
type Chat = { id: string; title: string; messages: Message[]; proposals: Proposal[] };

const welcome: Message = { id: "welcome", role: "assistant", content: "你好，我可以帮你**记账、查账、改账和分析消费**。\n\n例如：`今天午饭 18 元`，或者问我“这个月餐饮花了多少？”" };

export function AiPage() {
  const queryClient = useQueryClient();
  const screens = Grid.useBreakpoint();
  const { message } = App.useApp();
  const [id, setId] = useState<string>(conversationId());
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [history, setHistory] = useState<Chat[]>([{ id, title: "新对话", messages: [], proposals: [] }]);
  const { data: settings } = useQuery({ queryKey: ["ai-settings"], queryFn: () => api<any>("/api/ai/settings") });
  const selectModel = useMutation({ mutationFn: (profileId: string) => api(`/api/ai/settings/profiles/${profileId}/default`, { method: "POST" }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["ai-settings"] }); message.success("当前模型已切换，新会话起生效"); } });
  const send = useMutation({ mutationFn: (text: string) => api<AiResponse>("/api/ai/command", { method: "POST", body: JSON.stringify({ text, conversationId: id }) }), onSuccess: (result, sentText) => { setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: result.message }]); setProposals(result.proposals || []); setHistory((current) => current.map((chat) => chat.id === id && chat.title === "新对话" ? { ...chat, title: sentText.slice(0, 16) || "账本对话" } : chat)); }, onError: (error: Error) => { message.error(error.message); setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: `服务暂不可用：${error.message}` }]); } });
  const execute = useMutation({ mutationFn: () => api("/api/ai/execute", { method: "POST", body: JSON.stringify({ conversationId: id, proposals }) }), onSuccess: async () => { setProposals([]); setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: "待确认操作已执行，相关统计也已更新。" }]); await queryClient.invalidateQueries(); message.success("账目操作已执行"); }, onError: (error: Error) => message.error(error.message) });
  const submit = (text = input) => { const value = text.trim(); if (!value || send.isPending) return; setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: value }]); setInput(""); send.mutate(value); };
  const newChat = () => { const next = conversationId(); setHistory((current) => [{ id: next, title: "新对话", messages: [], proposals: [] }, ...current.map((chat) => chat.id === id ? { ...chat, messages, proposals } : chat)]); setId(next); setMessages([{ ...welcome, id: crypto.randomUUID(), content: "新对话已开始。你想记录或查询什么？" }]); setProposals([]); };
  const switchChat = (key: string) => { if (key === id) return; const chat = history.find((item) => item.id === key); if (!chat) return; setHistory((current) => current.map((item) => item.id === id ? { ...item, messages, proposals } : item)); setId(key); setMessages(chat.messages.length ? chat.messages : [{ ...welcome, id: crypto.randomUUID(), content: "已切换到这段对话。" }]); setProposals(chat.proposals); };
  const cancel = async () => { await api(`/api/ai/conversations/${id}/outcome`, { method: "POST", body: JSON.stringify({ outcome: "cancelled" }) }); setProposals([]); message.info("已取消待确认操作"); };
  const proposalRows = useMemo(() => proposals.flatMap((proposal) => proposal.type === "create" ? (proposal.records || []).map((record) => ({ ...record, label: "新增" })) : [{ ...(proposal.current || {}), ...(proposal.changes || {}), label: proposal.type === "update" ? "修改" : "删除" }]), [proposals]);
  const bubbleItems: any[] = messages.map((item) => ({ key: item.id, role: item.role === "assistant" ? "ai" : "user", content: item.content }));
  if (send.isPending) bubbleItems.push({ key: "loading", role: "ai", content: "正在查询账本并思考…", loading: true });
  const roles: any = { ai: { placement: "start", avatar: <Avatar icon={<RobotOutlined />} style={{ background: "#0f766e" }} />, shape: "corner", contentRender: (content: string) => <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{String(content)}</ReactMarkdown></div> }, user: { placement: "end", avatar: <Avatar icon={<UserOutlined />} />, shape: "corner", variant: "filled" } };
  const modelMenu = { items: (settings?.profiles || []).map((profile: any) => ({ key: profile.id, label: `${profile.isDefault ? "✓ " : ""}${profile.name}`, onClick: () => selectModel.mutate(profile.id) })) };
  return <Card className="ai-workspace" styles={{ body: { padding: 0, height: "calc(100vh - 150px)", minHeight: 620 } }}>
    <div className={`ai-grid ${!screens.xl ? "compact" : ""}`}>
      {screens.xl && <Flex vertical className="ai-conversations"><Button block icon={<PlusOutlined />} onClick={newChat}>新对话</Button><Typography.Text type="secondary" className="section-label">历史对话</Typography.Text><Conversations activeKey={id} items={history.map((chat) => ({ key: chat.id, label: chat.title, icon: <MessageOutlined /> }))} onActiveChange={(key) => switchChat(String(key))} /></Flex>}
      <section className="ai-chat"><Flex className="ai-chat-header" align="center" justify="space-between"><Flex gap={10} align="center"><Avatar icon={<RobotOutlined />} style={{ background: "#0f766e" }} /><div><Typography.Text strong>轻账 AI</Typography.Text><Tag color="success" bordered={false}>多轮 Agent 已就绪</Tag></div></Flex><Dropdown menu={modelMenu}><Button>当前模型：{settings?.name || "尚未配置"}</Button></Dropdown></Flex><Bubble.List className="ai-messages" autoScroll items={bubbleItems} role={roles} /><div className="ai-sender"><Sender value={input} onChange={setInput} onSubmit={(value) => submit(value)} loading={send.isPending} onCancel={() => {}} placeholder="输入消息，Enter 发送…" autoSize={{ minRows: 1, maxRows: 5 }} /><Typography.Text type="secondary">涉及增删改的操作会先进入待确认区，不会直接写入账本</Typography.Text></div></section>
      <Flex vertical className="ai-pending"><Flex align="center" justify="space-between"><div><Typography.Text type="secondary" className="section-label">PENDING ACTIONS</Typography.Text><Typography.Title level={5}>待确认操作（{proposalRows.length}）</Typography.Title></div>{proposalRows.length > 0 && <Button type="text" danger icon={<DeleteOutlined />} onClick={cancel} />}</Flex>{proposalRows.length ? <List dataSource={proposalRows} renderItem={(row) => <List.Item><Card size="small" className="proposal-card"><Flex justify="space-between"><Tag color="cyan">{row.label}</Tag><Typography.Text strong type="danger">{row.amount ? money(Math.abs(row.amount)) : "—"}</Typography.Text></Flex><Typography.Text strong>{row.item || `账目 #${row.id}`}</Typography.Text><Typography.Text type="secondary">{row.date || ""} · {row.category1 || ""} {row.category2 ? `/ ${row.category2}` : ""}</Typography.Text></Card></List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待确认操作" />} {proposalRows.length > 0 && <Flex gap={8}><Button block onClick={cancel}>全部取消</Button><Button block type="primary" icon={<CheckOutlined />} loading={execute.isPending} onClick={() => execute.mutate()}>确认执行</Button></Flex>}</Flex>
    </div>
  </Card>;
}
