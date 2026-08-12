import { BookTwoTone, LockOutlined, SafetyCertificateOutlined, UserOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Flex, Form, Input, Segmented, Typography } from "antd";
import { useState } from "react";
import { api, type AuthUser } from "@/lib/api";

type AuthValues = { username: string; password: string; displayName?: string; confirmPassword?: string };

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [form] = Form.useForm<AuthValues>();
  const queryClient = useQueryClient();
  const submit = useMutation({
    mutationFn: async (values: AuthValues) => {
      if (mode === "register" && values.password !== values.confirmPassword) throw new Error("两次输入的密码不一致");
      return api<{ user: AuthUser }>(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(values) });
    },
    onSuccess: (result) => { setError(""); queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth-me" }); queryClient.setQueryData(["auth-me"], result); },
    onError: (reason: Error) => setError(reason.message),
  });
  const switchMode = (value: string | number) => { setMode(value as "login" | "register"); setError(""); form.resetFields(); };
  return <main className="auth-page">
    <section className="auth-story">
      <div className="auth-brand"><BookTwoTone twoToneColor="#70d2bf" /><span><b>轻账</b><small>PERSONAL LEDGER</small></span></div>
      <div className="auth-story-copy"><Typography.Text className="auth-eyebrow">YOUR PRIVATE LEDGER</Typography.Text><Typography.Title>你的每一笔，<br />只属于你的账本。</Typography.Title><Typography.Paragraph>账目、预算、分类和 AI 对话按账户独立保存。登录一次后保持长期有效，直到你主动退出。</Typography.Paragraph></div>
      <Flex className="auth-security-note" gap={10} align="center"><SafetyCertificateOutlined /><span>密码加密保存 · 会话可随时撤销</span></Flex>
    </section>
    <section className="auth-form-area"><Card className="auth-card">
      <Typography.Title level={3}>{mode === "login" ? "欢迎回来" : "创建个人账本"}</Typography.Title>
      <Typography.Paragraph type="secondary">{mode === "login" ? "继续查看你的消费轨迹。" : "首个账户将自动接管现有账目。"}</Typography.Paragraph>
      <Segmented block value={mode} onChange={switchMode} options={[{ label: "登录", value: "login" }, { label: "注册", value: "register" }]} />
      {error && <Alert className="auth-error" type="error" showIcon message={error} />}
      <Form form={form} layout="vertical" size="large" onFinish={(values) => submit.mutate(values)} requiredMark={false}>
        {mode === "register" && <Form.Item name="displayName" label="昵称" rules={[{ required: true, message: "请输入昵称" }]}><Input prefix={<UserOutlined />} maxLength={60} autoComplete="name" /></Form.Item>}
        <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }, { min: 3, message: "至少输入 3 位" }]}><Input prefix={<UserOutlined />} maxLength={40} autoComplete="username" /></Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }, { min: 8, message: "至少输入 8 位" }]}><Input.Password prefix={<LockOutlined />} autoComplete={mode === "login" ? "current-password" : "new-password"} /></Form.Item>
        {mode === "register" && <Form.Item name="confirmPassword" label="确认密码" dependencies={["password"]} rules={[{ required: true, message: "请再次输入密码" }]}><Input.Password prefix={<LockOutlined />} autoComplete="new-password" /></Form.Item>}
        <Button type="primary" htmlType="submit" block loading={submit.isPending}>{mode === "login" ? "登录账本" : "创建并登录"}</Button>
      </Form>
    </Card></section>
  </main>;
}
