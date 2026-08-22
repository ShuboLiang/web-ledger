import {
  BankOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SwapOutlined,
} from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Drawer,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  List,
  Radio,
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  api,
  type FinanceAccount,
  type FinanceOverview,
  UNACCOUNTED_ACCOUNT_ID,
} from "@/lib/api"
import { money } from "@/lib/utils"
import { AmountCalculator } from "@/components/amount-calculator"
import { DatePicker } from "@/components/sheet-date-picker"
import { usePickerInputReadOnly } from "@/lib/use-viewport"

type Panel = "account" | "transfer" | "repayment" | "reconcile" | null
const accountTypeOptions = [
  { value: "cash", label: "现金" },
  { value: "bank", label: "银行卡" },
  { value: "ewallet", label: "电子钱包" },
  { value: "credit", label: "信用账户" },
  { value: "loan", label: "贷款账户" },
]
const transferKindText: Record<string, string> = {
  transfer: "账户转账",
  debt_drawdown: "贷款到账",
  debt_payment: "偿还本金",
  adjustment: "额度调整",
  lending_out: "人情往来支出",
  lending_in: "人情往来收回",
}
const quotaAccountTypes = new Set(["credit", "loan"])

export function FinancePage() {
  const screens = Grid.useBreakpoint()
  const navigate = useNavigate()
  const pickerInputReadOnly = usePickerInputReadOnly()
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()
  const [panel, setPanel] = useState<Panel>(null)
  const [editingAccount, setEditingAccount] = useState<FinanceAccount | null>(
    null,
  )
  const [reconcileTarget, setReconcileTarget] = useState<FinanceAccount | null>(
    null,
  )
  const [accountForm] = Form.useForm()
  const [transferForm] = Form.useForm()
  const [repaymentForm] = Form.useForm()
  const [reconcileForm] = Form.useForm()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["finance"],
    queryFn: () => api<FinanceOverview>("/api/finance"),
  })
  const refresh = async () => {
    await queryClient.invalidateQueries()
  }
  const action = useMutation({
    mutationFn: ({ url, body, method = "POST" }: any) =>
      api(url, { method, body: JSON.stringify(body) }),
    onSuccess: async () => {
      setPanel(null)
      setEditingAccount(null)
      setReconcileTarget(null)
      accountForm.resetFields()
      transferForm.resetFields()
      repaymentForm.resetFields()
      reconcileForm.resetFields()
      await refresh()
      message.success("财务状态已更新")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const fundAccounts = (data?.accounts || []).filter((row) => !row.isContact)
  const enabledAccounts = fundAccounts.filter((row) => row.enabled)
  const payerAccounts = enabledAccounts.filter((row) => row.type !== "loan")
  const debtAccounts = enabledAccounts.filter((row) =>
    quotaAccountTypes.has(row.type),
  )
  const accountType = Form.useWatch("type", accountForm)
  const reconcileMode = Form.useWatch("mode", reconcileForm)
  const editingIsDefault = Form.useWatch("isDefault", accountForm)
  const openPanel = (next: Panel) => {
    setPanel(next)
    if (next === "account") {
      setEditingAccount(null)
      accountForm.setFieldsValue({
        name: undefined,
        type: "bank",
        openingBalance: 0,
        balanceDate: dayjs(),
        isDefault: false,
        enabled: true,
      })
    }
    if (next === "transfer")
      transferForm.setFieldsValue({
        date: dayjs(),
        fromAccountId:
          enabledAccounts.find((row) => row.isDefault)?.id ||
          enabledAccounts[0]?.id,
      })
    if (next === "repayment")
      repaymentForm.setFieldsValue({
        date: dayjs(),
        fromAccountId:
          payerAccounts.find((row) => row.isDefault)?.id ||
          payerAccounts[0]?.id,
        toAccountId: debtAccounts[0]?.id,
        principal: undefined,
        interest: 0,
        fee: 0,
      })
  }
  const openAccountEdit = (account: FinanceAccount) => {
    setEditingAccount(account)
    setPanel("account")
    accountForm.setFieldsValue({
      name: account.name,
      type: account.type,
      openingBalance: Math.max(0, account.openingBalance),
      isDefault: account.isDefault,
      enabled: account.enabled,
    })
  }
  const openReconcile = (account: FinanceAccount) => {
    setReconcileTarget(account)
    setPanel("reconcile")
    reconcileForm.setFieldsValue({
      mode: "set",
      balance: account.balance,
      delta: undefined,
      note: quotaAccountTypes.has(account.type) ? "调整额度" : "余额校准",
    })
  }
  const makeDefault = (account: FinanceAccount) =>
    action.mutate({
      url: `/api/finance/accounts/${account.id}`,
      method: "PATCH",
      body: { isDefault: true },
    })
  const clearDefault = (account: FinanceAccount) =>
    action.mutate({
      url: `/api/finance/accounts/${account.id}`,
      method: "PATCH",
      body: { isDefault: false },
    })
  const accountOption = (row: FinanceAccount) => ({
    value: row.id,
    label: `${row.name} · 可用 ${money(row.availableQuota)}`,
  })
  const allAccountOptions = enabledAccounts.map(accountOption)
  const payerOptions = payerAccounts.map(accountOption)
  const debtOptions = debtAccounts.map(accountOption)
  const summaryCards = useMemo(
    () => [
      {
        key: "assets",
        label: "可用资产",
        value: data?.summary.assets || 0,
        tone: "asset",
      },
      {
        key: "liabilities",
        label: "总负债",
        value: data?.summary.liabilities || 0,
        tone: "debt",
      },
      {
        key: "lending",
        label: "人情往来",
        value: Number(
          (
            (data?.summary.receivable || 0) - (data?.summary.payable || 0)
          ).toFixed(2),
        ),
        tone: "due",
      },
      {
        key: "net-worth",
        label: "净资产",
        value: data?.summary.netWorth || 0,
        tone: "net",
      },
    ],
    [data?.summary],
  )
  const isQuotaAccount = Boolean(
    reconcileTarget && quotaAccountTypes.has(reconcileTarget.type),
  )
  if (isLoading) return <Skeleton active paragraph={{ rows: 14 }} />
  if (isError || !data)
    return (
      <Card>
        <Empty description="资产与负债数据加载失败">
          <Button onClick={() => refetch()}>重新加载</Button>
        </Empty>
      </Card>
    )
  return (
    <div className="page-stack finance-page">
      <Card className="finance-command-card">
        <Flex
          align={screens.md ? "center" : "flex-start"}
          justify="space-between"
          gap={16}
          vertical={!screens.md}
        >
          <div>
            <Typography.Text className="statement-eyebrow">
              MONEY MAP · 资金全貌
            </Typography.Text>
            <Typography.Title level={4}>
              把消费、账户和欠款放在一张图里
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              所有账户按可用额度记账。转账和还本金不计入收支，利息与手续费才算支出。
              {data?.summary.unaccountedCount
                ? ` 本月有 ${data.summary.unaccountedCount} 笔未记账户的账目，会计入收支和预算，但不会改变账户余额。`
                : ""}
            </Typography.Paragraph>
            {Boolean(data?.summary.unaccountedCount) && (
              <Button
                type="link"
                style={{ paddingInline: 0 }}
                onClick={() =>
                  navigate(
                    `/transactions?accountId=${UNACCOUNTED_ACCOUNT_ID}${
                      data?.summary.unaccountedMonth
                        ? `&month=${data.summary.unaccountedMonth}`
                        : ""
                    }`,
                  )
                }
              >
                查看未记账户的账目
              </Button>
            )}
          </div>
            <Space wrap className="finance-actions">
            <Button
              icon={<PlusOutlined />}
              onClick={() => openPanel("account")}
            >
              新增账户
            </Button>
            <Button
              icon={<SwapOutlined />}
              onClick={() => openPanel("transfer")}
            >
              记转账
            </Button>
            <Button
              type="primary"
              icon={<CreditCardOutlined />}
              onClick={() => openPanel("repayment")}
            >
              记还款
            </Button>
          </Space>
        </Flex>
      </Card>

      <div className="finance-summary-grid">
        {summaryCards.map((card) => (
          <Card key={card.key} className={`finance-summary-card ${card.tone}`}>
            <Statistic
              title={card.label}
              value={card.value}
              precision={2}
              prefix="¥"
            />
          </Card>
        ))}
      </div>

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={10}>
          <Card
            title="账户额度"
            extra={
              <Typography.Text type="secondary">
                {fundAccounts.length} 个账户
              </Typography.Text>
            }
            className="finance-section-card"
          >
            {fundAccounts.length ? (
              <List
                dataSource={fundAccounts}
                renderItem={(account) => (
                  <List.Item className="finance-account-item">
                    <Flex
                      align="center"
                      gap={12}
                      className="finance-account-main"
                    >
                      <span
                        className={`finance-account-icon ${account.isLiability ? "debt" : "asset"}`}
                      >
                        {account.isLiability ? (
                          <CreditCardOutlined />
                        ) : (
                          <BankOutlined />
                        )}
                      </span>
                      <div className="finance-account-copy">
                        <Flex align="center" gap={8} wrap>
                          <Typography.Text strong>
                            {account.name}
                          </Typography.Text>
                          <Tag>{account.typeText}</Tag>
                          {account.isDefault ? (
                            <Tag color="cyan">默认</Tag>
                          ) : null}
                          {!account.enabled ? <Tag>已停用</Tag> : null}
                        </Flex>
                        <Typography.Text type="secondary">
                          期初 {money(account.openingBalance)}
                          {account.outstanding > 0
                            ? ` · 欠款 ${money(account.outstanding)}`
                            : ""}
                        </Typography.Text>
                      </div>
                    </Flex>
                    <Flex
                      vertical
                      align="flex-end"
                      gap={2}
                      className="finance-account-side"
                    >
                      <Typography.Text
                        strong
                        className={
                          account.outstanding > 0
                            ? "money-negative"
                            : "money-positive"
                        }
                      >
                        {money(
                          account.outstanding > 0
                            ? -account.outstanding
                            : account.availableQuota,
                        )}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        {account.outstanding > 0 ? "当前欠款" : "可用额度"}
                      </Typography.Text>
                      <Space size={2} className="finance-account-controls">
                        {account.type !== "loan" && account.enabled ? (
                          account.isDefault ? (
                            <Button
                              type="link"
                              size="small"
                              onClick={() => clearDefault(account)}
                            >
                              取消默认
                            </Button>
                          ) : (
                            <Button
                              type="link"
                              size="small"
                              onClick={() => makeDefault(account)}
                            >
                              设为默认
                            </Button>
                          )
                        ) : null}
                        <Button
                          type="text"
                          size="small"
                          onClick={() => openReconcile(account)}
                          disabled={!account.enabled}
                        >
                          {quotaAccountTypes.has(account.type)
                            ? "调整额度"
                            : "校准"}
                        </Button>
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          aria-label={`编辑账户${account.name}`}
                          onClick={() => openAccountEdit(account)}
                        >
                          编辑
                        </Button>
                      </Space>
                    </Flex>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="先新增一个日常付款账户" />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card
            title="最近资金移动"
            extra={
              <Typography.Text type="secondary">
                转账、放款、还款与额度调整
              </Typography.Text>
            }
            className="finance-section-card"
          >
            {data.recentTransfers.length ? (
              <List
                dataSource={data.recentTransfers}
                renderItem={(transfer) => (
                  <List.Item className="finance-transfer-item">
                    <Flex
                      align="center"
                      gap={12}
                      className="finance-transfer-route"
                    >
                      <span className="finance-transfer-icon">
                        <SwapOutlined />
                      </span>
                      <div>
                        <Typography.Text strong>
                          {transfer.kind === "adjustment"
                            ? `${transfer.fromAccountName} · 额度调整`
                            : `${transfer.fromAccountName} → ${transfer.toAccountName}`}
                        </Typography.Text>
                        <div>
                          <Typography.Text type="secondary">
                            {transfer.date} ·{" "}
                            {transferKindText[transfer.kind] || "账户转账"}
                            {transfer.note ? ` · ${transfer.note}` : ""}
                          </Typography.Text>
                        </div>
                      </div>
                    </Flex>
                    <Flex
                      vertical
                      align="flex-end"
                      gap={4}
                      className="finance-transfer-side"
                    >
                      <Typography.Text strong>
                        {money(transfer.amount)}
                      </Typography.Text>
                      {transfer.reversible ? (
                        <Button
                          type="link"
                          size="small"
                          onClick={() =>
                            modal.confirm({
                              title: "撤销这笔资金移动？",
                              content:
                                transfer.kind === "adjustment"
                                  ? "账户可用额度会恢复到调整前，不会影响收支统计。"
                                  : "双方账户额度会恢复，不会影响收支统计。",
                              onOk: () =>
                                action.mutateAsync({
                                  url:
                                    transfer.kind === "adjustment"
                                      ? `/api/finance/adjustments/${transfer.id}`
                                      : `/api/finance/transfers/${transfer.id}`,
                                  method: "DELETE",
                                }),
                            })
                          }
                        >
                          撤销
                        </Button>
                      ) : null}
                    </Flex>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="还没有转账、还款或额度调整记录" />
            )}
          </Card>
        </Col>
      </Row>

      <FinanceDrawer
        title={editingAccount ? "编辑账户" : "新增账户"}
        open={panel === "account"}
        loading={action.isPending}
        onClose={() => {
          setPanel(null)
          setEditingAccount(null)
        }}
        onSubmit={() => accountForm.submit()}
      >
        <Form
          form={accountForm}
          layout="vertical"
          onFinish={(values) =>
            action.mutate({
              url: editingAccount
                ? `/api/finance/accounts/${editingAccount.id}`
                : "/api/finance/accounts",
              method: editingAccount ? "PATCH" : "POST",
              body: editingAccount
                ? {
                    name: values.name,
                    openingBalance: values.openingBalance,
                    isDefault: values.isDefault,
                    enabled: values.enabled,
                  }
                : {
                    ...values,
                    balanceDate: values.balanceDate.format("YYYY-MM-DD"),
                  },
            })
          }
        >
          <Form.Item
            label="账户名称"
            name="name"
            rules={[{ required: true, whitespace: true, max: 80 }]}
          >
            <Input placeholder="例如：工商银行卡、花呗、房贷" />
          </Form.Item>
          <Form.Item
            label="账户类型"
            name="type"
            rules={[{ required: true }]}
            extra={editingAccount ? "账户类型创建后不再变更。" : undefined}
          >
            <Select
              options={accountTypeOptions}
              disabled={Boolean(editingAccount)}
            />
          </Form.Item>
          <Form.Item
            label="期初可用额度"
            name="openingBalance"
            extra={
              editingAccount
                ? "只适合建账填错。花呗提额请用「调整额度」，会留下日期记录。"
                : accountType === "loan"
                  ? "贷款账户期初一般为 0，放款请用「贷款账户 → 银行卡」转账。"
                  : accountType === "credit"
                    ? "填写当前还能花的额度，不是欠款。"
                    : "填写开始使用轻账时账户里的钱。"
            }
          >
            <AmountCalculator min={0} />
          </Form.Item>
          {editingAccount ? (
            <Card size="small" className="finance-account-edit-balance">
              <Statistic
                title="当前可用额度"
                value={editingAccount.availableQuota}
                precision={2}
                prefix="¥"
              />
              {editingAccount.outstanding > 0 ? (
                <Typography.Text type="secondary">
                  当前欠款 {money(editingAccount.outstanding)}
                </Typography.Text>
              ) : (
                <Typography.Text type="secondary">
                  可用额度由期初、账单、转账和校准自动计算。
                </Typography.Text>
              )}
            </Card>
          ) : (
            <Form.Item
              label="额度起算日"
              name="balanceDate"
              rules={[{ required: true }]}
              extra="只计算这一天及之后的账单与资金移动。"
            >
              <DatePicker
                style={{ width: "100%" }}
                inputReadOnly={pickerInputReadOnly}
              />
            </Form.Item>
          )}
          {accountType !== "loan" && editingAccount?.type !== "loan" && (
            <Form.Item
              name="isDefault"
              valuePropName="checked"
              extra="可选。不设置时，新账默认不记账户。"
            >
              <Checkbox
                onChange={(event) => {
                  if (event.target.checked)
                    accountForm.setFieldValue("enabled", true)
                }}
              >
                作为普通记账的默认付款账户
              </Checkbox>
            </Form.Item>
          )}
          {editingAccount && (
            <Form.Item name="enabled" valuePropName="checked">
              <Checkbox disabled={Boolean(editingIsDefault)}>
                启用这个账户
              </Checkbox>
            </Form.Item>
          )}
          {editingAccount && (
            <Button
              danger
              type="text"
              icon={<DeleteOutlined />}
              onClick={() =>
                modal.confirm({
                  title: "删除未使用账户",
                  content:
                    "只有零余额、且没有任何账单、转账或额度调整记录的账户可以删除。额度调整也算资金记录，需要先在右侧列表里撤销。",
                  okText: "尝试删除",
                  okButtonProps: { danger: true },
                  onOk: () =>
                    action.mutateAsync({
                      url: `/api/finance/accounts/${editingAccount.id}`,
                      method: "DELETE",
                    }),
                })
              }
            >
              删除这个账户
            </Button>
          )}
        </Form>
      </FinanceDrawer>

      <FinanceDrawer
        title={
          isQuotaAccount
            ? `调整 ${reconcileTarget?.name || "账户"} 额度`
            : `校准 ${reconcileTarget?.name || "账户"} 余额`
        }
        open={panel === "reconcile"}
        loading={action.isPending}
        onClose={() => {
          setPanel(null)
          setReconcileTarget(null)
        }}
        onSubmit={() => reconcileForm.submit()}
      >
        <Typography.Paragraph type="secondary">
          {isQuotaAccount
            ? "提额、对账、改可用额度都走这里。差额只调整账户额度，不计入收入或支出。"
            : "按银行或钱包里的实际余额校准。差额只调整账户余额，不计入收入或支出。"}
        </Typography.Paragraph>
        <Form
          form={reconcileForm}
          layout="vertical"
          onFinish={(values) => {
            const current = reconcileTarget!.balance
            const target =
              values.mode === "delta"
                ? Number((current + Number(values.delta || 0)).toFixed(2))
                : values.balance
            action.mutate({
              url: `/api/finance/accounts/${reconcileTarget!.id}/reconcile`,
              body: {
                balance: target,
                note: values.note,
              },
            })
          }}
        >
          {isQuotaAccount ? (
            <Form.Item name="mode" label="调整方式">
              <Radio.Group
                options={[
                  { label: "调整到实际可用", value: "set" },
                  { label: "额度增减", value: "delta" },
                ]}
              />
            </Form.Item>
          ) : null}
          {reconcileMode === "delta" && isQuotaAccount ? (
            <Form.Item
              label="额度增减"
              name="delta"
              rules={[{ required: true, type: "number" }]}
              extra={`当前可用 ${money(reconcileTarget?.balance || 0)}，例如提额填 5000。`}
            >
              <AmountCalculator allowNegative />
            </Form.Item>
          ) : (
            <Form.Item
              label={isQuotaAccount ? "实际可用额度" : "实际余额"}
              name="balance"
              rules={[{ required: true, type: "number" }]}
            >
              <AmountCalculator allowNegative />
            </Form.Item>
          )}
          <Form.Item label="备注" name="note" rules={[{ max: 500 }]}>
            <Input
              placeholder={
                isQuotaAccount
                  ? "例如：花呗提额 5000"
                  : "例如：按 8 月银行余额校准"
              }
            />
          </Form.Item>
        </Form>
      </FinanceDrawer>

      <FinanceDrawer
        title="账户间转账"
        open={panel === "transfer"}
        loading={action.isPending}
        onClose={() => setPanel(null)}
        onSubmit={() => transferForm.submit()}
      >
        <Form
          form={transferForm}
          layout="vertical"
          onFinish={(values) =>
            action.mutate({
              url: "/api/finance/transfers",
              body: { ...values, date: values.date.format("YYYY-MM-DD") },
            })
          }
        >
          <Form.Item label="日期" name="date" rules={[{ required: true }]}>
            <DatePicker
              style={{ width: "100%" }}
              inputReadOnly={pickerInputReadOnly}
            />
          </Form.Item>
          <div className="form-grid-2">
            <Form.Item
              label="从账户"
              name="fromAccountId"
              rules={[{ required: true }]}
            >
              <Select options={allAccountOptions} />
            </Form.Item>
            <Form.Item
              label="到账户"
              name="toAccountId"
              rules={[{ required: true }]}
            >
              <Select options={allAccountOptions} />
            </Form.Item>
          </div>
          <Form.Item
            label="金额"
            name="amount"
            rules={[{ required: true, type: "number", min: 0.01 }]}
          >
            <AmountCalculator min={0.01} />
          </Form.Item>
          <Form.Item label="备注" name="note" rules={[{ max: 500 }]}>
            <Input.TextArea
              rows={3}
              placeholder="例如：银行卡转入支付宝，或贷款放到银行卡"
            />
          </Form.Item>
          <Typography.Text type="secondary">
            任意启用账户都可互转。贷款放到银行卡、用银行卡还花呗都记转账，不计入收支。
          </Typography.Text>
        </Form>
      </FinanceDrawer>

      <FinanceDrawer
        title="记还款"
        open={panel === "repayment"}
        loading={action.isPending}
        onClose={() => setPanel(null)}
        onSubmit={() => repaymentForm.submit()}
      >
        <Typography.Paragraph type="secondary">
          本金记为转账，利息和手续费另记一笔支出。例如用中国银行还花呗。
        </Typography.Paragraph>
        <Form
          form={repaymentForm}
          layout="vertical"
          onFinish={(values) =>
            action.mutate({
              url: "/api/finance/repayments",
              body: { ...values, date: values.date.format("YYYY-MM-DD") },
            })
          }
        >
          <Form.Item label="日期" name="date" rules={[{ required: true }]}>
            <DatePicker
              style={{ width: "100%" }}
              inputReadOnly={pickerInputReadOnly}
            />
          </Form.Item>
          <div className="form-grid-2">
            <Form.Item
              label="付款账户"
              name="fromAccountId"
              rules={[{ required: true }]}
            >
              <Select options={payerOptions} />
            </Form.Item>
            <Form.Item
              label="还款账户"
              name="toAccountId"
              rules={[{ required: true }]}
            >
              <Select options={debtOptions} />
            </Form.Item>
          </div>
          <Form.Item
            label="偿还本金"
            name="principal"
            rules={[{ required: true, type: "number", min: 0.01 }]}
          >
            <AmountCalculator min={0.01} />
          </Form.Item>
          <div className="form-grid-2">
            <Form.Item label="利息" name="interest">
              <AmountCalculator min={0} />
            </Form.Item>
            <Form.Item label="手续费" name="fee">
              <AmountCalculator min={0} />
            </Form.Item>
          </div>
          <Form.Item label="备注" name="note" rules={[{ max: 500 }]}>
            <Input.TextArea rows={3} placeholder="例如：还花呗" />
          </Form.Item>
        </Form>
      </FinanceDrawer>
    </div>
  )
}

function FinanceDrawer({
  title,
  open,
  loading,
  onClose,
  onSubmit,
  children,
}: any) {
  return (
    <Drawer
      className="responsive-drawer finance-drawer"
      title={title}
      open={open}
      width={520}
      destroyOnHidden
      onClose={onClose}
      footer={
        <Flex justify="flex-end" gap={8}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={loading} onClick={onSubmit}>
            保存
          </Button>
        </Flex>
      }
    >
      {children}
    </Drawer>
  )
}
