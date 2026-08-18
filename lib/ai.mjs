const RULES = [
  {
    keywords: ["早饭", "早餐", "豆浆", "油条"],
    item: null,
    category1: "餐饮",
    category2: "早餐",
  },
  {
    keywords: ["午饭", "午餐", "酸奶", "便当"],
    item: null,
    category1: "餐饮",
    category2: "午餐",
  },
  {
    keywords: ["晚饭", "晚餐", "夜宵"],
    item: null,
    category1: "餐饮",
    category2: "晚餐",
  },
  {
    keywords: ["咖啡", "奶茶", "饮料"],
    item: null,
    category1: "餐饮",
    category2: "饮品",
  },
  {
    keywords: ["电费", "水费", "燃气"],
    item: null,
    category1: "居住",
    category2: "水电费",
  },
  {
    keywords: ["房租", "物业"],
    item: null,
    category1: "居住",
    category2: "房租物业",
  },
  {
    keywords: ["雨衣", "雨伞", "伞"],
    item: null,
    category1: "服饰",
    category2: "雨具",
  },
  {
    keywords: ["鞋子", "鞋"],
    item: null,
    category1: "服饰",
    category2: "鞋类",
  },
  {
    keywords: ["音乐会员", "网易云", "QQ音乐"],
    item: null,
    category1: "娱乐",
    category2: "音乐会员",
  },
  {
    keywords: ["电影", "游戏"],
    item: null,
    category1: "娱乐",
    category2: "休闲娱乐",
  },
  {
    keywords: ["药", "保法止", "医院", "挂号"],
    item: null,
    category1: "医疗健康",
    category2: "药品医疗",
  },
  {
    keywords: ["打车", "滴滴", "地铁", "公交"],
    item: null,
    category1: "交通",
    category2: "出行",
  },
]

import { Type } from "typebox"

const CATEGORY_ICON_KEYS = [
  "folder",
  "folder-file",
  "tag",
  "tags",
  "favorite",
  "pin",
  "calendar",
  "clock",
  "history",
  "hourglass",
  "warning",
  "food",
  "drink",
  "restaurant",
  "cooking",
  "shopping",
  "shop",
  "cart",
  "product",
  "gift",
  "clothing",
  "tailoring",
  "gold",
  "crown",
  "transport",
  "truck",
  "delivery",
  "travel",
  "compass",
  "navigation",
  "global",
  "flight",
  "destination",
  "travel-bag",
  "send",
  "container",
  "home",
  "apartment",
  "utilities",
  "lighting",
  "internet",
  "phone",
  "maintenance",
  "renovation",
  "key",
  "lock",
  "bell",
  "property",
  "income",
  "coin",
  "wallet",
  "debt",
  "card",
  "payment",
  "money",
  "bookkeeping",
  "calculator",
  "percentage",
  "stock",
  "fund",
  "pie-chart",
  "bar-chart",
  "line-chart",
  "transaction",
  "red-envelope",
  "insurance",
  "work",
  "desktop",
  "project",
  "profile",
  "document",
  "pdf",
  "education",
  "reading",
  "schedule",
  "audit",
  "reconcile",
  "contacts",
  "id-card",
  "mail",
  "inbox",
  "table",
  "printer",
  "attachment",
  "mobile",
  "tablet",
  "camera",
  "picture",
  "image-file",
  "video",
  "sound",
  "service",
  "cloud",
  "storage",
  "usb",
  "scan",
  "robot",
  "monitor",
  "setting",
  "health",
  "experiment",
  "care",
  "safety-cert",
  "safety",
  "family",
  "person",
  "man",
  "woman",
  "smile",
  "alert",
  "sun",
  "moon",
  "entertainment",
  "trophy",
  "translation",
]
const CATEGORY_ICON_TYPE = Type.Union(
  CATEGORY_ICON_KEYS.map((value) => Type.Literal(value)),
)
const CATEGORY_ICON_GUIDE =
  "共有 115 个与消费和个人财务直接相关的图标，按常用账务、餐饮购物、交通旅行、居家生活、财务、学习办公、数码通讯、健康家庭、休闲娱乐分组。优先选择最具体的语义键，例如 drink饮品、restaurant堂食、cart购物车、delivery配送、flight航旅、apartment公寓、lighting照明、bookkeeping账务服务、red-envelope红包、reading阅读订阅、camera相机、experiment体检化验、trophy运动赛事；无法精确匹配时再使用 folder其他支出或 folder-file待归类"

function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

function inferDate(text, today) {
  const explicit = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/)
  if (explicit) {
    return {
      value: `${explicit[1]}-${String(explicit[2]).padStart(2, "0")}-${String(explicit[3]).padStart(2, "0")}`,
      matched: explicit[0],
    }
  }
  const base = new Date(`${today}T00:00:00Z`)
  if (text.includes("昨天")) base.setUTCDate(base.getUTCDate() - 1)
  if (text.includes("前天")) base.setUTCDate(base.getUTCDate() - 2)
  return { value: formatDate(base), matched: "" }
}

function matchRule(text) {
  for (const rule of RULES) {
    const keyword = rule.keywords.find((value) => text.includes(value))
    if (keyword) return { ...rule, keyword }
  }
  return { keyword: "", category1: "其他", category2: "待分类" }
}

function cleanItem(segment, rule) {
  if (rule.keyword)
    return rule.keyword === "早餐"
      ? "早饭"
      : rule.keyword === "午餐"
        ? "午饭"
        : rule.keyword
  let item = segment
    .replace(/今天|昨天|前天|早上|上午|中午|下午|晚上|刚刚/g, "")
    .replace(/^.*?买/, "")
    .replace(
      /(?:一共|总共)?(?:花了|花|用了|消费了|消费|支出|付款|付了|交了)$/g,
      "",
    )
    .replace(/(?:吃了|喝了|吃|喝)$/g, "")
    .replace(/^给|^交|^付/, "")
    .replace(/配(?:早|午|晚)饭吃?$/, "")
    .replace(/[的了吧啊呀\s]/g, "")
    .trim()
  if (!item) item = "待确认项目"
  return item.slice(-18)
}

export function parseLocally(text, today = formatDate(new Date())) {
  const date = inferDate(text, today)
  const withoutDate = text.replace(date.matched, "")
  const records = []
  const amountPattern =
    /([^，,。；;\n]*?)(\d+(?:\.\d{1,2})?)(?:\s*(?:元|块|块钱))?/g
  let match
  while ((match = amountPattern.exec(withoutDate)) !== null) {
    const segment = match[1].trim()
    if (!segment) continue
    const rule = matchRule(segment)
    const income = /收入|工资|到账|赚了|报销/.test(segment)
    records.push({
      date: date.value,
      amount: Number(match[2]),
      direction: income ? "income" : "expense",
      item: cleanItem(segment, rule),
      category1: income ? "收入" : rule.category1,
      category2: income ? "其他收入" : rule.category2,
      note: "",
      confidence: rule.keyword ? 0.92 : 0.58,
    })
  }
  if (!records.length)
    throw new Error("没有识别到金额，请换一种说法，例如：今天午饭 18.5 元")
  return records
}

const toolResult = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  details: {},
})
const CONVERSATION_ID = /^[a-zA-Z0-9_-]{8,80}$/

function assertConversationId(value) {
  const id = String(value || "").trim()
  if (!CONVERSATION_ID.test(id))
    throw new Error("会话标识无效，请新建对话后重试")
  return id
}

const pendingRecordKey = (record) =>
  [
    record?.date,
    Math.abs(Number(record?.amount) || 0),
    record?.direction,
    record?.item,
    record?.category1,
    record?.category2,
    [...(record?.tagNames || [])].sort().join(","),
  ].join("|")

export function pendingRecordMatches(record, params) {
  const proposalType = String(params.proposalType ?? "").trim()
  const hasProposalType = proposalType.length > 0
  const hasId = Number.isFinite(Number(params.id))
  const item = String(params.item ?? "").trim()
  const hasItem = item.length > 0
  const hasAmount = Number.isFinite(Number(params.amount))
  const date = String(params.date ?? "").trim()
  const hasDate = date.length > 0
  if (hasId) {
    if (record?.id === undefined || Number(record.id) !== Number(params.id))
      return false
  }
  if (hasProposalType && String(record?.type || "") !== proposalType)
    return false
  if (hasItem && !String(record?.item || "").includes(item)) return false
  if (
    hasAmount &&
    Math.abs(Math.abs(Number(record?.amount)) - Number(params.amount)) > 0.001
  )
    return false
  if (hasDate && record?.date !== date) return false
  return hasId || hasItem || hasAmount || hasDate || hasProposalType
}

async function createLedgerAgent({
  ledger,
  dashboard,
  today,
  piConfig,
  direct = false,
}) {
  const context = { proposals: [], pending: [], removed: [], touched: false }
  const {
    createAgentSession,
    DefaultResourceLoader,
    defineTool,
    getAgentDir,
    ModelRuntime,
    SessionManager,
  } = await import("@earendil-works/pi-coding-agent")
  const stageProposal = (proposal, matches, overrideUserAction = false) => {
    context.touched = true
    if (
      !overrideUserAction &&
      (context.removed.some(matches) ||
        context.pending.some((entry) => matches(entry) && entry._humanEdited))
    )
      return toolResult({
        proposed: false,
        protected: true,
        message:
          "该操作已被用户移除或人工调整，未收到明确恢复要求，不能重新加入",
      })
    const existing = context.pending.findIndex(matches)
    if (existing >= 0) context.pending[existing] = proposal
    else context.pending.push(proposal)
    if (!direct) context.proposals.push(proposal)
    return toolResult({
      proposed: !direct,
      updated: direct,
      message: direct ? "操作将在本轮立即执行" : "操作已进入待确认区",
    })
  }
  const customTools = [
    defineTool({
      name: "ledger_search_transactions",
      label: "搜索账目",
      description:
        "按关键词、日期区间、金额或分类搜索账目，返回按日期倒序排列的候选记录及编号。用于定位用户提到的某一笔或某几笔账目；条件可以组合使用。",
      parameters: Type.Object({
        keyword: Type.Optional(
          Type.String({ description: "匹配项目、备注或分类的关键词" }),
        ),
        dateFrom: Type.Optional(
          Type.String({ description: "起始日期，YYYY-MM-DD，含当天" }),
        ),
        dateTo: Type.Optional(
          Type.String({ description: "结束日期，YYYY-MM-DD，含当天" }),
        ),
        minAmount: Type.Optional(
          Type.Number({ minimum: 0, description: "金额下限，按绝对值比较" }),
        ),
        maxAmount: Type.Optional(
          Type.Number({ minimum: 0, description: "金额上限，按绝对值比较" }),
        ),
        category1: Type.Optional(Type.String()),
        category2: Type.Optional(Type.String()),
        direction: Type.Optional(
          Type.Union([Type.Literal("expense"), Type.Literal("income")]),
        ),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
      }),
      execute: async (_id, params) => {
        const validDate = (value) =>
          /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
        const from = validDate(params.dateFrom) ? params.dateFrom : ""
        const to = validDate(params.dateTo) ? params.dateTo : ""
        const minimum = Number.isFinite(params.minAmount)
          ? params.minAmount
          : null
        const maximum = Number.isFinite(params.maxAmount)
          ? params.maxAmount
          : null
        if (minimum !== null && maximum !== null && minimum > maximum)
          throw new Error("金额下限不能大于金额上限")
        const records = await ledger.listTransactions(500)
        const keyword = String(params.keyword || "")
          .trim()
          .toLowerCase()
        const category1 = String(params.category1 || "").trim()
        const category2 = String(params.category2 || "").trim()
        const filtered = records.filter((record) => {
          const amount = Math.abs(Number(record.amount))
          const haystack = [
            record.item,
            record.note,
            record.category1,
            record.category2,
            ...(record.tags || []).map((tag) => tag.name),
          ]
            .join(" ")
            .toLowerCase()
          return (
            (!keyword || haystack.includes(keyword)) &&
            (!from || record.date >= from) &&
            (!to || record.date <= to) &&
            (minimum === null || amount >= minimum) &&
            (maximum === null || amount <= maximum) &&
            (!category1 || record.category1 === category1) &&
            (!category2 || record.category2 === category2) &&
            (!params.direction ||
              (params.direction === "expense"
                ? record.amount < 0
                : record.amount > 0))
          )
        })
        const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100)
        return toolResult({
          total: filtered.length,
          records: filtered.slice(0, limit),
        })
      },
    }),
    defineTool({
      name: "ledger_get_transaction",
      label: "读取单笔账目",
      description:
        "按账目编号读取一笔账目的完整最新信息。修改或删除前必须调用，用于确认编号与账目内容对应。",
      parameters: Type.Object({
        id: Type.Number({ minimum: 1, description: "账目编号" }),
      }),
      execute: async (_id, params) => {
        const record = await ledger.get(params.id)
        return toolResult(
          record
            ? { found: true, record }
            : { found: false, error: "账目不存在" },
        )
      },
    }),
    defineTool({
      name: "ledger_list_transactions",
      label: "查询账目",
      description:
        "按日期倒序查询最近的账目；用于回答账目内容或定位待修改、删除记录的编号。",
      parameters: Type.Object({
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
      }),
      execute: async (_id, params) =>
        toolResult(await ledger.listTransactions(params.limit || 30)),
    }),
    defineTool({
      name: "ledger_get_summary",
      label: "查询支出汇总",
      description: "查询指定锚点日期对应的日、周、月、年总支出和分类占比。",
      parameters: Type.Object({
        anchor: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
      }),
      execute: async (_id, params) =>
        toolResult(await dashboard(params.anchor)),
    }),
    defineTool({
      name: "ledger_list_dictionaries",
      label: "查询分类与账户字典",
      description:
        "查询已有项目、一级/二级分类、启用中的付款账户（含可用额度）和标签。新增账目应优先精确复用分类和标签；指定付款账户时使用真实 accountId。贷款账户不会出现在字典里，放款和还款请先查询资产负债。",
      parameters: Type.Object({}),
      execute: async () => toolResult(await ledger.dictionaries()),
    }),
    defineTool({
      name: "ledger_get_finance_overview",
      label: "查询资产与负债",
      description:
        "查询账户编号、可用额度、总资产、总负债、净资产和近期资金移动（转账、放款、还款与额度调整）。涉及账户、转账、贷款放款、信用还款、额度校准或撤销资金移动时先调用。",
      parameters: Type.Object({}),
      execute: async () => toolResult(await ledger.financeOverview()),
    }),
    defineTool({
      name: "ledger_get_tag_overview",
      label: "查询标签概览",
      description:
        "查询指定月份的全部标签、启停状态、关联账目数和标签消费金额。管理标签或按标签分析消费时先调用。",
      parameters: Type.Object({
        month: Type.Optional(Type.String({ description: "YYYY-MM" })),
      }),
      execute: async (_id, params) =>
        toolResult(await ledger.tagOverview(params.month)),
    }),
    defineTool({
      name: "ledger_get_tag_analytics",
      label: "查询标签消费",
      description:
        "按真实标签编号查询指定月份的消费总额、平均每笔、消费日期、分类去向和相关账目。",
      parameters: Type.Object({
        tagId: Type.String(),
        month: Type.Optional(Type.String({ description: "YYYY-MM" })),
      }),
      execute: async (_id, params) =>
        toolResult(await ledger.tagAnalytics(params.tagId, params.month)),
    }),
    defineTool({
      name: "ledger_propose_account_create",
      label: "建议新增账户",
      description:
        "新增现金、银行卡、电子钱包、信用账户或贷款账户。openingBalance 填写当前可用额度；贷款账户期初一般为 0，放款请再用转账从贷款账户转到银行卡。",
      parameters: Type.Object({
        name: Type.String(),
        type: Type.Union([
          Type.Literal("cash"),
          Type.Literal("bank"),
          Type.Literal("ewallet"),
          Type.Literal("credit"),
          Type.Literal("loan"),
        ]),
        openingBalance: Type.Optional(Type.Number({ minimum: 0 })),
        balanceDate: Type.Optional(
          Type.String({ description: "YYYY-MM-DD，余额起算日" }),
        ),
        isDefault: Type.Optional(Type.Boolean()),
        overrideUserAction: Type.Optional(Type.Boolean()),
      }),
      execute: async (_id, params) => {
        const { overrideUserAction, ...account } = params
        const proposal = { type: "account-create", account }
        return stageProposal(
          proposal,
          (entry) =>
            entry.type === "account-create" &&
            entry.account?.name === params.name,
          overrideUserAction,
        )
      },
    }),
    defineTool({
      name: "ledger_propose_tag_create",
      label: "建议新增标签",
      description:
        "新增可长期复用的消费标签，用于场景、人物或目的，例如人情请客、朋友聚会。不要创建与一级/二级消费分类重复的标签。",
      parameters: Type.Object({
        name: Type.String(),
        color: Type.Optional(Type.String({ description: "六位十六进制颜色" })),
        overrideUserAction: Type.Optional(Type.Boolean()),
      }),
      execute: async (_id, params) => {
        const { overrideUserAction, ...tag } = params
        const proposal = { type: "tag-create", tag }
        return stageProposal(
          proposal,
          (entry) =>
            entry.type === "tag-create" && entry.tag?.name === params.name,
          overrideUserAction,
        )
      },
    }),
    defineTool({
      name: "ledger_propose_tag_update",
      label: "建议修改标签",
      description:
        "修改已有标签的名称、颜色或启用状态。必须先查询标签概览并使用真实标签编号。",
      parameters: Type.Object({
        tagId: Type.String(),
        name: Type.Optional(Type.String()),
        color: Type.Optional(Type.String()),
        enabled: Type.Optional(Type.Boolean()),
        overrideUserAction: Type.Optional(Type.Boolean()),
      }),
      execute: async (_id, params) => {
        const overview = await ledger.tagOverview()
        const current = overview.tags.find((tag) => tag.id === params.tagId)
        if (!current) throw new Error("标签不存在，请重新查询标签字典")
        const { tagId, overrideUserAction, ...changes } = params
        if (!Object.keys(changes).length)
          throw new Error("没有需要修改的标签信息")
        const proposal = {
          type: "tag-update",
          tagId,
          changes,
          display: { tagName: current.name },
        }
        return stageProposal(
          proposal,
          (entry) => entry.type === "tag-update" && entry.tagId === tagId,
          overrideUserAction,
        )
      },
    }),
    defineTool({
      name: "ledger_propose_tag_delete",
      label: "建议删除标签",
      description:
        "永久删除已有标签并从历史账目解除关联；账目本身不会删除。必须先查询标签概览并使用真实标签编号。",
      parameters: Type.Object({
        tagId: Type.String(),
        overrideUserAction: Type.Optional(Type.Boolean()),
      }),
      execute: async (_id, params) => {
        const overview = await ledger.tagOverview()
        const current = overview.tags.find((tag) => tag.id === params.tagId)
        if (!current) throw new Error("标签不存在，请重新查询标签字典")
        const proposal = {
          type: "tag-delete",
          tagId: params.tagId,
          display: { tagName: current.name },
        }
        return stageProposal(
          proposal,
          (entry) =>
            entry.type === "tag-delete" && entry.tagId === params.tagId,
          params.overrideUserAction,
        )
      },
    }),
    defineTool({
      name: "ledger_propose_account_update",
      label: "建议修改账户",
      description:
        "修改已有账户的名称、期初可用额度、默认付款状态或启用状态。必须先查询资产与负债并使用真实账户编号。后来发生的提额请用校准，不要改期初。",
      parameters: Type.Object({
        accountId: Type.String(),
        name: Type.Optional(Type.String()),
        openingBalance: Type.Optional(Type.Number({ minimum: 0 })),
        isDefault: Type.Optional(Type.Boolean()),
        enabled: Type.Optional(Type.Boolean()),
        overrideUserAction: Type.Optional(Type.Boolean()),
      }),
      execute: async (_id, params) => {
        const finance = await ledger.financeOverview()
        const account = finance.accounts.find(
          (entry) => entry.id === params.accountId,
        )
        if (!account) throw new Error("账户不存在，请重新查询账户列表")
        const { accountId, overrideUserAction, ...changes } = params
        if (!Object.keys(changes).length)
          throw new Error("没有需要修改的账户信息")
        const resultingDefault = changes.isDefault ?? account.isDefault
        const resultingEnabled = changes.enabled ?? account.enabled
        if (resultingDefault && !resultingEnabled)
          throw new Error("默认账户必须保持启用，请先设置其他默认账户")
        const proposal = {
          type: "account-update",
          accountId,
          changes,
          display: { accountName: account.name },
        }
        return stageProposal(
          proposal,
          (entry) =>
            entry.type === "account-update" &&
            entry.accountId === params.accountId,
          overrideUserAction,
        )
      },
    }),
    defineTool({
      name: "ledger_propose_transfer",
      label: "建议账户转账",
      description:
        "在两个已有启用账户之间移动资金，包括贷款放到银行卡、用银行卡还花呗。转账不会计入收入或支出。必须先查询资产与负债并使用真实账户编号。",
      parameters: Type.Object({
        date: Type.String({ description: "YYYY-MM-DD" }),
        amount: Type.Number({ minimum: 0.01 }),
        fromAccountId: Type.String(),
        toAccountId: Type.String(),
        note: Type.Optional(Type.String()),
        overrideUserAction: Type.Optional(Type.Boolean()),
      }),
      execute: async (_id, params) => {
        const { overrideUserAction, ...transfer } = params
        const finance = await ledger.financeOverview()
        const from = finance.accounts.find(
          (account) => account.id === params.fromAccountId,
        )
        const to = finance.accounts.find(
          (account) => account.id === params.toAccountId,
        )
        if (!from || !to) throw new Error("转账账户不存在，请重新查询账户列表")
        if (!from.enabled || !to.enabled)
          throw new Error("停用账户不能继续转账")
        const proposal = {
          type: "transfer",
          transfer: { ...transfer, kind: "transfer" },
          display: {
            fromAccountName: from?.name || params.fromAccountId,
            toAccountName: to?.name || params.toAccountId,
          },
        }
        return stageProposal(
          proposal,
          (entry) =>
            entry.type === "transfer" &&
            entry.transfer?.date === params.date &&
            entry.transfer?.fromAccountId === params.fromAccountId &&
            entry.transfer?.toAccountId === params.toAccountId &&
            Number(entry.transfer?.amount) === Number(params.amount),
          overrideUserAction,
        )
      },
    }),
    defineTool({
      name: "ledger_propose_account_reconcile",
      label: "建议校准账户额度",
      description:
        "按现金、银行卡、电子钱包、信用或贷款账户的实际可用额度校准。提额、降额和对账都走这里，把 balance 改成目标可用额度。差额不计入收入或支出。必须先查询资产与负债并使用真实、启用中的账户编号。",
      parameters: Type.Object({
        accountId: Type.String(),
        balance: Type.Number(),
        note: Type.Optional(Type.String()),
        overrideUserAction: Type.Optional(Type.Boolean()),
      }),
      execute: async (_id, params) => {
        const finance = await ledger.financeOverview()
        const account = finance.accounts.find(
          (row) => row.id === params.accountId,
        )
        if (!account) throw new Error("账户不存在，请重新查询账户列表")
        if (!account.enabled) throw new Error("停用账户不能校准余额")
        const { accountId, overrideUserAction, ...reconcile } = params
        return stageProposal(
          {
            type: "account-reconcile",
            accountId,
            reconcile,
            display: {
              accountName: account.name,
              currentBalance: account.balance,
            },
          },
          (entry) =>
            entry.type === "account-reconcile" && entry.accountId === accountId,
          overrideUserAction,
        )
      },
    }),
    defineTool({
      name: "ledger_propose_account_delete",
      label: "建议删除未使用账户",
      description:
        "永久删除零余额且没有账单、转账、还款或校准记录的非默认账户；有历史的账户只能停用。必须先查询资产与负债。",
      parameters: Type.Object({
        accountId: Type.String(),
        overrideUserAction: Type.Optional(Type.Boolean()),
      }),
      execute: async (_id, params) => {
        const finance = await ledger.financeOverview()
        const account = finance.accounts.find(
          (row) => row.id === params.accountId,
        )
        if (!account) throw new Error("账户不存在，请重新查询账户列表")
        return stageProposal(
          {
            type: "account-delete",
            accountId: params.accountId,
            display: { accountName: account.name, balance: account.balance },
          },
          (entry) =>
            entry.type === "account-delete" &&
            entry.accountId === params.accountId,
          params.overrideUserAction,
        )
      },
    }),
    defineTool({
      name: "ledger_propose_transfer_reverse",
      label: "建议撤销账户转账",
      description:
        "撤销一笔账户转账并恢复双方额度。使用资产负债概览中最近资金移动里 kind 不是 adjustment 的真实编号。额度调整请用 ledger_propose_adjustment_reverse。",
      parameters: Type.Object({
        transferId: Type.String(),
        overrideUserAction: Type.Optional(Type.Boolean()),
      }),
      execute: async (_id, params) => {
        const finance = await ledger.financeOverview()
        const transfer = finance.recentTransfers.find(
          (row) => row.id === params.transferId,
        )
        if (!transfer) throw new Error("资金移动不存在或不在最近记录中")
        if (transfer.kind === "adjustment")
          throw new Error(
            "这是额度调整，请使用 ledger_propose_adjustment_reverse 撤销",
          )
        if (!transfer.reversible)
          throw new Error("资金移动不存在或不在最近记录中")
        return stageProposal(
          {
            type: "transfer-reverse",
            transferId: params.transferId,
            display: {
              route: `${transfer.fromAccountName} → ${transfer.toAccountName}`,
              amount: transfer.amount,
            },
          },
          (entry) =>
            entry.type === "transfer-reverse" &&
            entry.transferId === params.transferId,
          params.overrideUserAction,
        )
      },
    }),
    defineTool({
      name: "ledger_propose_adjustment_reverse",
      label: "建议撤销额度调整",
      description:
        "撤销一笔额度校准/提额/降额记录并恢复账户可用额度。差额不计入收入或支出。使用资产负债概览中 kind 为 adjustment 的真实编号。普通转账请用 ledger_propose_transfer_reverse。",
      parameters: Type.Object({
        adjustmentId: Type.String(),
        overrideUserAction: Type.Optional(Type.Boolean()),
      }),
      execute: async (_id, params) => {
        const finance = await ledger.financeOverview()
        const adjustment = finance.recentTransfers.find(
          (row) => row.id === params.adjustmentId,
        )
        if (!adjustment) throw new Error("额度调整不存在或不在最近记录中")
        if (adjustment.kind !== "adjustment")
          throw new Error(
            "这不是额度调整，撤销转账请使用 ledger_propose_transfer_reverse",
          )
        return stageProposal(
          {
            type: "adjustment-reverse",
            adjustmentId: params.adjustmentId,
            display: {
              accountName: adjustment.fromAccountName,
              amount: adjustment.amount,
              note: adjustment.note,
            },
          },
          (entry) =>
            entry.type === "adjustment-reverse" &&
            entry.adjustmentId === params.adjustmentId,
          params.overrideUserAction,
        )
      },
    }),
    defineTool({
      name: "ledger_propose_repayment",
      label: "建议记录还款",
      description:
        "用资产或信用账户偿还信用/贷款账户本金，并可选记录利息和手续费支出。本金走转账不计入支出；利息和手续费计入支出。必须先查询资产与负债并使用真实账户编号。贷款放款请用转账（贷款账户 → 银行卡），不要用本工具。",
      parameters: Type.Object({
        date: Type.String({ description: "YYYY-MM-DD" }),
        fromAccountId: Type.String({ description: "付款账户编号" }),
        toAccountId: Type.String({ description: "信用或贷款账户编号" }),
        principal: Type.Number({ minimum: 0.01 }),
        interest: Type.Optional(Type.Number({ minimum: 0 })),
        fee: Type.Optional(Type.Number({ minimum: 0 })),
        note: Type.Optional(Type.String()),
        overrideUserAction: Type.Optional(Type.Boolean()),
      }),
      execute: async (_id, params) => {
        const { overrideUserAction, ...repayment } = params
        const finance = await ledger.financeOverview()
        const from = finance.accounts.find(
          (account) => account.id === params.fromAccountId,
        )
        const to = finance.accounts.find(
          (account) => account.id === params.toAccountId,
        )
        if (!from || !from.enabled || from.type === "loan")
          throw new Error("请选择启用中的资产或信用账户支付本金")
        if (!to || !to.enabled || !to.isLiability)
          throw new Error("收款账户必须是启用中的信用账户或贷款账户")
        const proposal = {
          type: "repayment",
          repayment,
          display: {
            fromAccountName: from.name,
            toAccountName: to.name,
          },
        }
        return stageProposal(
          proposal,
          (entry) =>
            entry.type === "repayment" &&
            entry.repayment?.date === params.date &&
            entry.repayment?.fromAccountId === params.fromAccountId &&
            entry.repayment?.toAccountId === params.toAccountId &&
            Number(entry.repayment?.principal) === Number(params.principal),
          overrideUserAction,
        )
      },
    }),
    defineTool({
      name: "ledger_propose_category_icon_update",
      label: "建议修改分类图标",
      description: `修改已有分类的图标。省略 category2 时修改整个一级分类的图标；提供 category2 时只修改该二级分类图标。仅在用户明确要求修改已有图标时调用，不得在普通自动记账时改写已有分类图标。${CATEGORY_ICON_GUIDE}`,
      parameters: Type.Object({
        category1: Type.String({ description: "已有一级分类名称" }),
        category2: Type.Optional(
          Type.String({ description: "已有二级分类名称；省略则修改一级图标" }),
        ),
        icon: CATEGORY_ICON_TYPE,
      }),
      execute: async (_id, params) => {
        const dictionaries = await ledger.dictionaries()
        const exists = dictionaries.categories.some(
          (row) =>
            row.category1 === params.category1 &&
            (!params.category2 || row.category2 === params.category2),
        )
        if (!exists)
          return toolResult({
            proposed: false,
            error: params.category2
              ? `分类“${params.category1} / ${params.category2}”不存在`
              : `一级分类“${params.category1}”不存在`,
          })
        const proposal = {
          type: "category-icon",
          category1: params.category1,
          ...(params.category2 ? { category2: params.category2 } : {}),
          icon: params.icon,
        }
        context.touched = true
        const existing = context.pending.findIndex(
          (entry) =>
            entry.type === "category-icon" &&
            entry.category1 === proposal.category1 &&
            String(entry.category2 || "") === String(proposal.category2 || ""),
        )
        if (existing >= 0) context.pending[existing] = proposal
        else context.pending.push(proposal)
        if (!direct) context.proposals.push(proposal)
        return toolResult({
          proposed: !direct,
          updated: direct,
          category1: proposal.category1,
          category2: proposal.category2,
          icon: proposal.icon,
          message: direct ? "分类图标将立即更新" : "分类图标修改已进入待确认区",
        })
      },
    }),
    defineTool({
      name: "ledger_propose_create",
      label: "建议新增账目",
      description:
        "生成一项或多项新增建议；此工具只进入待确认区，不会直接写数据库。系统会保护用户在界面中人工修改或移除的内容；只有当前这条用户消息明确要求恢复或覆盖时，才可设置 overrideUserAction。",
      parameters: Type.Object({
        records: Type.Array(
          Type.Object({
            date: Type.String(),
            amount: Type.Number({ minimum: 0.01 }),
            direction: Type.Union([
              Type.Literal("expense"),
              Type.Literal("income"),
            ]),
            item: Type.String(),
            category1: Type.String(),
            category2: Type.String(),
            primaryIcon: Type.Optional(CATEGORY_ICON_TYPE),
            secondaryIcon: Type.Optional(CATEGORY_ICON_TYPE),
            note: Type.Optional(Type.String()),
            accountId: Type.Optional(Type.String()),
            tagNames: Type.Optional(Type.Array(Type.String(), { maxItems: 8 })),
          }),
          { minItems: 1 },
        ),
        overrideUserAction: Type.Optional(
          Type.Boolean({
            description:
              "仅当用户在当前消息中明确要求恢复已移除记录或覆盖人工微调时设为 true",
          }),
        ),
      }),
      execute: async (_id, params) => {
        const existingKeys = new Set(
          context.pending
            .filter((entry) => entry.type === "create")
            .flatMap((entry) => (entry.records || []).map(pendingRecordKey)),
        )
        const protectedOriginalKeys = new Set(
          context.pending
            .filter((entry) => entry.type === "create" && entry._humanEdited)
            .flatMap((entry) =>
              (entry._originalRecords || []).map(pendingRecordKey),
            ),
        )
        const removedKeys = new Set(
          context.removed
            .filter((entry) => entry?.type === "create")
            .flatMap((entry) => (entry.records || []).map(pendingRecordKey)),
        )
        let protectedCount = 0
        const records = (params.records || []).filter((record) => {
          const key = pendingRecordKey(record)
          if (existingKeys.has(key)) return false
          if (
            !params.overrideUserAction &&
            (protectedOriginalKeys.has(key) || removedKeys.has(key))
          ) {
            protectedCount += 1
            return false
          }
          return true
        })
        if (direct) {
          context.touched = true
          if (records.length)
            context.pending.push({
              type: "create",
              records,
              _direct: true,
            })
          return toolResult({
            created: true,
            count: records.length,
            message: `已写入账本 ${records.length} 笔账目`,
          })
        }
        const proposal = { type: "create", records }
        context.touched = true
        if (records.length) context.proposals.push(proposal)
        if (records.length) context.pending.push(proposal)
        return toolResult({
          proposed: records.length > 0,
          count: records.length,
          protected: protectedCount,
          message: records.length
            ? "已进入待确认区，尚未写入数据库"
            : protectedCount
              ? "匹配记录已由用户人工微调或移除，未收到明确恢复要求，未重新加入"
              : "相同记录已在待确认区，无需重复添加",
        })
      },
    }),
    defineTool({
      name: "ledger_propose_update",
      label: "建议修改账目",
      description:
        "按账目编号生成修改建议；此工具只进入待确认区。修改前先查询确认编号。用户在界面中人工微调或移除的同一账目默认受保护，只有当前消息明确要求覆盖或恢复时才可设置 overrideUserAction。",
      parameters: Type.Object({
        id: Type.Number({ minimum: 1 }),
        changes: Type.Object({
          date: Type.Optional(Type.String()),
          amount: Type.Optional(Type.Number({ minimum: 0.01 })),
          direction: Type.Optional(
            Type.Union([Type.Literal("expense"), Type.Literal("income")]),
          ),
          item: Type.Optional(Type.String()),
          category1: Type.Optional(Type.String()),
          category2: Type.Optional(Type.String()),
          note: Type.Optional(Type.String()),
          accountId: Type.Optional(Type.String()),
          tagNames: Type.Optional(Type.Array(Type.String(), { maxItems: 8 })),
        }),
        overrideUserAction: Type.Optional(
          Type.Boolean({
            description:
              "仅当用户在当前消息中明确要求覆盖人工微调或恢复已移除操作时设为 true",
          }),
        ),
      }),
      execute: async (_id, params) => {
        const current = await ledger.get(params.id)
        if (!current)
          return toolResult({ proposed: false, error: "账目不存在" })
        const protectedByUser = context.pending.some(
          (entry) =>
            Number(entry?.id) === Number(params.id) && entry._humanEdited,
        )
        const removedByUser = context.removed.some(
          (entry) => Number(entry?.id) === Number(params.id),
        )
        if (
          !direct &&
          !params.overrideUserAction &&
          (protectedByUser || removedByUser)
        )
          return toolResult({
            proposed: false,
            protected: true,
            error: protectedByUser
              ? "该待确认账目已由用户人工微调，必须保留当前内容"
              : "该待确认账目已由用户移除，不得自行重新加入",
          })
        if (direct) {
          context.touched = true
          context.pending.push({
            type: "update",
            id: params.id,
            current,
            changes: params.changes,
            _direct: true,
          })
          return toolResult({
            updated: true,
            id: params.id,
            message: "已修改账目",
          })
        }
        const proposal = {
          type: "update",
          id: params.id,
          current,
          changes: params.changes,
        }
        context.touched = true
        context.proposals.push(proposal)
        const existing = context.pending.findIndex(
          (entry) => entry.type === "update" && entry.id === params.id,
        )
        if (existing >= 0) context.pending[existing] = proposal
        else context.pending.push(proposal)
        return toolResult({
          proposed: true,
          current,
          changes: params.changes,
          message: "已进入待确认区",
        })
      },
    }),
    defineTool({
      name: "ledger_propose_delete",
      label: "建议删除账目",
      description:
        "按账目编号生成删除建议；此工具只进入待确认区。删除前先查询确认编号。用户在界面中人工微调或移除的同一账目默认受保护，只有当前消息明确要求覆盖或恢复时才可设置 overrideUserAction。",
      parameters: Type.Object({
        id: Type.Number({ minimum: 1 }),
        reason: Type.Optional(Type.String()),
        overrideUserAction: Type.Optional(
          Type.Boolean({
            description:
              "仅当用户在当前消息中明确要求覆盖人工微调或恢复已移除操作时设为 true",
          }),
        ),
      }),
      execute: async (_id, params) => {
        const current = await ledger.get(params.id)
        if (!current)
          return toolResult({ proposed: false, error: "账目不存在" })
        const protectedByUser = context.pending.some(
          (entry) =>
            Number(entry?.id) === Number(params.id) && entry._humanEdited,
        )
        const removedByUser = context.removed.some(
          (entry) => Number(entry?.id) === Number(params.id),
        )
        if (
          !direct &&
          !params.overrideUserAction &&
          (protectedByUser || removedByUser)
        )
          return toolResult({
            proposed: false,
            protected: true,
            error: protectedByUser
              ? "该待确认账目已由用户人工微调，不能自行改为删除"
              : "该待确认账目已由用户移除，不得自行重新加入",
          })
        if (direct) {
          context.touched = true
          context.pending.push({
            type: "delete",
            id: params.id,
            current,
            _direct: true,
          })
          return toolResult({
            deleted: true,
            id: params.id,
            message: "已删除账目",
          })
        }
        const proposal = {
          type: "delete",
          id: params.id,
          current,
          reason: params.reason || "",
        }
        context.touched = true
        context.proposals.push(proposal)
        const existing = context.pending.findIndex(
          (entry) => entry.type === "delete" && entry.id === params.id,
        )
        if (existing >= 0) context.pending[existing] = proposal
        else context.pending.push(proposal)
        return toolResult({
          proposed: true,
          current,
          message: "已进入待确认区",
        })
      },
    }),
    defineTool({
      name: "ledger_propose_discard",
      label: "移除待确认记录",
      description:
        "从待确认区中移除一笔或多笔待确认记录（尚未写入账本，仅撤消待确认建议，不修改已写入的账目）。当用户要求取消、忽略或替换某笔待确认记录时调用，可以按账目编号、项目名称、金额或日期匹配。人工微调项默认受保护，只有当前消息明确要求撤销人工微调时才可设置 overrideUserAction。",
      parameters: Type.Object({
        id: Type.Optional(
          Type.Number({
            minimum: 1,
            description: "账目编号，用于定位待确认的修改/删除记录",
          }),
        ),
        item: Type.Optional(
          Type.String({ description: "项目名称，模糊匹配要移除的记录" }),
        ),
        amount: Type.Optional(
          Type.Number({ minimum: 0, description: "金额，按绝对值匹配" }),
        ),
        date: Type.Optional(Type.String({ description: "日期，YYYY-MM-DD" })),
        proposalType: Type.Optional(
          Type.Union([
            Type.Literal("create"),
            Type.Literal("update"),
            Type.Literal("delete"),
            Type.Literal("category-icon"),
            Type.Literal("account-create"),
            Type.Literal("account-update"),
            Type.Literal("account-reconcile"),
            Type.Literal("account-delete"),
            Type.Literal("tag-create"),
            Type.Literal("tag-update"),
            Type.Literal("tag-delete"),
            Type.Literal("transfer"),
            Type.Literal("transfer-reverse"),
            Type.Literal("adjustment-reverse"),
            Type.Literal("repayment"),
          ]),
        ),
        overrideUserAction: Type.Optional(
          Type.Boolean({
            description:
              "仅当用户在当前消息中明确要求撤销其人工微调时设为 true",
          }),
        ),
      }),
      execute: async (_id, params) => {
        context.touched = true
        let removed = 0
        let protectedCount = 0
        const kept = []
        for (const entry of context.pending) {
          if (entry.type === "create") {
            const keptIndexes = []
            const removedRecords = []
            ;(entry.records || []).forEach((record, index) => {
              const matched = pendingRecordMatches(
                { ...record, type: "create" },
                params,
              )
              if (matched && entry._humanEdited && !params.overrideUserAction) {
                protectedCount += 1
                keptIndexes.push(index)
              } else if (matched) {
                removed += 1
                removedRecords.push(record)
              } else keptIndexes.push(index)
            })
            if (removedRecords.length)
              context.removed.push({ type: "create", records: removedRecords })
            if (keptIndexes.length)
              kept.push({
                ...entry,
                records: keptIndexes.map((index) => entry.records[index]),
                ...(Array.isArray(entry._originalRecords)
                  ? {
                      _originalRecords: keptIndexes.map(
                        (index) => entry._originalRecords[index],
                      ),
                    }
                  : {}),
              })
          } else {
            const financeValue =
              entry.transfer ||
              entry.repayment ||
              entry.account ||
              entry.tag ||
              entry.changes ||
              {}
            const matched = pendingRecordMatches(
              {
                ...entry.current,
                ...financeValue,
                id: entry.id,
                type: entry.type,
                item:
                  entry.current?.item ||
                  entry.account?.name ||
                  entry.tag?.name ||
                  entry.display?.tagName ||
                  entry.display?.accountName ||
                  entry.display?.toAccountName ||
                  entry.display?.route ||
                  "",
              },
              params,
            )
            if (matched && entry._humanEdited && !params.overrideUserAction) {
              protectedCount += 1
              kept.push(entry)
            } else if (matched) {
              removed += 1
              context.removed.push(entry)
            } else kept.push(entry)
          }
        }
        context.pending = kept
        return toolResult(
          removed > 0
            ? {
                discarded: true,
                count: removed,
                protected: protectedCount,
                message: `已从待确认区移除 ${removed} 条记录`,
              }
            : {
                discarded: false,
                count: 0,
                protected: protectedCount,
                message: protectedCount
                  ? "匹配项已由用户人工微调，未收到明确覆盖要求，已保留"
                  : "没有匹配到可移除的待确认记录",
              },
        )
      },
    }),
  ]
  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
    systemPromptOverride: () => {
      const mode = direct
        ? "这是快捷记账模式：用户希望立即把账目写入账本，无需任何确认；你调用 propose 工具时，账目会直接写入数据库。"
        : "这是连续多轮对话，你必须结合此前消息理解“它”“那笔”“刚才”等指代。"
      const confirmation = direct
        ? "只有 propose 工具成功返回后，你才能说已经记账、改账或删账成功；绝对不能虚构结果。"
        : "只有 propose 工具成功返回后，才能说已生成待确认操作或询问是否确认；绝对不能只在回答中虚构预览表。propose 工具不会直接写数据库，因此即使用户说“不要直接写入”，也仍应调用它。应用状态会提供当前待确认列表的完整快照，用户所说的第几笔以其中序号为准。标记为人工微调或用户已移除的内容具有最高优先级，不得自行覆盖或恢复；只有当前这条用户消息明确要求撤销、覆盖或恢复该操作时，才能把 overrideUserAction 设为 true。待确认区会跨轮保留。如果用户要取消、忽略或替换某笔待确认记录，必须先调用 ledger_propose_discard 移除旧记录，再调用对应 propose 工具生成新记录。"
      const closing = direct
        ? "回答简洁中文，直接说明已写入或已修改的账目内容（日期、项目、金额、分类）。"
        : "回答简洁中文，并提醒用户在界面的待确认区确认操作。"
      const custom = String(piConfig.customPrompt || "").trim()
      const customBlock = custom
        ? `用户补充要求如下，请在不违反上述记账规则、工具流程和安全约束的前提下遵守：\n${custom}`
        : ""
      return `你是“轻账”里的 AI 记账助手。今天是 ${today}。可见的思考过程和最终回答都必须使用简体中文；不要在思考过程里改用英文。${mode}所有账本事实必须通过工具查询。用户表达花钱、收入、记账或记录一笔时，必须先调用 ledger_list_dictionaries，再实际调用 ledger_propose_create；要求查找、定位或询问某笔账目时，调用 ledger_search_transactions；要求修改或删除时，先用 ledger_search_transactions 定位（用户已提供唯一编号时可省略），再必须调用 ledger_get_transaction 核实编号与最新内容，最后调用对应 propose 工具。用户明确要求修改分类图标时，先调用 ledger_list_dictionaries 确认分类和当前图标，再调用 ledger_propose_category_icon_update。标签用于记录分类之外的场景、人物或目的，例如人情请客、朋友聚会；记账时优先复用字典中的标签并在 tagNames 中填写，只有明确且可长期复用的语义才自动创建新标签，每笔最多 3 个，禁止创建与消费分类同义的标签。用户要求管理标签或查询标签消费时，先调用 ledger_get_tag_overview 获取真实标签编号与状态；需要具体消费信息时继续调用 ledger_get_tag_analytics，变更时调用对应 tag propose 工具。涉及账户余额、可用额度、账户资料、转账、贷款放款、信用还款、额度校准或撤销资金移动时，必须先调用 ledger_get_finance_overview 获取真实账户编号，再调用对应的 finance propose 工具。停用账户不可继续记账、转账、还款或校准。信用/贷款账户可自由转账；贷款放款用转账（贷款账户 → 银行卡），还款用 ledger_propose_repayment（本金转账 + 可选利息支出）。撤销转账用 ledger_propose_transfer_reverse；撤销额度调整用 ledger_propose_adjustment_reverse，不要把 adjustment 当成转账撤销。普通账户修改不能直接覆盖当前额度，实际额度不一致或提额时使用账户校准工具；期初填错才改 openingBalance。严禁把账户间转账、余额校准或偿还本金记为支出，只有利息和手续费属于支出。普通消费仍调用 ledger_propose_create；用户明确付款账户时，只能把字典中启用的真实 accountId 写入记录。${confirmation}读取操作可以直接回答。周以周一到周日计算。支出金额传正数并标记 expense。分类策略：优先精确复用字典中语义合适的“一级分类 + 二级分类”组合；已有分类必须沿用字典中的图标，不得因普通记账而修改。没有合适组合时，必须依据交易内容自主拟定清晰、具体的新一级分类和新二级分类，并在 ledger_propose_create 的记录中同时提供语义匹配的 primaryIcon 和 secondaryIcon；记账后系统会自动创建并设置图标。${CATEGORY_ICON_GUIDE}。除非交易内容确实无法判断或用户明确要求，否则禁止使用“其他/待分类”作为默认兜底。项目名称也应优先复用；没有时用交易内容创建合适的新项目。${closing}${customBlock ? `\n${customBlock}` : ""}`
    },
  })
  await loader.reload()
  const modelRuntime = await ModelRuntime.create({
    modelsPath: piConfig.modelsPath,
  })
  await modelRuntime.setRuntimeApiKey(piConfig.providerId, piConfig.apiKey)
  const model = modelRuntime.getModel(piConfig.providerId, piConfig.modelId)
  if (!model)
    throw new Error(`未找到模型 ${piConfig.providerId}/${piConfig.modelId}`)
  const { session } = await createAgentSession({
    model,
    modelRuntime,
    thinkingLevel: piConfig.thinkingEnabled
      ? piConfig.thinkingLevel === "default"
        ? undefined
        : piConfig.thinkingLevel
      : "off",
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    customTools,
    noTools: "builtin",
  })
  return {
    session,
    context,
    loader,
    modelRuntime,
    thinkingEnabled: Boolean(piConfig.thinkingEnabled),
  }
}

const CLAIMS_GENERATION =
  /已(?:为您|为你|帮你|为)?生成|已进入待确认区|已添加|已(?:新增|转账|还款|校准|调整)/
const RETRY_PROMPT = `系统检测到你上一轮回复声称已经生成待确认操作，但实际没有任何操作进入待确认区。请立即检查用户要求，并实际调用对应的 propose 工具来生成真实操作；普通账目使用 ledger_propose_create / update / delete，账户、转账、还款、额度调整使用对应 finance propose 工具。如果不需要变更，请直接说明，不要声称已生成。`
const DIRECT_CLAIMS_GENERATION =
  /已(?:写入|记录|记入|记账|修改|删除|保存|新增|转账|还款|校准|调整)/
const DIRECT_RETRY_PROMPT = `系统检测到你上一轮回复声称已经完成操作，但实际账本没有变化。请根据用户要求实际调用对应的账目或 finance propose 工具，再基于工具结果回答；如果不需要修改，请直接说明，不要声称已完成。`

const TOOL_LABELS = {
  ledger_search_transactions: "搜索账目",
  ledger_get_transaction: "读取单笔账目",
  ledger_list_transactions: "查询账目",
  ledger_get_summary: "查询支出汇总",
  ledger_list_dictionaries: "查询分类与账户字典",
  ledger_get_finance_overview: "查询资产与负债",
  ledger_get_tag_overview: "查询标签概览",
  ledger_get_tag_analytics: "查询标签消费",
  ledger_propose_account_create: "建议新增账户",
  ledger_propose_account_update: "建议修改账户",
  ledger_propose_account_reconcile: "建议校准账户额度",
  ledger_propose_account_delete: "建议删除账户",
  ledger_propose_tag_create: "建议新增标签",
  ledger_propose_tag_update: "建议修改标签",
  ledger_propose_tag_delete: "建议删除标签",
  ledger_propose_transfer: "建议账户转账",
  ledger_propose_transfer_reverse: "建议撤销账户转账",
  ledger_propose_adjustment_reverse: "建议撤销额度调整",
  ledger_propose_repayment: "建议记录还款",
  ledger_propose_category_icon_update: "建议修改分类图标",
  ledger_propose_create: "建议新增账目",
  ledger_propose_update: "建议修改账目",
  ledger_propose_delete: "建议删除账目",
  ledger_propose_discard: "移除待确认记录",
}

async function promptSession(conversation, prompt, onEvent, signal) {
  if (signal?.aborted) {
    const error = new Error("请求已取消")
    error.name = "AbortError"
    throw error
  }
  let delta = ""
  let thinking = ""
  const unsubscribe = conversation.session.subscribe((event) => {
    if (event.type === "message_update") {
      const update = event.assistantMessageEvent
      if (update?.type === "text_delta") {
        delta += update.delta
        onEvent?.({ type: "text", data: { delta: update.delta } })
      } else if (
        update?.type === "thinking_delta" &&
        conversation.thinkingEnabled
      ) {
        thinking += update.delta
        onEvent?.({ type: "thinking", data: { delta: update.delta } })
      }
    } else if (event.type === "tool_execution_start") {
      onEvent?.({
        type: "tool",
        data: {
          name: event.toolName,
          label: TOOL_LABELS[event.toolName] || event.toolName,
        },
      })
    } else if (event.type === "tool_execution_end") {
      onEvent?.({
        type: "tool_done",
        data: {
          name: event.toolName,
          label: TOOL_LABELS[event.toolName] || event.toolName,
          isError: Boolean(event.isError),
        },
      })
    }
  })
  const abort = () => void conversation.session.abort?.()
  if (signal?.aborted) abort()
  signal?.addEventListener("abort", abort, { once: true })
  try {
    await conversation.session.prompt(prompt)
  } finally {
    signal?.removeEventListener("abort", abort)
    unsubscribe()
  }
  if (signal?.aborted) {
    const error = new Error("请求已取消")
    error.name = "AbortError"
    throw error
  }
  const text = conversation.session.getLastAssistantText?.() || delta.trim()
  const lastAssistant = [...conversation.session.messages]
    .reverse()
    .find((entry) => entry.role === "assistant")
  if (!text && lastAssistant?.errorMessage)
    throw new Error(lastAssistant.errorMessage)
  if (!text)
    throw new Error("模型没有返回文本内容，请检查模型 ID、接口协议和 Base URL")
  return { text, thinking: thinking.trim() }
}

async function runAgentTurn(
  conversation,
  input,
  persistedPending = [],
  persistedRemoved = [],
  pendingNotice = "",
  onEvent,
  signal,
) {
  conversation.context.proposals = []
  conversation.context.pending = Array.isArray(persistedPending)
    ? structuredClone(persistedPending)
    : []
  conversation.context.removed = Array.isArray(persistedRemoved)
    ? structuredClone(persistedRemoved)
    : []
  conversation.context.touched = false
  const notice = conversation.pendingOutcome
  conversation.pendingOutcome = ""
  const restoredHistory =
    !conversation.historyRestored &&
    Array.isArray(conversation.persistedHistory) &&
    conversation.persistedHistory.length
      ? `[此前持久化的对话记录]\n${conversation.persistedHistory
          .slice(-30)
          .map(
            (entry) =>
              `${entry.role === "assistant" ? "助手" : "用户"}：${String(entry.content || "").slice(0, 2000)}`,
          )
          .join("\n")}\n[记录结束，请继续保持多轮上下文]\n\n`
      : ""
  conversation.historyRestored = true
  const applicationNotices = [notice, pendingNotice]
    .filter(Boolean)
    .join("\n\n")
  const prompt = `${restoredHistory}${applicationNotices ? `[应用状态：${applicationNotices}]\n\n` : ""}${input}`
  let response = await promptSession(conversation, prompt, onEvent, signal)
  let message = response.text
  const thinking = response.thinking ? [response.thinking] : []
  const claims = conversation.direct
    ? DIRECT_CLAIMS_GENERATION
    : CLAIMS_GENERATION
  const retryPrompt = conversation.direct ? DIRECT_RETRY_PROMPT : RETRY_PROMPT
  if (!conversation.context.touched && claims.test(message)) {
    onEvent?.({ type: "reset", data: { text: true, thinking: true } })
    thinking.length = 0
    response = await promptSession(conversation, retryPrompt, onEvent, signal)
    message = response.text
    if (response.thinking) thinking.push(response.thinking)
  }
  const failedClaim = !conversation.context.touched && claims.test(message)
  if (failedClaim) {
    message += `\n\n> ⚠️ 系统提示：回复声称已完成账目操作，但实际没有写入任何账目。可能是模型没有正确调用记账工具，请重试或换一种说法。`
  }
  return {
    mode: "tool-agent",
    message,
    thinking: thinking.join("\n\n"),
    proposals: conversation.context.pending,
    warning: failedClaim
      ? "回复声称已完成账目操作，但实际没有写入任何账目，请重试或换一种说法。"
      : "",
  }
}

function disposeConversation(conversation) {
  try {
    conversation.session?.dispose?.()
  } catch {}
  try {
    conversation.loader?.dispose?.()
  } catch {}
  try {
    conversation.modelRuntime?.dispose?.()
  } catch {}
}

export function createLedgerAiConversationManager({
  ledger,
  dashboard,
  getToday,
  getConfig,
  ttlMs = 30 * 60 * 1000,
  maxConversations = 24,
  direct = false,
}) {
  const conversations = new Map()

  function remove(id) {
    const conversation = conversations.get(id)
    if (!conversation) return false
    conversations.delete(id)
    disposeConversation(conversation)
    return true
  }

  function cleanup(now = Date.now()) {
    for (const [id, conversation] of conversations) {
      if (!conversation.busy && now - conversation.lastUsed > ttlMs) remove(id)
    }
    const idle = [...conversations.entries()]
      .filter(([, conversation]) => !conversation.busy)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    while (conversations.size >= maxConversations && idle.length)
      remove(idle.shift()[0])
  }

  /** @param {{ conversationId: unknown, text: unknown, history?: Array<{ role: string, content: string }>, pending?: any[], removed?: any[], pendingNotice?: string, onEvent?: (event: { type: string, data?: unknown }) => void, signal?: AbortSignal }} request */
  async function run({
    conversationId,
    text,
    history = [],
    pending = [],
    removed = [],
    pendingNotice = "",
    onEvent,
    signal,
  }) {
    const id = assertConversationId(conversationId)
    const input = String(text || "").trim()
    if (!input) throw new Error("请先输入一句话")
    cleanup()
    let conversation = conversations.get(id)
    try {
      if (conversation?.busy)
        throw new Error("这段对话正在处理上一条消息，请稍候")
      const piConfig = await getConfig()
      const configKey = JSON.stringify([
        piConfig.providerId,
        piConfig.modelId,
        piConfig.baseUrl,
        piConfig.apiType,
        piConfig.thinkingEnabled,
        piConfig.thinkingLevel,
        piConfig.customPrompt || "",
        piConfig.updatedAt,
      ])
      if (conversation?.configKey !== configKey) {
        remove(id)
        conversation = undefined
      }
      if (!conversation) {
        const agent = await createLedgerAgent({
          ledger,
          dashboard,
          today: getToday(),
          piConfig,
          direct,
        })
        conversation = {
          ...agent,
          configKey,
          direct,
          busy: false,
          lastUsed: Date.now(),
          pendingOutcome: "",
          persistedHistory: history,
          historyRestored: false,
        }
        conversations.set(id, conversation)
      }
      conversation.busy = true
      const result = await runAgentTurn(
        conversation,
        input,
        pending,
        removed,
        pendingNotice,
        onEvent,
        signal,
      )
      conversation.lastUsed = Date.now()
      return { ...result, conversationId: id, multiTurn: true }
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") throw error
      console.error("Ledger AI conversation failed:", error)
      throw new Error(
        error.message?.startsWith("AI 服务暂不可用")
          ? error.message
          : `AI 服务暂不可用：${error.message}`,
      )
    } finally {
      if (conversation) conversation.busy = false
    }
  }

  function notifyOutcome(conversationId, outcome, detail = "") {
    const id = String(conversationId || "").trim()
    const conversation = conversations.get(id)
    if (!conversation) return false
    conversation.pendingOutcome =
      outcome === "confirmed"
        ? `上一轮待确认的账目操作已由用户确认并成功执行。${detail}`
        : "上一轮待确认的账目操作已由用户取消，没有写入或修改账本。"
    conversation.lastUsed = Date.now()
    return true
  }

  function clear() {
    for (const id of [...conversations.keys()]) remove(id)
  }

  return {
    run,
    remove,
    notifyOutcome,
    clear,
    get size() {
      return conversations.size
    },
  }
}

export async function runPiLedgerCommand({
  text,
  ledger,
  dashboard,
  today,
  piConfig,
}) {
  const manager = createLedgerAiConversationManager({
    ledger,
    dashboard,
    getToday: () => today,
    getConfig: () => piConfig,
    maxConversations: 1,
  })
  try {
    return await manager.run({ conversationId: "single-turn", text })
  } finally {
    manager.clear()
  }
}

export async function runPiLedgerDirectCommand({
  text,
  ledger,
  dashboard,
  today,
  piConfig,
}) {
  const manager = createLedgerAiConversationManager({
    ledger,
    dashboard,
    getToday: () => today,
    getConfig: () => piConfig,
    maxConversations: 1,
    direct: true,
  })
  try {
    const result = await manager.run({
      conversationId: "single-turn-direct",
      text,
    })
    const execution = await ledger.executeAiOperations(result.proposals || [])
    return { ...result, execution }
  } finally {
    manager.clear()
  }
}
