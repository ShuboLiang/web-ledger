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
  ].join("|")

export function pendingRecordMatches(record, params) {
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
  if (hasItem && !String(record?.item || "").includes(item)) return false
  if (
    hasAmount &&
    Math.abs(Math.abs(Number(record?.amount)) - Number(params.amount)) > 0.001
  )
    return false
  if (hasDate && record?.date !== date) return false
  return hasId || hasItem || hasAmount || hasDate
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
      label: "查询分类字典",
      description:
        "查询已有项目和一级分类、二级分类组合，新增时应优先精确复用；若没有语义合适的组合，可以在新增账目建议中提供新的一级分类和二级分类，确认写入后会自动创建该分类。",
      parameters: Type.Object({}),
      execute: async () => toolResult(await ledger.dictionaries()),
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
            note: Type.Optional(Type.String()),
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
              const matched = pendingRecordMatches(record, params)
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
            const matched = pendingRecordMatches(
              { ...entry.current, id: entry.id },
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
      return `你是“轻账”里的 AI 记账助手。今天是 ${today}。${mode}所有账本事实必须通过工具查询。用户表达花钱、收入、记账或记录一笔时，必须先调用 ledger_list_dictionaries，再实际调用 ledger_propose_create；要求查找、定位或询问某笔账目时，调用 ledger_search_transactions；要求修改或删除时，先用 ledger_search_transactions 定位（用户已提供唯一编号时可省略），再必须调用 ledger_get_transaction 核实编号与最新内容，最后调用对应 propose 工具。${confirmation}读取操作可以直接回答。周以周一到周日计算。支出金额传正数并标记 expense。分类策略：优先精确复用字典中语义合适的“一级分类 + 二级分类”组合；没有合适组合时，必须依据交易内容自主拟定清晰、具体的新一级分类和新二级分类，并将其放进 ledger_propose_create 的记录中。记账后系统会自动创建该分类。除非交易内容确实无法判断或用户明确要求，否则禁止使用“其他/待分类”作为默认兜底。项目名称也应优先复用；没有时用交易内容创建合适的新项目。${closing}`
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

const CLAIMS_GENERATION = /已(?:为您|为你|帮你|为)?生成|已进入待确认区|已添加/
const RETRY_PROMPT = `系统检测到你上一轮回复声称已经生成了待确认账目，但实际没有任何记录进入待确认区（通常是只复述了内容而没有实际调用记账工具）。请立即检查：如果用户确实要求记账、改账或删账，你必须实际调用对应的 propose 工具（ledger_propose_create / ledger_propose_update / ledger_propose_delete）来生成真正的待确认记录，再基于工具真实返回的结果重新组织回答；如果并不需要生成账目，请直接说明，不要声称已生成。`
const DIRECT_CLAIMS_GENERATION = /已(?:写入|记录|记入|记账|修改|删除|保存)/
const DIRECT_RETRY_PROMPT = `系统检测到你上一轮回复声称已经写入或修改了账目，但实际没有任何账目发生变化（通常是只复述了内容而没有实际调用记账工具）。请立即检查：如果用户确实要求记账、改账或删账，你必须实际调用对应的 propose 工具（ledger_propose_create / ledger_propose_update / ledger_propose_delete）来写入账本，再基于工具真实返回的结果重新组织回答；如果并不需要修改账本，请直接说明，不要声称已写入。`

const TOOL_LABELS = {
  ledger_search_transactions: "搜索账目",
  ledger_get_transaction: "读取单笔账目",
  ledger_list_transactions: "查询账目",
  ledger_get_summary: "查询支出汇总",
  ledger_list_dictionaries: "查询分类字典",
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
