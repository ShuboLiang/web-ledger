import {
  BankOutlined,
  CreditCardOutlined,
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
  DatePicker,
  Drawer,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  InputNumber,
  List,
  Progress,
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
import {
  api,
  type FinanceAccount,
  type FinanceLiability,
  type FinanceOverview,
} from "@/lib/api"
import { money } from "@/lib/utils"

type Panel = "account" | "transfer" | "liability" | null
const accountTypeOptions = [
  { value: "cash", label: "现金" },
  { value: "bank", label: "银行卡" },
  { value: "ewallet", label: "电子钱包" },
  { value: "credit", label: "信用账户" },
]
const liabilityKindText: Record<string, string> = {
  loan: "贷款",
  credit: "信用账户",
  installment: "分期",
}
const transferKindText: Record<string, string> = {
  transfer: "账户转账",
  debt_drawdown: "贷款到账",
  debt_payment: "偿还本金",
}

export function FinancePage() {
  const screens = Grid.useBreakpoint()
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()
  const [panel, setPanel] = useState<Panel>(null)
  const [editingAccount, setEditingAccount] = useState<FinanceAccount | null>(
    null,
  )
  const [paymentTarget, setPaymentTarget] = useState<FinanceLiability | null>(
    null,
  )
  const [settlementTarget, setSettlementTarget] =
    useState<FinanceLiability | null>(null)
  const [accountForm] = Form.useForm()
  const [transferForm] = Form.useForm()
  const [liabilityForm] = Form.useForm()
  const [paymentForm] = Form.useForm()
  const [settlementForm] = Form.useForm()
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
      setPaymentTarget(null)
      setSettlementTarget(null)
      accountForm.resetFields()
      transferForm.resetFields()
      liabilityForm.resetFields()
      paymentForm.resetFields()
      settlementForm.resetFields()
      await refresh()
      message.success("财务状态已更新")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const assets = data?.accounts.filter((row) => !row.isLiability) || []
  const liabilityAccounts =
    data?.accounts.filter((row) => row.isLiability) || []
  const enabledAssets = assets.filter((row) => row.enabled)
  const openPanel = (next: Panel) => {
    setPanel(next)
    if (next === "account") {
      setEditingAccount(null)
      accountForm.setFieldsValue({
        name: undefined,
        type: "bank",
        openingBalance: 0,
        isDefault: !assets.length,
        enabled: true,
      })
    }
    if (next === "transfer")
      transferForm.setFieldsValue({
        date: dayjs(),
        fromAccountId: assets.find((row) => row.isDefault)?.id || assets[0]?.id,
      })
    if (next === "liability")
      liabilityForm.setFieldsValue({
        kind: "loan",
        principal: undefined,
        totalInterest: 0,
        totalInstallments: 12,
        startDate: dayjs(),
        firstDueDate: dayjs().add(1, "month"),
        fundingMode: "opening",
      })
  }
  const openAccountEdit = (account: FinanceAccount) => {
    setEditingAccount(account)
    setPanel("account")
    accountForm.setFieldsValue({
      name: account.name,
      type: account.type,
      openingBalance: account.openingBalance,
      isDefault: account.isDefault,
      enabled: account.enabled,
    })
  }
  const openPayment = (liability: FinanceLiability) => {
    if (!liability.nextInstallment) return
    setPaymentTarget(liability)
    paymentForm.setFieldsValue({
      date: dayjs(),
      sourceAccountId: assets.find((row) => row.isDefault)?.id || assets[0]?.id,
      principal: liability.nextInstallment.principal,
      interest: liability.nextInstallment.interest,
      fee: liability.nextInstallment.fee,
    })
  }
  const openSettlement = (liability: FinanceLiability) => {
    setSettlementTarget(liability)
    settlementForm.setFieldsValue({
      date: dayjs(),
      sourceAccountId: assets.find((row) => row.isDefault)?.id || assets[0]?.id,
      interest: 0,
      fee: 0,
    })
  }
  const makeDefault = (account: FinanceAccount) =>
    action.mutate({
      url: `/api/finance/accounts/${account.id}`,
      method: "PATCH",
      body: { isDefault: true },
    })
  const assetOptions = enabledAssets.map((row) => ({
    value: row.id,
    label: `${row.name} · ${money(row.balance)}`,
  }))
  const allAccountOptions = (data?.accounts || [])
    .filter((row) => row.enabled)
    .map((row) => ({
      value: row.id,
      label: `${row.name} · ${money(row.balance)}`,
    }))
  const fundingMode = Form.useWatch("fundingMode", liabilityForm)
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
        key: "net-worth",
        label: "净资产",
        value: data?.summary.netWorth || 0,
        tone: "net",
      },
      {
        key: "upcoming",
        label: "近期应还",
        value: data?.summary.upcomingAmount || 0,
        tone: "due",
      },
    ],
    [data?.summary],
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
              日常记账照旧；转账和还本金不会重复计入支出，只有利息与手续费属于消费。
            </Typography.Paragraph>
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
              onClick={() => openPanel("liability")}
            >
              新增负债
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
            title="账户余额"
            extra={
              <Typography.Text type="secondary">
                {data.accounts.length} 个账户
              </Typography.Text>
            }
            className="finance-section-card"
          >
            {data.accounts.length ? (
              <List
                dataSource={[...assets, ...liabilityAccounts]}
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
                        <Flex align="center" gap={6} wrap>
                          <Typography.Text strong>
                            {account.name}
                          </Typography.Text>
                          {account.isDefault && (
                            <Tag color="green">日常默认</Tag>
                          )}
                          {!account.enabled && <Tag>已停用</Tag>}
                        </Flex>
                        <Typography.Text type="secondary">
                          {account.typeText}
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
                          account.balance < 0
                            ? "money-negative"
                            : "money-positive"
                        }
                      >
                        {money(account.balance)}
                      </Typography.Text>
                      <Space size={2} className="finance-account-controls">
                        {!account.isLiability &&
                          !account.isDefault &&
                          account.enabled && (
                            <Button
                              type="link"
                              size="small"
                              onClick={() => makeDefault(account)}
                            >
                              设为默认
                            </Button>
                          )}
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
            title="负债与分期"
            extra={
              <Typography.Text type="secondary">
                本金与费用分开统计
              </Typography.Text>
            }
            className="finance-section-card"
          >
            {data.liabilities.length ? (
              <div className="liability-card-grid">
                {data.liabilities.map((liability) => {
                  const progress = liability.originalPrincipal
                    ? Math.min(
                        100,
                        Math.max(
                          0,
                          (liability.repaidPrincipal /
                            liability.originalPrincipal) *
                            100,
                        ),
                      )
                    : 0
                  return (
                    <Card
                      key={liability.id}
                      size="small"
                      className={`liability-card ${liability.status}`}
                    >
                      <Flex justify="space-between" align="flex-start" gap={10}>
                        <div>
                          <Flex align="center" gap={7} wrap>
                            <Typography.Text strong>
                              {liability.name}
                            </Typography.Text>
                            <Tag
                              color={
                                liability.status === "settled"
                                  ? "green"
                                  : "gold"
                              }
                            >
                              {liability.status === "settled"
                                ? "已结清"
                                : liabilityKindText[liability.kind]}
                            </Tag>
                          </Flex>
                          <Typography.Text type="secondary">
                            原始本金 {money(liability.originalPrincipal)}
                          </Typography.Text>
                        </div>
                        <Typography.Text
                          strong
                          className="liability-outstanding"
                        >
                          {money(liability.outstandingPrincipal)}
                        </Typography.Text>
                      </Flex>
                      <Progress
                        percent={Number(progress.toFixed(1))}
                        showInfo={false}
                      />
                      <Flex
                        justify="space-between"
                        gap={10}
                        className="liability-meta"
                      >
                        <Typography.Text type="secondary">
                          已还本金 {money(liability.repaidPrincipal)}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          {liability.nextInstallment
                            ? `下期 ${liability.nextInstallment.dueDate} · ${money(liability.nextInstallment.total)}`
                            : liability.settledAt
                              ? `${liability.settledAt} 结清`
                              : "无待还计划"}
                        </Typography.Text>
                      </Flex>
                      {liability.status === "active" && (
                        <Flex gap={8} className="liability-actions">
                          <Button
                            block
                            disabled={
                              !liability.nextInstallment || !assets.length
                            }
                            onClick={() => openPayment(liability)}
                          >
                            还一期
                          </Button>
                          <Button
                            block
                            type="primary"
                            ghost
                            disabled={!assets.length}
                            onClick={() => openSettlement(liability)}
                          >
                            提前结清
                          </Button>
                        </Flex>
                      )}
                    </Card>
                  )
                })}
              </div>
            ) : (
              <Empty description="没有贷款或分期；需要时只设置一次，之后按计划管理。" />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="最近资金移动" className="finance-section-card">
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
                      {transfer.fromAccountName} → {transfer.toAccountName}
                    </Typography.Text>
                    <Typography.Text type="secondary" className="block-text">
                      {transfer.date} ·{" "}
                      {transferKindText[transfer.kind] || "资金移动"}
                      {transfer.note ? ` · ${transfer.note}` : ""}
                    </Typography.Text>
                  </div>
                </Flex>
                <Typography.Text strong>
                  {money(transfer.amount)}
                </Typography.Text>
              </List.Item>
            )}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无账户间转账"
          />
        )}
      </Card>

      <FinanceDrawer
        title={editingAccount ? `编辑 ${editingAccount.name}` : "新增账户"}
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
                    isDefault: values.isDefault,
                    enabled: values.enabled,
                  }
                : values,
            })
          }
        >
          <Form.Item
            label="账户名称"
            name="name"
            rules={[{ required: true, whitespace: true, max: 80 }]}
          >
            <Input placeholder="例如：工商银行卡、微信钱包" />
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
          {editingAccount ? (
            <Card size="small" className="finance-account-edit-balance">
              <Statistic
                title="当前计算余额"
                value={editingAccount.balance}
                precision={2}
                prefix="¥"
              />
              <Typography.Text type="secondary">
                余额由期初金额、账单和转账自动计算，不能在这里直接覆盖。
              </Typography.Text>
            </Card>
          ) : (
            <Form.Item
              label="当前余额"
              name="openingBalance"
              extra="资产填可用余额；信用账户填当前欠款，系统会自动按负数处理。"
            >
              <InputNumber
                min={0}
                precision={2}
                prefix="¥"
                style={{ width: "100%" }}
              />
            </Form.Item>
          )}
          {!editingAccount?.isLiability && (
            <Form.Item name="isDefault" valuePropName="checked">
              <Checkbox disabled={Boolean(editingAccount?.isDefault)}>
                作为普通记账的默认付款账户
              </Checkbox>
            </Form.Item>
          )}
          {editingAccount && (
            <Form.Item name="enabled" valuePropName="checked">
              <Checkbox disabled={editingAccount.isDefault}>
                启用这个账户
              </Checkbox>
            </Form.Item>
          )}
          {editingAccount?.isDefault && (
            <Typography.Text type="secondary">
              默认状态不能直接取消或停用；请先将其他账户设为默认。
            </Typography.Text>
          )}
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
            <DatePicker style={{ width: "100%" }} />
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
            <InputNumber
              min={0.01}
              precision={2}
              prefix="¥"
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item label="备注" name="note" rules={[{ max: 500 }]}>
            <Input.TextArea rows={3} placeholder="例如：银行卡转入支付宝" />
          </Form.Item>
          <Typography.Text type="secondary">
            转账只改变账户余额，不会计入收入或支出。
          </Typography.Text>
        </Form>
      </FinanceDrawer>

      <FinanceDrawer
        title="新增负债或分期"
        open={panel === "liability"}
        loading={action.isPending}
        onClose={() => setPanel(null)}
        onSubmit={() => liabilityForm.submit()}
      >
        <Form
          form={liabilityForm}
          layout="vertical"
          onFinish={(values) =>
            action.mutate({
              url: "/api/finance/liabilities",
              body: {
                ...values,
                startDate: values.startDate.format("YYYY-MM-DD"),
                firstDueDate: values.firstDueDate.format("YYYY-MM-DD"),
              },
            })
          }
        >
          <div className="form-grid-2">
            <Form.Item
              label="名称"
              name="name"
              rules={[{ required: true, whitespace: true, max: 80 }]}
            >
              <Input placeholder="例如：车贷、电脑分期" />
            </Form.Item>
            <Form.Item label="类型" name="kind" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: "loan", label: "贷款" },
                  { value: "credit", label: "信用账户" },
                  { value: "installment", label: "消费分期" },
                ]}
              />
            </Form.Item>
          </div>
          <div className="form-grid-2">
            <Form.Item
              label="当前待还本金"
              name="principal"
              rules={[{ required: true, type: "number", min: 0.01 }]}
            >
              <InputNumber
                min={0.01}
                precision={2}
                prefix="¥"
                style={{ width: "100%" }}
              />
            </Form.Item>
            <Form.Item label="预计总利息" name="totalInterest">
              <InputNumber
                min={0}
                precision={2}
                prefix="¥"
                style={{ width: "100%" }}
              />
            </Form.Item>
          </div>
          <Form.Item label="记录方式" name="fundingMode">
            <Radio.Group
              options={[
                { label: "只记录当前欠款", value: "opening" },
                { label: "新贷款转入账户", value: "deposit" },
              ]}
            />
          </Form.Item>
          {fundingMode === "deposit" && (
            <Form.Item
              label="贷款到账账户"
              name="targetAccountId"
              rules={[{ required: true }]}
            >
              <Select options={assetOptions} />
            </Form.Item>
          )}
          <div className="form-grid-2">
            <Form.Item
              label="开始日期"
              name="startDate"
              rules={[{ required: true }]}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label="首次还款日"
              name="firstDueDate"
              rules={[{ required: true }]}
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </div>
          <Form.Item
            label="总期数"
            name="totalInstallments"
            rules={[{ required: true, type: "number", min: 1, max: 600 }]}
          >
            <InputNumber
              min={1}
              max={600}
              precision={0}
              addonAfter="期"
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Typography.Text type="secondary">
            计划只需设置一次。每次还款时可以按银行实际本金、利息和手续费调整。
          </Typography.Text>
        </Form>
      </FinanceDrawer>

      <FinanceDrawer
        title={`偿还 ${paymentTarget?.name || "本期账单"}`}
        open={Boolean(paymentTarget)}
        loading={action.isPending}
        onClose={() => setPaymentTarget(null)}
        onSubmit={() => paymentForm.submit()}
      >
        <Form
          form={paymentForm}
          layout="vertical"
          onFinish={(values) =>
            action.mutate({
              url: `/api/finance/liabilities/${paymentTarget!.id}/payments`,
              body: { ...values, date: values.date.format("YYYY-MM-DD") },
            })
          }
        >
          <PaymentFields assetOptions={assetOptions} />
          <Typography.Text type="secondary">
            本金通过账户转账减少负债；利息和手续费才计入当月支出。
          </Typography.Text>
        </Form>
      </FinanceDrawer>

      <FinanceDrawer
        title={`提前结清 ${settlementTarget?.name || "负债"}`}
        open={Boolean(settlementTarget)}
        loading={action.isPending}
        onClose={() => setSettlementTarget(null)}
        onSubmit={() =>
          settlementTarget &&
          modal.confirm({
            title: "确认提前结清",
            content: `将偿还剩余本金 ${money(settlementTarget.outstandingPrincipal)}，并取消所有未来分期。历史还款记录会保留。`,
            okText: "确认结清",
            onOk: () => settlementForm.submit(),
          })
        }
      >
        <Card size="small" className="settlement-summary">
          <Statistic
            title="剩余本金"
            value={settlementTarget?.outstandingPrincipal || 0}
            precision={2}
            prefix="¥"
          />
        </Card>
        <Form
          form={settlementForm}
          layout="vertical"
          onFinish={(values) =>
            action.mutate({
              url: `/api/finance/liabilities/${settlementTarget!.id}/settlement`,
              body: { ...values, date: values.date.format("YYYY-MM-DD") },
            })
          }
        >
          <Form.Item label="结清日期" name="date" rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            label="付款账户"
            name="sourceAccountId"
            rules={[{ required: true }]}
          >
            <Select options={assetOptions} />
          </Form.Item>
          <div className="form-grid-2">
            <Form.Item label="结清利息" name="interest">
              <InputNumber
                min={0}
                precision={2}
                prefix="¥"
                style={{ width: "100%" }}
              />
            </Form.Item>
            <Form.Item label="手续费" name="fee">
              <InputNumber
                min={0}
                precision={2}
                prefix="¥"
                style={{ width: "100%" }}
              />
            </Form.Item>
          </div>
          <Form.Item label="备注" name="note" rules={[{ max: 500 }]}>
            <Input.TextArea rows={3} />
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

function PaymentFields({
  assetOptions,
}: {
  assetOptions: { value: string; label: string }[]
}) {
  return (
    <>
      <Form.Item label="还款日期" name="date" rules={[{ required: true }]}>
        <DatePicker style={{ width: "100%" }} />
      </Form.Item>
      <Form.Item
        label="付款账户"
        name="sourceAccountId"
        rules={[{ required: true }]}
      >
        <Select options={assetOptions} />
      </Form.Item>
      <div className="form-grid-2">
        <Form.Item
          label="本期本金"
          name="principal"
          rules={[{ required: true, type: "number", min: 0.01 }]}
        >
          <InputNumber
            min={0.01}
            precision={2}
            prefix="¥"
            style={{ width: "100%" }}
          />
        </Form.Item>
        <Form.Item label="本期利息" name="interest">
          <InputNumber
            min={0}
            precision={2}
            prefix="¥"
            style={{ width: "100%" }}
          />
        </Form.Item>
      </div>
      <Form.Item label="手续费" name="fee">
        <InputNumber
          min={0}
          precision={2}
          prefix="¥"
          style={{ width: "100%" }}
        />
      </Form.Item>
      <Form.Item label="备注" name="note" rules={[{ max: 500 }]}>
        <Input.TextArea rows={3} />
      </Form.Item>
    </>
  )
}
