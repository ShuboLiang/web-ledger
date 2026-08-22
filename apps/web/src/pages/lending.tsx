import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  RightOutlined,
  SwapOutlined,
  TeamOutlined,
} from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert,
  App,
  AutoComplete,
  Avatar,
  Button,
  Card,
  Col,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Form,
  Input,
  List,
  Progress,
  Radio,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd"
import dayjs from "dayjs"
import { useMemo, useState } from "react"
import { AmountCalculator } from "@/components/amount-calculator"
import { DatePicker } from "@/components/sheet-date-picker"
import {
  api,
  type Dictionaries,
  type LendingContact,
  type LendingContactDetail,
  type LendingDirection,
  type LendingEntry,
  type LendingOverview,
} from "@/lib/api"
import { money } from "@/lib/utils"
import { usePickerInputReadOnly, useSearchableSelect } from "@/lib/use-viewport"

type EntryKind = "advance" | "covered" | "borrow"

const entryKinds: {
  value: EntryKind
  label: string
  title: string
  hint: string
  amountLabel: string
  accountLabel: string
}[] = [
  {
    value: "advance",
    label: "我先垫付",
    title: "我先付钱，对方欠我",
    hint: "聚餐买单、帮朋友代购、公司差旅待报销都用这个。金额按账单原样填，垫出去的部分不算你的支出，只有「我自己那份」才计入支出和预算。",
    amountLabel: "这次一共付了",
    accountLabel: "付款账户",
  },
  {
    value: "covered",
    label: "别人替我付",
    title: "对方先付钱，我欠对方",
    hint: "朋友替你买单。这笔会记成你的一笔支出，同时挂上欠对方的钱，还钱时自动冲抵。",
    amountLabel: "我欠对方",
    accountLabel: "",
  },
  {
    value: "borrow",
    label: "我借入现金",
    title: "对方把钱给我，我欠对方",
    hint: "借来的钱进入你的账户，余额增加但不算收入。",
    amountLabel: "借入金额",
    accountLabel: "收款账户",
  },
]

const initials = (name: string) => name.trim().slice(0, 2) || "友"

export function LendingPage() {
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()
  const pickerInputReadOnly = usePickerInputReadOnly()
  const searchableSelect = useSearchableSelect()
  const [entryForm] = Form.useForm()
  const [settleForm] = Form.useForm()
  const [contactForm] = Form.useForm()
  const [panel, setPanel] = useState<"entry" | "settle" | "contact" | null>(null)
  const [settleTarget, setSettleTarget] = useState<LendingEntry | null>(null)
  const [editingContact, setEditingContact] = useState<LendingContact | null>(
    null,
  )
  const [detailId, setDetailId] = useState<string | null>(null)
  const kind: EntryKind = Form.useWatch("kind", entryForm) || "advance"
  const settleDirection: LendingDirection =
    Form.useWatch("direction", settleForm) || "receivable"
  const settleContactId = Form.useWatch("contactId", settleForm)
  const selfAmount = Form.useWatch("selfAmount", entryForm)
  const entryAmount = Form.useWatch("amount", entryForm)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["lending"],
    queryFn: () => api<LendingOverview>("/api/lending"),
  })
  const { data: dictionaries } = useQuery({
    queryKey: ["dictionaries"],
    queryFn: () => api<Dictionaries>("/api/dictionaries"),
  })
  const detail = useQuery({
    queryKey: ["lending-contact", detailId],
    queryFn: () =>
      api<LendingContactDetail>(`/api/lending/contacts/${detailId}`),
    enabled: Boolean(detailId),
  })

  const contacts = data?.contacts || []
  const entries = data?.entries || []
  const categories = dictionaries?.categories || []
  const ownAccounts = (dictionaries?.accounts || []).filter(
    (account) => !account.isContact,
  )
  const accountOptions = ownAccounts.map((account) => ({
    value: account.id,
    label: `${account.name} · 可用 ${money(account.availableQuota || 0)}`,
  }))
  const defaultAccountId =
    ownAccounts.find((account) => account.isDefault)?.id || ownAccounts[0]?.id
  const contactOptions = contacts
    .filter((contact) => contact.enabled)
    .map((contact) => ({ value: contact.name, label: contact.name }))
  const selectedPrimary = Form.useWatch("category1", entryForm)
  const primaryOptions = useMemo(
    () => [...new Set(categories.map((row) => row.category1))],
    [categories],
  )
  const secondaryOptions = useMemo(
    () => [
      ...new Set(
        categories
          .filter((row) => row.category1 === selectedPrimary)
          .map((row) => row.category2),
      ),
    ],
    [categories, selectedPrimary],
  )
  const settleContact = contacts.find(
    (contact) => contact.id === settleContactId,
  )
  const settleOutstanding = settleTarget
    ? settleTarget.outstanding
    : settleDirection === "receivable"
      ? settleContact?.openReceivable || 0
      : settleContact?.openPayable || 0

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["lending"] }),
      queryClient.invalidateQueries({ queryKey: ["lending-contact"] }),
      queryClient.invalidateQueries({ queryKey: ["finance"] }),
      queryClient.invalidateQueries({ queryKey: ["dictionaries"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ])
  const action = useMutation({
    mutationFn: ({ url, body, method = "POST" }: any) =>
      api(url, { method, body: body ? JSON.stringify(body) : undefined }),
    onSuccess: async (_result, variables: any) => {
      setPanel(null)
      setEditingContact(null)
      await refresh()
      message.success(variables.success || "已记录")
    },
    onError: (error: Error) => message.error(error.message),
  })

  const settleContactOptions = useMemo(() => {
    const rows = contacts.filter(
      (contact) =>
        contact.openCount > 0 ||
        contact.id === settleContactId ||
        (contact.enabled && Math.abs(contact.balance) >= 0.01),
    )
    const seen = new Set(rows.map((row) => row.id))
    if (settleContactId && !seen.has(settleContactId)) {
      const current = contacts.find((row) => row.id === settleContactId)
      if (current) rows.push(current)
    }
    return rows.map((contact) => ({
      value: contact.id,
      label: contact.name,
      outstanding:
        contact.openReceivable > 0 || contact.openPayable > 0
          ? `${
              contact.openReceivable > 0
                ? `欠我 ${money(contact.openReceivable)}`
                : ""
            }${
              contact.openReceivable > 0 && contact.openPayable > 0 ? " / " : ""
            }${
              contact.openPayable > 0 ? `我欠 ${money(contact.openPayable)}` : ""
            }`
          : "已结清",
    }))
  }, [contacts, settleContactId])

  const openEntry = (preset?: { contactName?: string; kind?: EntryKind }) => {
    setPanel("entry")
    entryForm.resetFields()
    entryForm.setFieldsValue({
      kind: preset?.kind || "advance",
      contactName: preset?.contactName,
      date: dayjs(),
      amount: undefined,
      selfAmount: undefined,
      item: undefined,
      category1: undefined,
      category2: undefined,
      accountId: defaultAccountId,
      dueDate: null,
      note: "",
    })
  }
  const openSettle = (preset?: {
    contact?: LendingContact
    entry?: LendingEntry
  }) => {
    const contact =
      preset?.contact ||
      contacts.find((row) => row.id === preset?.entry?.contactId)
    const direction: LendingDirection =
      preset?.entry?.direction ||
      (contact && contact.openPayable > 0 && contact.openReceivable <= 0
        ? "payable"
        : "receivable")
    setPanel("settle")
    setSettleTarget(preset?.entry || null)
    settleForm.resetFields()
    settleForm.setFieldsValue({
      contactId: contact?.id,
      entryId: preset?.entry?.id,
      direction,
      date: dayjs(),
      amount:
        preset?.entry?.outstanding ??
        (direction === "receivable"
          ? contact?.openReceivable
          : contact?.openPayable) ??
        undefined,
      accountId: defaultAccountId,
      note: "",
    })
  }
  const openContactForm = (contact?: LendingContact) => {
    setEditingContact(contact || null)
    setPanel("contact")
    contactForm.resetFields()
    contactForm.setFieldsValue({ name: contact?.name || "" })
  }
  const currentDetail = detail.data?.contact
  const renameContact = () => {
    if (!currentDetail) return
    openContactForm(
      contacts.find((row) => row.id === currentDetail.id) || currentDetail,
    )
  }
  const toggleContactEnabled = () => {
    if (!currentDetail) return
    const archiving = currentDetail.enabled
    modal.confirm({
      title: archiving
        ? `归档「${currentDetail.name}」`
        : `恢复「${currentDetail.name}」`,
      content: archiving
        ? "归档后不会出现在新建往来的名单里，历史记录还在，随时可以恢复。"
        : "恢复后可以继续记往来。",
      okText: archiving ? "归档" : "恢复",
      cancelText: "取消",
      onOk: async () => {
        await api(`/api/lending/contacts/${currentDetail.id}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: !currentDetail.enabled }),
        })
        await refresh()
        message.success(archiving ? "已归档" : "已恢复")
      },
    })
  }
  const removeContact = () => {
    if (!currentDetail) return
    modal.confirm({
      title: `删除「${currentDetail.name}」`,
      content:
        "只能删除没有往来记录、余额为零的对象。记错名字请改名；暂时不用请归档。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await api(`/api/lending/contacts/${currentDetail.id}`, {
          method: "DELETE",
        })
        setDetailId(null)
        await refresh()
        message.success("往来对象已删除")
      },
    })
  }
  const removeEntry = (entry: LendingEntry) =>
    modal.confirm({
      title: `撤销「${entry.item}」`,
      content:
        "这笔往来产生的资金移动会一并撤销，关联的账目会进入回收站，可以再恢复。",
      okText: "撤销",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await api(`/api/lending/entries/${entry.id}`, { method: "DELETE" })
        await refresh()
        message.success("往来已撤销")
      },
    })

  const summaryCards = [
    {
      key: "receivable",
      label: "别人欠我",
      value: data?.summary.receivable || 0,
      tone: "",
    },
    {
      key: "payable",
      label: "我欠别人",
      value: data?.summary.payable || 0,
      tone: "debt",
    },
    {
      key: "net",
      label: "往来净额",
      value: data?.summary.net || 0,
      tone: "net",
    },
    {
      key: "overdue",
      label: "已过约定日",
      value: data?.summary.overdueCount || 0,
      tone: "due",
      count: true,
    },
  ]
  const overdue = entries.filter((entry) => entry.overdue)
  const untracked = data?.summary.untracked || 0

  if (isLoading) return <Skeleton active paragraph={{ rows: 12 }} />
  if (isError || !data)
    return (
      <Card>
        <Empty description="人情往来数据加载失败">
          <Button onClick={() => refetch()}>重新加载</Button>
        </Empty>
      </Card>
    )

  return (
    <div className="page-stack lending-page">
      <Card className="finance-command-card">
        <Flex justify="space-between" align="flex-start" gap={16} wrap>
          <div>
            <Typography.Text className="statement-eyebrow">
              LENDING · 人情往来
            </Typography.Text>
            <Typography.Title level={4}>
              谁欠我、我欠谁，一笔一笔都对得上
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              垫付、代付和借入会同时记好账目和欠款；收钱还钱时按笔冲抵，剩多少一目了然。
            </Typography.Paragraph>
          </div>
          <Space wrap className="finance-actions">
            <Button
              icon={<TeamOutlined />}
              onClick={() => openContactForm()}
            >
              新增往来对象
            </Button>
            <Button icon={<SwapOutlined />} onClick={() => openSettle()}>
              记收款 / 还钱
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openEntry()}
            >
              记一笔往来
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
              precision={card.count ? 0 : 2}
              prefix={card.count ? undefined : "¥"}
              suffix={card.count ? "笔" : undefined}
            />
          </Card>
        ))}
      </div>

      {Boolean(overdue.length) && (
        <Alert
          type="warning"
          showIcon
          icon={<ClockCircleOutlined />}
          message={`有 ${overdue.length} 笔往来已过约定日期`}
          description={overdue
            .slice(0, 3)
            .map(
              (entry) =>
                `${entry.contactName}「${entry.item}」${money(entry.outstanding)}，约定 ${entry.dueDate}`,
            )
            .join("；")}
        />
      )}

      {Math.abs(untracked) >= 0.01 && (
        <Alert
          type="info"
          showIcon
          message="有往来金额没有对应的按笔记录"
          description={`账户口径与按笔跟踪相差 ${money(Math.abs(untracked))}。常见原因是记账时把付款账户直接选成了往来对象，而不是走「记一笔往来」。可以在对应人的明细里核对流水。`}
        />
      )}

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={10}>
          <Card
            title="往来对象"
            extra={
              <Typography.Text type="secondary">
                {data.summary.contactCount} 人
              </Typography.Text>
            }
            className="finance-section-card"
          >
            {contacts.length ? (
              <List
                dataSource={contacts}
                renderItem={(contact) => (
                  <List.Item
                    className="lending-contact-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailId(contact.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ")
                        setDetailId(contact.id)
                    }}
                    extra={<RightOutlined className="lending-contact-arrow" />}
                  >
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          size={44}
                          className={`lending-avatar ${contact.balance < 0 ? "debt" : ""}`}
                        >
                          {initials(contact.name)}
                        </Avatar>
                      }
                      title={
                        <Flex align="center" gap={8} wrap>
                          <span>{contact.name}</span>
                          {contact.overdueCount > 0 && (
                            <Tag color="error">
                              逾期 {contact.overdueCount} 笔
                            </Tag>
                          )}
                          {!contact.enabled && <Tag>已归档</Tag>}
                        </Flex>
                      }
                      description={
                        <Typography.Text type="secondary">
                          {contact.openCount
                            ? `${contact.openCount} 笔未结清`
                            : "已全部结清"}
                          {contact.nextDueDate
                            ? ` · 约定 ${contact.nextDueDate}`
                            : contact.lastDate
                              ? ` · 最近 ${contact.lastDate}`
                              : ""}
                        </Typography.Text>
                      }
                    />
                    <Flex vertical align="flex-end" gap={2}>
                      <Typography.Text
                        strong
                        className={
                          contact.balance < 0 ? "money-negative" : "money-positive"
                        }
                      >
                        {money(Math.abs(contact.balance))}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        {contact.balance < 0
                          ? "我欠"
                          : contact.balance > 0
                            ? "欠我"
                            : "已结清"}
                      </Typography.Text>
                    </Flex>
                  </List.Item>
                )}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="还没有往来对象"
              >
                <Button type="primary" onClick={() => openEntry()}>
                  记第一笔往来
                </Button>
              </Empty>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card
            title="待结清的往来"
            extra={
              <Typography.Text type="secondary">
                {entries.length} 笔
              </Typography.Text>
            }
            className="finance-section-card"
          >
            {entries.length ? (
              <List
                dataSource={entries}
                renderItem={(entry) => (
                  <LendingEntryItem
                    key={entry.id}
                    entry={entry}
                    showContact
                    onSettle={() => openSettle({ entry })}
                    onRemove={() => removeEntry(entry)}
                  />
                )}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="没有待结清的往来，清清爽爽"
              />
            )}
          </Card>
        </Col>
      </Row>

      <Drawer
        className="responsive-drawer"
        title="记一笔往来"
        open={panel === "entry"}
        width={520}
        destroyOnHidden
        onClose={() => setPanel(null)}
        footer={
          <Flex justify="flex-end" gap={8}>
            <Button onClick={() => setPanel(null)}>取消</Button>
            <Button
              type="primary"
              loading={action.isPending}
              onClick={() => entryForm.submit()}
            >
              保存
            </Button>
          </Flex>
        }
      >
        <Form
          form={entryForm}
          layout="vertical"
          onFinish={(values) =>
            action.mutate({
              url: "/api/lending/entries",
              success: "往来已记录",
              body: {
                kind: values.kind,
                contactName: values.contactName,
                date: values.date.format("YYYY-MM-DD"),
                amount: values.amount,
                selfAmount: values.kind === "advance" ? values.selfAmount : 0,
                item: values.item,
                category1: values.category1,
                category2: values.category2,
                accountId: values.accountId,
                dueDate: values.dueDate
                  ? values.dueDate.format("YYYY-MM-DD")
                  : "",
                note: values.note,
              },
            })
          }
        >
          <Form.Item name="kind">
            <Segmented
              block
              options={entryKinds.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onChange={() => {
                entryForm.setFieldValue("selfAmount", undefined)
                entryForm.setFieldValue("accountId", defaultAccountId)
              }}
            />
          </Form.Item>
          <Alert
            type="info"
            showIcon={false}
            className="lending-kind-hint"
            message={entryKinds.find((row) => row.value === kind)!.title}
            description={entryKinds.find((row) => row.value === kind)!.hint}
          />
          <Form.Item
            label="往来对象"
            name="contactName"
            rules={[{ required: true, whitespace: true, max: 80 }]}
            extra="填新名字会自动建一个往来对象"
          >
            <AutoComplete
              options={contactOptions}
              placeholder="例如：张三、市场部报销"
              filterOption={(input, option) =>
                String(option?.value || "").includes(input)
              }
            />
          </Form.Item>
          <div className="form-grid-2">
            <Form.Item label="日期" name="date" rules={[{ required: true }]}>
              <DatePicker
                allowClear={false}
                style={{ width: "100%" }}
                inputReadOnly={pickerInputReadOnly}
              />
            </Form.Item>
            <Form.Item
              label={entryKinds.find((row) => row.value === kind)!.amountLabel}
              name="amount"
              rules={[{ required: true, type: "number", min: 0.01 }]}
            >
              <AmountCalculator min={0.01} />
            </Form.Item>
          </div>
          <Form.Item
            label="事由"
            name="item"
            rules={[{ required: true, whitespace: true, max: 80 }]}
          >
            <Input placeholder="例如：火锅聚餐、上海出差机票、周转" />
          </Form.Item>
          {kind === "advance" && (
            <Form.Item
              label="其中我自己那份"
              name="selfAmount"
              dependencies={["amount"]}
              rules={[
                {
                  validator: (_rule, value) =>
                    !value || Number(value) < Number(entryAmount || 0)
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error("自己那份要小于这次付出去的总金额"),
                        ),
                },
              ]}
              extra={
                Number(selfAmount) > 0 && Number(entryAmount) > 0
                  ? `这份记成你的支出，剩下 ${money(
                      Math.max(0, Number(entryAmount) - Number(selfAmount)),
                    )} 挂成对方欠你的`
                  : "AA 时填自己应承担的金额，会单独记成一笔支出；纯垫付或待报销留空即可"
              }
            >
              <AmountCalculator min={0} />
            </Form.Item>
          )}
          {(kind === "covered" || Number(selfAmount) > 0) && (
            <div className="form-grid-2">
              <Form.Item
                label="一级分类"
                name="category1"
                rules={[{ required: true }]}
              >
                <Select
                  options={primaryOptions.map((value) => ({
                    value,
                    label: value,
                  }))}
                  showSearch={searchableSelect}
                  onChange={() => entryForm.setFieldValue("category2", undefined)}
                />
              </Form.Item>
              <Form.Item
                label="二级分类"
                name="category2"
                rules={[{ required: true }]}
              >
                <Select
                  options={secondaryOptions.map((value) => ({
                    value,
                    label: value,
                  }))}
                  showSearch={searchableSelect}
                />
              </Form.Item>
            </div>
          )}
          {kind !== "covered" && (
            <Form.Item
              label={entryKinds.find((row) => row.value === kind)!.accountLabel}
              name="accountId"
              rules={[{ required: true }]}
            >
              <Select options={accountOptions} showSearch={searchableSelect} />
            </Form.Item>
          )}
          <Form.Item
            label="约定还款日"
            name="dueDate"
            extra="填了以后逾期会在概览和这里提醒"
          >
            <DatePicker
              style={{ width: "100%" }}
              inputReadOnly={pickerInputReadOnly}
            />
          </Form.Item>
          <Form.Item label="备注" name="note" rules={[{ max: 500 }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        className="responsive-drawer"
        title="记收款 / 还钱"
        open={panel === "settle"}
        width={480}
        destroyOnHidden
        onClose={() => {
          setPanel(null)
          setSettleTarget(null)
        }}
        footer={
          <Flex justify="flex-end" gap={8}>
            <Button onClick={() => setPanel(null)}>取消</Button>
            <Button
              type="primary"
              loading={action.isPending}
              onClick={() => settleForm.submit()}
            >
              保存
            </Button>
          </Flex>
        }
      >
        <Form
          form={settleForm}
          layout="vertical"
          onFinish={(values) =>
            action.mutate({
              url: "/api/lending/settlements",
              success:
                values.direction === "receivable" ? "已记收款" : "已记还钱",
              body: {
                contactId: values.contactId,
                entryId: values.entryId || "",
                direction: values.direction,
                date: values.date.format("YYYY-MM-DD"),
                amount: values.amount,
                accountId: values.accountId,
                note: values.note,
              },
            })
          }
        >
          <Form.Item name="entryId" hidden>
            <Input />
          </Form.Item>
          {settleTarget && (
            <Alert
              type="info"
              showIcon={false}
              className="lending-kind-hint"
              message={`正在结清「${settleTarget.item}」`}
              description={`这笔还差 ${money(settleTarget.outstanding)}，可以只结一部分。`}
              action={
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    setSettleTarget(null)
                    settleForm.setFieldValue("entryId", undefined)
                  }}
                >
                  改成按人结算
                </Button>
              }
            />
          )}
          <Form.Item
            label="往来对象"
            name="contactId"
            rules={[{ required: true }]}
          >
            <Select
              showSearch={searchableSelect}
              optionFilterProp="label"
              placeholder="选择往来对象"
              options={settleContactOptions.map((option) => ({
                value: option.value,
                label: `${option.label} · ${option.outstanding}`,
              }))}
              labelRender={(option) => {
                const contact = contacts.find((row) => row.id === option.value)
                return contact?.name || option.label
              }}
              onChange={() => {
                setSettleTarget(null)
                settleForm.setFieldValue("entryId", undefined)
              }}
            />
          </Form.Item>
          <Form.Item name="direction" label="结算方向">
            <Radio.Group
              optionType="button"
              disabled={Boolean(settleTarget)}
              options={[
                { value: "receivable", label: "收回别人欠我的" },
                { value: "payable", label: "还给别人" },
              ]}
              onChange={(event) => {
                setSettleTarget(null)
                settleForm.setFieldsValue({
                  entryId: undefined,
                  amount:
                    event.target.value === "receivable"
                      ? settleContact?.openReceivable
                      : settleContact?.openPayable,
                })
              }}
            />
          </Form.Item>
          <div className="form-grid-2">
            <Form.Item label="日期" name="date" rules={[{ required: true }]}>
              <DatePicker
                allowClear={false}
                style={{ width: "100%" }}
                inputReadOnly={pickerInputReadOnly}
              />
            </Form.Item>
            <Form.Item
              label="金额"
              name="amount"
              rules={[{ required: true, type: "number", min: 0.01 }]}
              extra={
                settleContact ? `待结清 ${money(settleOutstanding)}` : undefined
              }
            >
              <AmountCalculator min={0.01} />
            </Form.Item>
          </div>
          <Form.Item
            label={
              settleDirection === "receivable" ? "收款到账户" : "从哪个账户付"
            }
            name="accountId"
            rules={[{ required: true }]}
          >
            <Select options={accountOptions} showSearch={searchableSelect} />
          </Form.Item>
          <Form.Item label="备注" name="note" rules={[{ max: 500 }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          {!settleTarget && (
            <Typography.Text type="secondary">
              不指定具体某笔时，金额会从最早的一笔开始依次冲抵，可以只还一部分。
            </Typography.Text>
          )}
        </Form>
      </Drawer>

      <Drawer
        className="responsive-drawer"
        title={editingContact ? "修改往来对象" : "新增往来对象"}
        open={panel === "contact"}
        width={420}
        destroyOnHidden
        onClose={() => {
          setPanel(null)
          setEditingContact(null)
        }}
        footer={
          <Flex justify="flex-end" gap={8}>
            <Button onClick={() => setPanel(null)}>取消</Button>
            <Button
              type="primary"
              loading={action.isPending}
              onClick={() => contactForm.submit()}
            >
              保存
            </Button>
          </Flex>
        }
      >
        <Typography.Paragraph type="secondary">
          {editingContact
            ? "改名后历史往来会跟到新名字上。暂时不想看到这个人，可以在明细里归档。"
            : "往来对象可以是人，也可以是公司或团体。记往来时直接输入新名字也会自动创建。"}
        </Typography.Paragraph>
        <Form
          form={contactForm}
          layout="vertical"
          onFinish={(values) =>
            action.mutate({
              url: editingContact
                ? `/api/lending/contacts/${editingContact.id}`
                : "/api/lending/contacts",
              method: editingContact ? "PATCH" : "POST",
              success: editingContact ? "名称已更新" : "往来对象已创建",
              body: values,
            })
          }
        >
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, whitespace: true, max: 80 }]}
          >
            <Input placeholder="例如：张三、公司报销" />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        className="responsive-drawer"
        title={detail.data?.contact.name || "往来明细"}
        open={Boolean(detailId)}
        width={560}
        destroyOnHidden
        onClose={() => setDetailId(null)}
      >
        {detail.isLoading || !detail.data ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <ContactDetail
            detail={detail.data}
            onEntry={(entryKind) =>
              openEntry({
                contactName: detail.data.contact.name,
                kind: entryKind,
              })
            }
            onSettle={(entry) =>
              openSettle(
                entry
                  ? { entry }
                  : {
                      contact: contacts.find(
                        (row) => row.id === detail.data!.contact.id,
                      ),
                    },
              )
            }
            onRemove={removeEntry}
            onRename={renameContact}
            onToggleEnabled={toggleContactEnabled}
            onDelete={removeContact}
          />
        )}
      </Drawer>
    </div>
  )
}

function LendingEntryItem({
  entry,
  showContact,
  onSettle,
  onRemove,
}: {
  entry: LendingEntry
  showContact?: boolean
  onSettle: () => void
  onRemove: () => void
}) {
  const receivable = entry.direction === "receivable"
  const settled = entry.status === "settled"
  const progress = entry.amount
    ? Math.round((entry.settledAmount / entry.amount) * 100)
    : 0
  return (
    <List.Item
      className="lending-entry-item"
      actions={
        settled
          ? [
              <Button
                key="remove"
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                aria-label="撤销这笔往来"
                onClick={onRemove}
              />,
            ]
          : [
              <Button key="settle" type="link" size="small" onClick={onSettle}>
                {receivable ? "收款" : "还钱"}
              </Button>,
              <Button
                key="remove"
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                aria-label="撤销这笔往来"
                onClick={onRemove}
              />,
            ]
      }
    >
      <List.Item.Meta
        avatar={
          <span className={`lending-entry-icon ${receivable ? "in" : "out"}`}>
            {receivable ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
          </span>
        }
        title={
          <Flex align="center" gap={8} wrap>
            <span>
              {showContact ? `${entry.contactName} · ` : ""}
              {entry.item}
            </span>
            {entry.overdue && <Tag color="error">已过约定日</Tag>}
            {settled && <Tag color="success">已结清</Tag>}
          </Flex>
        }
        description={
          <Space direction="vertical" size={2} style={{ width: "100%" }}>
            <Typography.Text type="secondary">
              {entry.date}
              {entry.dueDate ? ` · 约定 ${entry.dueDate}` : ""}
              {entry.note ? ` · ${entry.note}` : ""}
            </Typography.Text>
            {entry.settledAmount > 0 && !settled && (
              <Progress
                percent={progress}
                size="small"
                format={() =>
                  `已收付 ${money(entry.settledAmount)} / ${money(entry.amount)}`
                }
              />
            )}
          </Space>
        }
      />
      <Flex vertical align="flex-end" gap={2} className="lending-entry-side">
        <Typography.Text
          strong
          className={receivable ? "money-positive" : "money-negative"}
        >
          {money(settled ? entry.amount : entry.outstanding)}
        </Typography.Text>
        <Typography.Text type="secondary">
          {settled ? "已结清" : receivable ? "待收回" : "待还出"}
        </Typography.Text>
      </Flex>
    </List.Item>
  )
}

function ContactDetail({
  detail,
  onEntry,
  onSettle,
  onRemove,
  onRename,
  onToggleEnabled,
  onDelete,
}: {
  detail: LendingContactDetail
  onEntry: (kind: EntryKind) => void
  onSettle: (entry?: LendingEntry) => void
  onRemove: (entry: LendingEntry) => void
  onRename: () => void
  onToggleEnabled: () => void
  onDelete: () => void
}) {
  const [tab, setTab] = useState<"entries" | "movements">("entries")
  const { contact, entries, movements } = detail
  const open = entries.filter((entry) => entry.status === "open")
  const settled = entries.filter((entry) => entry.status === "settled")
  return (
    <div className="page-stack lending-detail">
      <Card className="lending-detail-summary">
        <Statistic
          title={
            contact.balance < 0
              ? "我欠对方"
              : contact.balance > 0
                ? "对方欠我"
                : "已经两清"
          }
          value={Math.abs(contact.balance)}
          precision={2}
          prefix="¥"
          valueStyle={{
            color: contact.balance < 0 ? "#b3543a" : "#176b62",
          }}
        />
        <Typography.Text type="secondary">
          {contact.openCount
            ? `${contact.openCount} 笔未结清`
            : "所有往来都已结清"}
          {contact.overdueCount ? ` · ${contact.overdueCount} 笔已过约定日` : ""}
        </Typography.Text>
        <Flex gap={8} wrap style={{ marginTop: 14 }}>
          <Button type="primary" onClick={() => onSettle()}>
            记收款 / 还钱
          </Button>
          <Button onClick={() => onEntry("advance")}>再垫付一笔</Button>
          <Button onClick={() => onEntry("covered")}>对方替我付</Button>
          <Dropdown
            menu={{
              items: [
                { key: "rename", label: "改名", onClick: onRename },
                {
                  key: "archive",
                  label: contact.enabled ? "归档" : "取消归档",
                  onClick: onToggleEnabled,
                },
                { type: "divider" },
                {
                  key: "delete",
                  label: "删除",
                  danger: true,
                  onClick: onDelete,
                },
              ],
            }}
          >
            <Button>管理</Button>
          </Dropdown>
        </Flex>
      </Card>

      <Segmented
        block
        value={tab}
        onChange={(value) => setTab(value as typeof tab)}
        options={[
          { value: "entries", label: `往来记录 ${entries.length}` },
          { value: "movements", label: `资金流水 ${movements.length}` },
        ]}
      />

      {tab === "entries" ? (
        entries.length ? (
          <Card styles={{ body: { padding: "0 16px" } }}>
            <List
              dataSource={[...open, ...settled]}
              renderItem={(entry) => (
                <LendingEntryItem
                  key={entry.id}
                  entry={entry}
                  onSettle={() => onSettle(entry)}
                  onRemove={() => onRemove(entry)}
                />
              )}
            />
          </Card>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="还没有按笔记录的往来"
          />
        )
      ) : movements.length ? (
        <Card styles={{ body: { padding: "0 16px" } }}>
          <List
            dataSource={movements}
            renderItem={(movement) => (
              <List.Item key={`${movement.kind}-${movement.id}`}>
                <List.Item.Meta
                  title={movement.item}
                  description={
                    <Typography.Text type="secondary">
                      {movement.date} ·{" "}
                      {movement.kind === "transfer" ? "资金移动" : "账目"}
                    </Typography.Text>
                  }
                />
                <Typography.Text
                  strong
                  className={
                    movement.amount < 0 ? "money-negative" : "money-positive"
                  }
                >
                  {money(movement.amount)}
                </Typography.Text>
              </List.Item>
            )}
          />
        </Card>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有流水" />
      )}
    </div>
  )
}
