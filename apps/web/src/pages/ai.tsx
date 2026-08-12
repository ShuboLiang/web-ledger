import {
  CheckOutlined,
  DeleteOutlined,
  MessageOutlined,
  PlusOutlined,
  RobotOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Bubble, Conversations, Sender } from "@ant-design/x";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App,
  Avatar,
  Button,
  Card,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Grid,
  List,
  Space,
  Tag,
  Typography,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import { conversationId, money } from "@/lib/utils";

type Message = { id: string; role: "user" | "assistant"; content: string };
type Proposal = {
  type: "create" | "update" | "delete";
  id?: number;
  records?: any[];
  current?: any;
  changes?: any;
  reason?: string;
};
type AiResponse = {
  message: string;
  conversationId: string;
  proposals: Proposal[];
};
type Chat = {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
};
type ChatDetail = {
  id: string;
  title: string;
  messages: Message[];
  proposals: Proposal[];
};

const welcome: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "你好，我可以帮你**记账、查账、改账和分析消费**。\n\n例如：`今天午饭 18 元`，或者问我“这个月餐饮花了多少？”",
};

export function AiPage() {
  const queryClient = useQueryClient();
  const screens = Grid.useBreakpoint();
  const { message, modal } = App.useApp();
  const [id, setId] = useState<string>("");
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const creatingInitial = useRef(false);
  const { data: settings } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => api<any>("/api/ai/settings"),
  });
  const { data: history = [], isFetched: historyFetched } = useQuery({
    queryKey: ["ai-conversations"],
    queryFn: () => api<Chat[]>("/api/ai/conversations"),
  });
  const { data: chat } = useQuery({
    queryKey: ["ai-conversation", id],
    queryFn: () => api<ChatDetail>(`/api/ai/conversations/${id}`),
    enabled: Boolean(id),
  });
  useEffect(() => {
    if (!historyFetched || id || creatingInitial.current) return;
    if (history[0]) {
      setId(history[0].id);
      return;
    }
    creatingInitial.current = true;
    const next = conversationId();
    api<ChatDetail>("/api/ai/conversations", {
      method: "POST",
      body: JSON.stringify({ id: next }),
    })
      .then(async () => {
        setId(next);
        await queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
      })
      .catch((error) => message.error(error.message))
      .finally(() => {
        creatingInitial.current = false;
      });
  }, [historyFetched, history, id]);
  const messages = chat?.messages.length ? chat.messages : [welcome];
  const proposals = chat?.proposals || [];
  const selectModel = useMutation({
    mutationFn: (profileId: string) =>
      api(`/api/ai/settings/profiles/${profileId}/default`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai-settings"] });
      message.success("当前模型已切换，新会话起生效");
    },
  });
  const send = useMutation({
    mutationFn: (text: string) =>
      api<AiResponse>("/api/ai/command", {
        method: "POST",
        body: JSON.stringify({ text, conversationId: id }),
      }),
    onMutate: async (text) => {
      await queryClient.cancelQueries({ queryKey: ["ai-conversation", id] });
      queryClient.setQueryData<ChatDetail>(
        ["ai-conversation", id],
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
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ai-conversation", id] }),
        queryClient.invalidateQueries({ queryKey: ["ai-conversations"] }),
      ]);
    },
    onError: async (error: Error) => {
      await queryClient.invalidateQueries({
        queryKey: ["ai-conversation", id],
      });
      message.error(error.message);
    },
  });
  const execute = useMutation({
    mutationFn: () =>
      api("/api/ai/execute", {
        method: "POST",
        body: JSON.stringify({ conversationId: id, proposals }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      message.success("账目操作已执行");
    },
    onError: (error: Error) => message.error(error.message),
  });
  const submit = (text = input) => {
    const value = text.trim();
    if (!value || !id || send.isPending) return;
    setInput("");
    send.mutate(value);
  };
  const newChat = async () => {
    const next = conversationId();
    await api("/api/ai/conversations", {
      method: "POST",
      body: JSON.stringify({ id: next }),
    });
    setId(next);
    await queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
  };
  const switchChat = (key: string) => {
    if (key !== id) setId(key);
    setHistoryOpen(false);
  };
  const cancel = async () => {
    await api(`/api/ai/conversations/${id}/outcome`, {
      method: "POST",
      body: JSON.stringify({ outcome: "cancelled" }),
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["ai-conversation", id] }),
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] }),
    ]);
    message.info("已取消待确认操作");
  };
  const canDelete =
    Boolean(id) &&
    (history.length > 1 ||
      (history.find((c) => c.id === id)?.messageCount ?? 0) > 0);
  const deleteChat = () =>
    modal.confirm({
      title: "删除当前对话",
      content: "会永久删除这段对话的消息，但不会删除已经写入的账目。",
      okText: "删除对话",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await api(`/api/ai/conversations/${id}`, { method: "DELETE" });
        queryClient.setQueryData<Chat[]>(["ai-conversations"], (old) =>
          (old || []).filter((c) => c.id !== id),
        );
        setId("");
        await queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
        message.success("对话已删除");
      },
    });
  const proposalRows = useMemo(
    () =>
      proposals.flatMap((proposal) =>
        proposal.type === "create"
          ? (proposal.records || []).map((record) => ({
              ...record,
              label: "新增",
            }))
          : [
              {
                ...(proposal.current || {}),
                ...(proposal.changes || {}),
                label: proposal.type === "update" ? "修改" : "删除",
              },
            ],
      ),
    [proposals],
  );
  const bubbleItems: any[] = messages.map((item) => ({
    key: item.id,
    role: item.role === "assistant" ? "ai" : "user",
    content: item.content,
  }));
  if (send.isPending)
    bubbleItems.push({
      key: "loading",
      role: "ai",
      content: "正在查询账本并思考…",
      loading: true,
    });
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
    user: {
      placement: "end",
      avatar: <Avatar icon={<UserOutlined />} />,
      shape: "corner",
      variant: "filled",
    },
  };
  const modelMenu = {
    items: (settings?.profiles || []).map((profile: any) => ({
      key: profile.id,
      label: `${profile.isDefault ? "✓ " : ""}${profile.name}`,
      onClick: () => selectModel.mutate(profile.id),
    })),
  };
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
              loading={send.isPending}
              onCancel={() => {}}
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
                    <Flex justify="space-between">
                      <Tag color="cyan">{row.label}</Tag>
                      <Typography.Text strong type="danger">
                        {row.amount ? money(Math.abs(row.amount)) : "—"}
                      </Typography.Text>
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
              <Button block onClick={cancel}>
                全部取消
              </Button>
              <Button
                block
                type="primary"
                icon={<CheckOutlined />}
                loading={execute.isPending}
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
    </Card>
  );
}
