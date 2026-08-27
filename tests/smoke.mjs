import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PrismaClient } from "@prisma/client"

const here = path.dirname(fileURLToPath(import.meta.url))
if (existsSync(path.join(here, "..", ".env")))
  process.loadEnvFile(path.join(here, "..", ".env"))
const schema = `smoke_${Date.now()}`
const testUrl = new URL(process.env.DATABASE_URL)
testUrl.searchParams.set("schema", schema)
process.env.DATABASE_URL = testUrl.toString()
const testDataDir = mkdtempSync(path.join(tmpdir(), "qing-zhang-smoke-"))
let modelsPath = ""
process.env.NO_SEED = "1"
process.env.DATA_DIR = testDataDir
execFileSync(
  process.execPath,
  [
    path.join(here, "..", "node_modules", "prisma", "build", "index.js"),
    "migrate",
    "deploy",
  ],
  { cwd: path.join(here, ".."), env: process.env, stdio: "ignore" },
)
const { startServer } = await import("../dist/src/main.js")
const { parseLocally, pendingRecordMatches } = await import("../lib/ai.mjs")
const { app, server } = await startServer({ port: 0 })
const port = server.address().port
const base = `http://127.0.0.1:${port}`
let sessionCookie = ""
let lastSetCookie = ""

async function request(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...options.headers,
    },
  })
  const setCookie = response.headers.get("set-cookie")
  if (setCookie) {
    lastSetCookie = setCookie
    sessionCookie = setCookie.split(";", 1)[0]
  }
  const body = await response.json()
  assert.ok(response.ok, body.error || `HTTP ${response.status}`)
  return body
}

async function requestError(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...options.headers,
    },
  })
  const body = await response.json()
  assert.equal(response.ok, false, `Expected ${pathname} to fail`)
  return { status: response.status, body }
}

try {
  const health = await request("/api/health")
  assert.equal(health.ok, true)
  assert.match(health.database, /^postgresql:\/\//)
  const page = await (await fetch(base)).text()
  assert.match(page, /id="root"/)
  assert.match(page, /\/assets\//)
  assert.match(page, /rel="manifest" href="\/manifest\.webmanifest"/)
  assert.match(page, /src="\/registerSW\.js"/)

  const manifestResponse = await fetch(`${base}/manifest.webmanifest`)
  assert.match(
    manifestResponse.headers.get("content-type") || "",
    /^application\/manifest\+json/,
  )
  const manifest = await manifestResponse.json()
  assert.equal(manifest.name, "轻账 · 专业记账工作台")
  assert.equal(manifest.short_name, "轻账")
  assert.equal(manifest.display, "standalone")
  assert.equal(manifest.start_url, "/")
  assert.equal(manifest.scope, "/")
  const pngIcons = manifest.icons.filter((icon) => icon.type === "image/png")
  assert.ok(pngIcons.some((icon) => icon.sizes === "192x192"))
  assert.ok(pngIcons.some((icon) => icon.sizes === "512x512"))
  assert.ok(pngIcons.some((icon) => icon.purpose === "maskable"))
  for (const icon of pngIcons) {
    const iconResponse = await fetch(new URL(icon.src, base))
    assert.match(iconResponse.headers.get("content-type") || "", /^image\/png/)
    const signature = new Uint8Array(await iconResponse.arrayBuffer()).slice(
      0,
      8,
    )
    assert.deepEqual(Array.from(signature), [137, 80, 78, 71, 13, 10, 26, 10])
  }

  const appleIcon = page.match(
    /rel="apple-touch-icon" href="([^"]+\.png)"/,
  )?.[1]
  assert.ok(appleIcon)
  assert.equal(
    (await fetch(new URL(appleIcon, base))).headers.get("content-type"),
    "image/png",
  )

  const serviceWorkerResponse = await fetch(`${base}/sw.js`)
  assert.match(
    serviceWorkerResponse.headers.get("content-type") || "",
    /javascript/,
  )
  const serviceWorker = await serviceWorkerResponse.text()
  assert.match(serviceWorker, /precacheAndRoute/)
  assert.ok(serviceWorker.includes("denylist:[/^\\/api\\//]"))
  const dashboardPage = await (await fetch(`${base}/dashboard`)).text()
  assert.match(dashboardPage, /id="root"/)
  assert.equal((await requestError("/api/dashboard")).status, 401)
  const registered = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username: "smoke_user",
      displayName: "冒烟测试",
      password: "SmokePass123!",
    }),
  })
  assert.equal(registered.user.username, "smoke_user")
  modelsPath = path.join(testDataDir, `pi-models-${registered.user.id}.json`)
  assert.ok(sessionCookie.startsWith("qing_zhang_session="))
  assert.match(lastSetCookie, /Max-Age=315360000/i)
  assert.match(lastSetCookie, /HttpOnly/i)
  assert.equal((await request("/api/auth/me")).user.displayName, "冒烟测试")
  assert.equal(
    (
      await request("/api/ai/conversations/smoke-conversation", {
        method: "DELETE",
      })
    ).ok,
    true,
  )
  const savedSettings = await request("/api/ai/settings", {
    method: "PUT",
    body: JSON.stringify({
      providerId: "test-provider",
      modelId: "test-model",
      baseUrl: "https://example.com/v1",
      apiType: "openai-completions",
      authHeader: true,
      apiKey: "sk-test-secret",
    }),
  })
  assert.equal(savedSettings.providerId, "test-provider")
  assert.equal(existsSync(modelsPath), true)
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent")
  const runtime = await ModelRuntime.create({ modelsPath })
  await runtime.setRuntimeApiKey("test-provider", "sk-test-secret")
  assert.equal(
    runtime.getModel("test-provider", "test-model")?.id,
    "test-model",
  )
  const publicSettings = await request("/api/ai/settings")
  assert.equal(publicSettings.hasApiKey, true)
  assert.equal("apiKey" in publicSettings, false)
  assert.equal(publicSettings.customPrompt, "")
  assert.ok(publicSettings.profiles.length >= 1)
  const savedPrompt = await request("/api/ai/settings/prompt", {
    method: "PUT",
    body: JSON.stringify({ customPrompt: "餐饮优先记外卖" }),
  })
  assert.equal(savedPrompt.customPrompt, "餐饮优先记外卖")
  assert.equal(
    (await request("/api/ai/settings")).customPrompt,
    "餐饮优先记外卖",
  )
  assert.equal(
    (
      await request("/api/ai/settings/prompt", {
        method: "PUT",
        body: JSON.stringify({ customPrompt: "  " }),
      })
    ).customPrompt,
    "",
  )
  const defaultThinkingSettings = await request(
    `/api/ai/settings/profiles/${publicSettings.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        ...publicSettings,
        apiKey: "",
        thinkingEnabled: true,
        thinkingLevel: "default",
      }),
    },
  )
  assert.equal(defaultThinkingSettings.thinkingEnabled, true)
  assert.equal(defaultThinkingSettings.thinkingLevel, "default")
  const disabledThinkingSettings = await request(
    `/api/ai/settings/profiles/${publicSettings.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        ...publicSettings,
        apiKey: "",
        thinkingEnabled: false,
        thinkingLevel: "default",
      }),
    },
  )
  assert.equal(disabledThinkingSettings.thinkingEnabled, false)
  const created = await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-11",
      amount: 10,
      direction: "expense",
      item: "测试午饭",
      category1: "餐饮",
      category2: "午餐",
      note: "smoke",
    }),
  })
  const id = created.records[0].id
  const firstDashboard = await request("/api/dashboard?anchor=2026-08-11")
  assert.equal(firstDashboard.totals.day, 10)
  assert.equal(firstDashboard.secondaryBreakdowns.day[0].category, "午餐")
  assert.equal(firstDashboard.secondaryBreakdowns.day[0].parent, "餐饮")
  assert.equal(firstDashboard.secondaryBreakdowns.day[0].share, 1)

  await request(`/api/transactions/${id}`, {
    method: "PUT",
    body: JSON.stringify({ amount: 12 }),
  })
  assert.equal(
    (await request("/api/dashboard?anchor=2026-08-11")).totals.day,
    12,
  )

  const parsed = parseLocally("今天午饭吃了13.6", "2026-08-11")
  assert.equal(parsed[0].category1, "餐饮")
  assert.equal(pendingRecordMatches({ item: "新增记录" }, { id: 5 }), false)
  assert.equal(pendingRecordMatches({ id: 5 }, { id: 5 }), true)
  assert.equal(pendingRecordMatches({ item: "新增记录" }, { item: "" }), false)
  assert.equal(
    pendingRecordMatches(
      { type: "adjustment-reverse" },
      { proposalType: "adjustment-reverse" },
    ),
    true,
  )

  const editConversationId = "smoke-edit-proposal"
  await request("/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({ id: editConversationId }),
  })
  const testDatabase = new PrismaClient()
  await testDatabase.aiMessage.create({
    data: {
      conversationId: editConversationId,
      role: "assistant",
      content: "思考持久化测试",
      thinking: "这段思考应在对话完成后继续存在",
    },
  })
  const conversationWithThinking = await request(
    `/api/ai/conversations/${editConversationId}`,
  )
  assert.equal(
    conversationWithThinking.messages.at(-1).thinking,
    "这段思考应在对话完成后继续存在",
  )
  const currentRecord = (
    await request(`/api/transactions?query=测试午饭&page=1&pageSize=20`)
  ).records[0]
  await testDatabase.aiConversation.update({
    where: { id: editConversationId },
    data: {
      pendingProposals: [
        { type: "update", id, current: currentRecord, changes: { amount: 14 } },
      ],
    },
  })
  const rejectedProposalEdit = await requestError(
    `/api/ai/conversations/${editConversationId}/proposals`,
    {
      method: "PUT",
      body: JSON.stringify({ proposals: [{ type: "delete", id }] }),
    },
  )
  assert.equal(rejectedProposalEdit.status, 400)
  const editedProposal = await request(
    `/api/ai/conversations/${editConversationId}/proposals`,
    {
      method: "PUT",
      body: JSON.stringify({
        proposals: [
          { type: "update", id, changes: { amount: 15, item: "人工微调午饭" } },
        ],
      }),
    },
  )
  assert.equal(editedProposal.proposals[0].changes.amount, 15)
  assert.equal(editedProposal.proposals[0].changes.direction, "expense")
  await request("/api/ai/execute", {
    method: "POST",
    body: JSON.stringify({ conversationId: editConversationId }),
  })
  const manuallyEdited = (
    await request("/api/transactions?query=人工微调午饭&page=1&pageSize=20")
  ).records[0]
  assert.equal(manuallyEdited.amount, -15)
  const editedConversation = await request(
    `/api/ai/conversations/${editConversationId}`,
  )
  assert.match(editedConversation.messages.at(-1).content, /执行前人工调整/)
  assert.match(editedConversation.messages.at(-1).content, /金额.*14.*15/)

  const removeIndexConversationId = "smoke-remove-index"
  await request("/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({ id: removeIndexConversationId }),
  })
  const originalCreateRecords = [
    {
      date: "2026-08-11",
      amount: 11,
      direction: "expense",
      item: "待移除第一笔",
      category1: "其他",
      category2: "测试",
      note: "",
    },
    {
      date: "2026-08-11",
      amount: 22,
      direction: "expense",
      item: "应保留第二笔",
      category1: "其他",
      category2: "测试",
      note: "",
    },
  ]
  await testDatabase.aiConversation.update({
    where: { id: removeIndexConversationId },
    data: {
      pendingProposals: [
        {
          type: "create",
          records: originalCreateRecords,
          _originalRecords: originalCreateRecords,
          _humanEdited: true,
        },
      ],
    },
  })
  await request(
    `/api/ai/conversations/${removeIndexConversationId}/proposals/remove`,
    {
      method: "POST",
      body: JSON.stringify({ proposalIndex: 0, recordIndex: 0 }),
    },
  )
  const removedIndexState = await testDatabase.aiConversation.findUnique({
    where: { id: removeIndexConversationId },
  })
  assert.equal(removedIndexState.pendingProposals[0].records.length, 1)
  assert.equal(
    removedIndexState.pendingProposals[0]._originalRecords[0].item,
    "应保留第二笔",
  )
  assert.equal(
    removedIndexState.removedNotices[0].proposal.records[0].item,
    "待移除第一笔",
  )

  const rollbackConversationId = "smoke-atomic-rollback"
  await request("/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({ id: rollbackConversationId }),
  })
  await testDatabase.aiConversation.update({
    where: { id: rollbackConversationId },
    data: {
      pendingProposals: [
        {
          type: "create",
          records: [
            {
              date: "2026-08-11",
              amount: 88,
              direction: "expense",
              item: "原子回滚测试",
              category1: "其他",
              category2: "测试",
              note: "",
            },
          ],
        },
        { type: "unknown" },
      ],
    },
  })
  await requestError("/api/ai/execute", {
    method: "POST",
    body: JSON.stringify({ conversationId: rollbackConversationId }),
  })
  assert.equal(
    (await request("/api/transactions?query=原子回滚测试&page=1&pageSize=20"))
      .total,
    0,
  )
  assert.equal(
    (await request(`/api/ai/conversations/${rollbackConversationId}`)).proposals
      .length,
    2,
  )

  const idempotentConversationId = "smoke-idempotent-execute"
  await request("/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({ id: idempotentConversationId }),
  })
  await testDatabase.aiConversation.update({
    where: { id: idempotentConversationId },
    data: {
      pendingProposals: [
        {
          type: "create",
          records: [
            {
              date: "2026-08-11",
              amount: 66,
              direction: "expense",
              item: "防重复确认测试",
              category1: "其他",
              category2: "测试",
              note: "",
            },
          ],
        },
      ],
    },
  })
  const concurrentExecution = await Promise.allSettled([
    request("/api/ai/execute", {
      method: "POST",
      body: JSON.stringify({ conversationId: idempotentConversationId }),
    }),
    request("/api/ai/execute", {
      method: "POST",
      body: JSON.stringify({ conversationId: idempotentConversationId }),
    }),
  ])
  assert.equal(
    concurrentExecution.filter((result) => result.status === "fulfilled")
      .length,
    1,
  )
  assert.equal(
    (await request("/api/transactions?query=防重复确认测试&page=1&pageSize=20"))
      .total,
    1,
  )
  const idempotentRecord = (
    await request("/api/transactions?query=防重复确认测试&page=1&pageSize=20")
  ).records[0]
  await request(`/api/transactions/${idempotentRecord.id}`, {
    method: "DELETE",
  })
  await testDatabase.$disconnect()

  await request(`/api/transactions/${id}`, { method: "DELETE" })
  assert.equal(
    (await request("/api/dashboard?anchor=2026-08-11")).totals.day,
    0,
  )
  const batch = await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      records: Array.from({ length: 25 }, (_, index) => ({
        date: "2026-08-11",
        amount: 1,
        direction: "expense",
        item: `分页测试${index + 1}`,
        category1: "其他",
        category2: "待分类",
        note: "",
      })),
    }),
  })
  const bulk = await request("/api/transactions/bulk-categorize", {
    method: "POST",
    body: JSON.stringify({
      ids: batch.records.slice(0, 2).map((row) => row.id),
      category1: "餐饮",
      category2: "测试批量分类",
    }),
  })
  assert.equal(bulk.updated, 2)
  await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-07-20",
      amount: 2,
      direction: "expense",
      item: "月份筛选测试",
      category1: "其他",
      category2: "待分类",
      note: "",
    }),
  })
  const pageThree = await request(
    "/api/transactions?month=2026-08&page=3&pageSize=10",
  )
  assert.equal(pageThree.total, 25)
  assert.equal(pageThree.totalPages, 3)
  assert.equal(pageThree.records.length, 5)
  const julyPage = await request(
    "/api/transactions?month=2026-07&page=1&pageSize=20",
  )
  assert.equal(julyPage.total, 1)
  const searchedPage = await request(
    "/api/transactions?month=2026-08&page=1&pageSize=20&query=分页测试25&category1=其他",
  )
  assert.equal(searchedPage.total, 1)
  assert.equal(searchedPage.records[0].item, "分页测试25")
  const customRange = await request(
    "/api/dashboard/range?start=2026-08-01&end=2026-08-31",
  )
  assert.equal(customRange.days, 31)
  assert.equal(customRange.cashflow.expense, 25)
  assert.equal(customRange.series.length, 31)
  assert.ok(Array.isArray(customRange.comparisonBreakdown))
  const rangedPage = await request(
    "/api/transactions?start=2026-08-01&end=2026-08-11&page=1&pageSize=100",
  )
  assert.equal(rangedPage.total, 25)
  assert.equal(
    (await request("/api/dashboard?anchor=2026-08-11")).rangeSeries.week.length,
    7,
  )
  const account = await request("/api/management/accounts", {
    method: "POST",
    body: JSON.stringify({ name: "测试账户", type: "cash", openingBalance: 0 }),
  })
  const management = await request("/api/management")
  assert.ok(management.accounts.some((row) => row.id === account.id))
  const accountRecord = await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-11",
      amount: 3,
      direction: "expense",
      item: "账户测试",
      category1: "其他",
      category2: "测试",
      accountId: account.id,
    }),
  })
  assert.equal(accountRecord.records[0].accountId, account.id)
  assert.equal(
    (await request(`/api/transactions?query=账户测试&page=1&pageSize=20`))
      .records[0].accountName,
    "测试账户",
  )
  const omittedAccountRecord = await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-11",
      amount: 4,
      direction: "expense",
      item: "省略账户测试",
      category1: "其他",
      category2: "测试",
    }),
  })
  assert.equal(omittedAccountRecord.records[0].accountId, null)
  assert.equal(omittedAccountRecord.records[0].accountName, "不记账户")
  const unaccountedRecord = await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-11",
      amount: 7,
      direction: "expense",
      item: "不记账户测试",
      category1: "其他",
      category2: "测试",
      accountId: "none",
    }),
  })
  assert.equal(unaccountedRecord.records[0].accountId, null)
  assert.equal(unaccountedRecord.records[0].accountName, "不记账户")
  assert.equal(
    (
      await request(
        "/api/transactions?accountId=none&query=不记账户测试&page=1&pageSize=20",
      )
    ).total,
    1,
  )
  assert.equal(
    (
      await request(
        `/api/transactions?accountId=${account.id}&query=账户测试&page=1&pageSize=20`,
      )
    ).total,
    1,
  )
  const clearedAccount = await request(
    `/api/transactions/${omittedAccountRecord.records[0].id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        date: "2026-08-11",
        amount: 4,
        direction: "expense",
        item: "省略账户测试",
        category1: "其他",
        category2: "测试",
        accountId: "none",
      }),
    },
  )
  assert.equal(clearedAccount.record.accountId, null)
  const restoredAccount = await request(
    `/api/transactions/${omittedAccountRecord.records[0].id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        date: "2026-08-11",
        amount: 4,
        direction: "expense",
        item: "省略账户测试",
        category1: "其他",
        category2: "测试",
        accountId: account.id,
      }),
    },
  )
  assert.equal(restoredAccount.record.accountId, account.id)
  const financeUnaccounted = await request("/api/finance")
  assert.ok(financeUnaccounted.summary.unaccountedCount >= 1)

  const hospitalityTag = await request("/api/tags", {
    method: "POST",
    body: JSON.stringify({ name: "人情请客", color: "#a4513f" }),
  })
  const friendsTag = await request("/api/tags", {
    method: "POST",
    body: JSON.stringify({ name: "朋友聚会", color: "#315f77" }),
  })
  const taggedRecord = await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-12",
      amount: 120,
      direction: "expense",
      item: "请朋友吃饭",
      category1: "餐饮",
      category2: "聚餐",
      accountId: account.id,
      tagIds: [hospitalityTag.id, friendsTag.id],
    }),
  })
  assert.deepEqual(
    taggedRecord.records[0].tags.map((tag) => tag.name).sort(),
    ["人情请客", "朋友聚会"].sort(),
  )
  const tagOverview = await request("/api/tags?month=2026-08")
  assert.equal(
    tagOverview.tags.find((tag) => tag.id === hospitalityTag.id).expense,
    120,
  )
  assert.equal(
    (await request(`/api/tags/${hospitalityTag.id}?month=2026-08`)).summary
      .expense,
    120,
  )
  const yearlyTagAnalytics = await request(
    `/api/tags/${hospitalityTag.id}?scope=year&period=2026`,
  )
  const yearlyTagOverview = await request("/api/tags?scope=year&period=2026")
  assert.equal(yearlyTagAnalytics.scope, "year")
  assert.equal(yearlyTagAnalytics.period, "2026")
  assert.equal(yearlyTagAnalytics.summary.expense, 120)
  assert.equal(yearlyTagAnalytics.series.length, 12)
  assert.equal(yearlyTagAnalytics.series[7].amount, 120)
  assert.equal(
    yearlyTagOverview.tags.find((tag) => tag.id === hospitalityTag.id).expense,
    120,
  )
  assert.equal(
    (
      await request(
        `/api/transactions?tagId=${hospitalityTag.id}&month=2026-08&page=1&pageSize=20`,
      )
    ).total,
    1,
  )

  const tagAgentConversationId = "smoke-agent-tags"
  await request("/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({ id: tagAgentConversationId }),
  })
  await testDatabase.aiConversation.update({
    where: { id: tagAgentConversationId },
    data: {
      pendingProposals: [
        {
          type: "tag-update",
          tagId: hospitalityTag.id,
          changes: { name: "人情往来" },
          display: { tagName: "人情请客" },
        },
        {
          type: "tag-delete",
          tagId: friendsTag.id,
          display: { tagName: "朋友聚会" },
        },
        {
          type: "tag-create",
          tag: { name: "纪念日", color: "#80558c" },
        },
      ],
    },
  })
  await request("/api/ai/execute", {
    method: "POST",
    body: JSON.stringify({ conversationId: tagAgentConversationId }),
  })
  const tagDictionaries = await request("/api/dictionaries")
  assert.ok(tagDictionaries.tags.some((tag) => tag.name === "人情往来"))
  assert.ok(tagDictionaries.tags.some((tag) => tag.name === "纪念日"))
  assert.ok(!tagDictionaries.tags.some((tag) => tag.name === "朋友聚会"))
  const taggedAfterAgent = await request(
    `/api/transactions?query=请朋友吃饭&page=1&pageSize=20`,
  )
  assert.equal(taggedAfterAgent.records[0].id, taggedRecord.records[0].id)
  assert.deepEqual(
    taggedAfterAgent.records[0].tags.map((tag) => tag.name),
    ["人情往来"],
  )

  const financeAccount = await request("/api/finance/accounts", {
    method: "POST",
    body: JSON.stringify({
      name: "还款银行卡",
      type: "bank",
      openingBalance: 10000,
      balanceDate: "2026-08-01",
      isDefault: true,
    }),
  })
  assert.equal(financeAccount.isDefault, true)
  const omittedWithDefault = await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-11",
      amount: 1,
      direction: "expense",
      item: "默认付款测试",
      category1: "其他",
      category2: "测试",
    }),
  })
  assert.equal(omittedWithDefault.records[0].accountId, financeAccount.id)
  await request(`/api/transactions/${omittedWithDefault.records[0].id}`, {
    method: "DELETE",
  })
  const renamedFinanceAccount = await request(
    `/api/finance/accounts/${financeAccount.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ name: "家庭还款卡" }),
    },
  )
  assert.equal(renamedFinanceAccount.name, "家庭还款卡")
  const disposableAccount = await request("/api/finance/accounts", {
    method: "POST",
    body: JSON.stringify({
      name: "待删除空账户",
      type: "cash",
      openingBalance: 0,
      balanceDate: "2026-08-01",
      isDefault: true,
    }),
  })
  assert.equal(disposableAccount.isDefault, true)
  const unsetDisposable = await request(
    `/api/finance/accounts/${disposableAccount.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ isDefault: false }),
    },
  )
  assert.equal(unsetDisposable.isDefault, false)
  const restoredDisposable = await request(
    `/api/finance/accounts/${disposableAccount.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ isDefault: true }),
    },
  )
  assert.equal(restoredDisposable.isDefault, true)
  assert.equal(
    (
      await request(`/api/finance/accounts/${disposableAccount.id}`, {
        method: "DELETE",
      })
    ).deleted,
    true,
  )
  const restoredFinanceDefault = await request(
    `/api/finance/accounts/${financeAccount.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ isDefault: true }),
    },
  )
  assert.equal(restoredFinanceDefault.isDefault, true)
  const adjustableAccount = await request("/api/finance/accounts", {
    method: "POST",
    body: JSON.stringify({
      name: "待撤销校准账户",
      type: "cash",
      openingBalance: 0,
      balanceDate: "2026-08-01",
    }),
  })
  const createdAdjustment = await request(
    `/api/finance/accounts/${adjustableAccount.id}/reconcile`,
    {
      method: "POST",
      body: JSON.stringify({ balance: 100, note: "校准后应能撤销" }),
    },
  )
  assert.equal(createdAdjustment.adjusted, 100)
  const blockedAdjustmentDelete = await requestError(
    `/api/finance/accounts/${adjustableAccount.id}`,
    { method: "DELETE" },
  )
  assert.equal(blockedAdjustmentDelete.status, 400)
  assert.match(JSON.stringify(blockedAdjustmentDelete.body), /1 条额度调整/)
  const financeWithAdjustment = await request("/api/finance")
  const visibleAdjustment = financeWithAdjustment.recentTransfers.find(
    (row) => row.kind === "adjustment" && row.note === "校准后应能撤销",
  )
  assert.ok(visibleAdjustment)
  assert.equal(
    (
      await request(`/api/finance/adjustments/${visibleAdjustment.id}`, {
        method: "DELETE",
      })
    ).reversed,
    true,
  )
  assert.equal(
    (
      await request(`/api/finance/accounts/${adjustableAccount.id}`, {
        method: "DELETE",
      })
    ).deleted,
    true,
  )
  assert.equal(
    (
      await requestError(`/api/finance/accounts/${account.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true, enabled: false }),
      })
    ).status,
    400,
  )
  const disabledDefault = await request(
    `/api/management/accounts/${financeAccount.id}/enabled`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
    },
  )
  assert.equal(disabledDefault.enabled, false)
  assert.equal(disabledDefault.isDefault, false)
  const reenabledFinanceAccount = await request(
    `/api/finance/accounts/${financeAccount.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled: true, isDefault: true }),
    },
  )
  assert.equal(reenabledFinanceAccount.enabled, true)
  assert.equal(reenabledFinanceAccount.isDefault, true)
  const loanAccount = await request("/api/finance/accounts", {
    method: "POST",
    body: JSON.stringify({
      name: "测试车贷",
      type: "loan",
      openingBalance: 0,
      balanceDate: "2026-08-01",
    }),
  })
  assert.equal(loanAccount.type, "loan")
  assert.equal(loanAccount.openingBalance, 0)
  assert.equal(loanAccount.isDefault, false)
  const drawdown = await request("/api/finance/transfers", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-01",
      amount: 5000,
      fromAccountId: loanAccount.id,
      toAccountId: financeAccount.id,
      note: "车贷放款",
    }),
  })
  assert.equal(drawdown.kind, "debt_drawdown")
  let finance = await request("/api/finance")
  const bankAfterDrawdown = finance.accounts.find(
    (row) => row.id === financeAccount.id,
  )
  const loanAfterDrawdown = finance.accounts.find(
    (row) => row.id === loanAccount.id,
  )
  assert.equal(bankAfterDrawdown.balance, 15000)
  assert.equal(loanAfterDrawdown.balance, -5000)
  assert.equal(loanAfterDrawdown.outstanding, 5000)
  assert.equal(loanAfterDrawdown.availableQuota, 0)
  assert.equal(finance.summary.liabilities, 5000)
  const creditAccount = await request("/api/finance/accounts", {
    method: "POST",
    body: JSON.stringify({
      name: "测试花呗",
      type: "credit",
      openingBalance: 38000,
      balanceDate: "2026-08-01",
    }),
  })
  assert.equal(creditAccount.openingBalance, 38000)
  assert.equal(creditAccount.availableQuota, 38000)
  await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-02",
      direction: "expense",
      amount: 200,
      item: "花呗购物",
      category1: "购物",
      category2: "日用",
      accountId: creditAccount.id,
    }),
  })
  finance = await request("/api/finance")
  assert.equal(
    finance.accounts.find((row) => row.id === creditAccount.id).availableQuota,
    37800,
  )
  const creditTransfer = await request("/api/finance/transfers", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-09",
      amount: 100,
      fromAccountId: financeAccount.id,
      toAccountId: creditAccount.id,
    }),
  })
  assert.equal(creditTransfer.kind, "debt_payment")
  const reconciliation = await request(
    `/api/finance/accounts/${financeAccount.id}/reconcile`,
    {
      method: "POST",
      body: JSON.stringify({ balance: 14800, note: "冒烟校准" }),
    },
  )
  assert.equal(reconciliation.adjusted, -100)
  assert.equal(
    (await request("/api/finance")).accounts.find(
      (row) => row.id === financeAccount.id,
    ).balance,
    14800,
  )
  const creditIncrease = await request(
    `/api/finance/accounts/${creditAccount.id}/reconcile`,
    {
      method: "POST",
      body: JSON.stringify({ balance: 42900, note: "花呗提额" }),
    },
  )
  assert.equal(creditIncrease.adjusted, 5000)
  finance = await request("/api/finance")
  assert.equal(
    finance.accounts.find((row) => row.id === creditAccount.id).availableQuota,
    42900,
  )
  const openingUpdated = await request(
    `/api/finance/accounts/${creditAccount.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ openingBalance: 43000 }),
    },
  )
  assert.equal(openingUpdated.openingBalance, 43000)
  assert.equal(openingUpdated.availableQuota, 47900)
  const repayment = await request("/api/finance/repayments", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-10",
      fromAccountId: financeAccount.id,
      toAccountId: loanAccount.id,
      principal: 500,
      interest: 50,
      fee: 10,
    }),
  })
  assert.equal(repayment.principal, 500)
  assert.equal(repayment.interest, 50)
  assert.equal(repayment.fee, 10)
  assert.equal(
    (await request("/api/dashboard?anchor=2026-08-10")).totals.day,
    60,
  )
  const financeExpensePage = await request("/api/transactions?date=2026-08-10")
  assert.equal(financeExpensePage.records[0].accountName, "家庭还款卡")
  await request(`/api/transactions/${financeExpensePage.records[0].id}`, {
    method: "DELETE",
  })
  assert.equal(
    (await request("/api/dashboard?anchor=2026-08-10")).totals.day,
    0,
  )
  await request("/api/finance/repayments", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-10",
      fromAccountId: financeAccount.id,
      toAccountId: loanAccount.id,
      principal: 500,
      interest: 50,
      fee: 10,
    }),
  })
  finance = await request("/api/finance")
  assert.equal(
    finance.accounts.find((row) => row.id === loanAccount.id).outstanding,
    4000,
  )
  await request("/api/finance/repayments", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-14",
      fromAccountId: financeAccount.id,
      toAccountId: loanAccount.id,
      principal: 4000,
      interest: 20,
      fee: 5,
    }),
  })
  assert.equal(
    (await request("/api/dashboard?anchor=2026-08-14")).totals.day,
    25,
  )
  finance = await request("/api/finance")
  assert.equal(
    finance.accounts.find((row) => row.id === loanAccount.id).outstanding,
    0,
  )
  assert.equal(
    finance.accounts.find((row) => row.id === loanAccount.id).balance,
    0,
  )

  const financeAgentConversationId = "smoke-agent-finance"
  const financeBalanceBeforeAgent = finance.accounts.find(
    (row) => row.id === financeAccount.id,
  ).balance
  await request("/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({ id: financeAgentConversationId }),
  })
  await testDatabase.aiConversation.update({
    where: { id: financeAgentConversationId },
    data: {
      pendingProposals: [
        {
          type: "account-update",
          accountId: financeAccount.id,
          changes: { name: "还款银行卡" },
          display: { accountName: "家庭还款卡" },
        },
        {
          type: "transfer",
          transfer: {
            date: "2026-08-14",
            amount: 100,
            fromAccountId: financeAccount.id,
            toAccountId: account.id,
            kind: "transfer",
            note: "Agent 转账测试",
          },
          display: {
            fromAccountName: "还款银行卡",
            toAccountName: "测试账户",
          },
        },
        {
          type: "account-reconcile",
          accountId: financeAccount.id,
          reconcile: {
            balance: financeBalanceBeforeAgent - 300,
            note: "Agent 校准测试",
          },
          display: {
            accountName: "还款银行卡",
            currentBalance: financeBalanceBeforeAgent,
          },
        },
      ],
    },
  })
  await request("/api/ai/execute", {
    method: "POST",
    body: JSON.stringify({ conversationId: financeAgentConversationId }),
  })
  finance = await request("/api/finance")
  assert.equal(
    finance.accounts.find((row) => row.id === financeAccount.id).name,
    "还款银行卡",
  )
  const agentTransfer = finance.recentTransfers.find(
    (row) => row.note === "Agent 转账测试",
  )
  assert.ok(agentTransfer)
  const reversibleTransferId = agentTransfer.id
  assert.equal(agentTransfer.reversible, true)
  await request(`/api/finance/transfers/${reversibleTransferId}`, {
    method: "DELETE",
  })
  assert.ok(
    !(await request("/api/finance")).recentTransfers.some(
      (row) => row.id === reversibleTransferId,
    ),
  )
  const agentAdjustment = (await request("/api/finance")).recentTransfers.find(
    (row) => row.kind === "adjustment" && row.note === "Agent 校准测试",
  )
  assert.ok(agentAdjustment)
  const reverseAdjustmentConversationId = "smoke-agent-adjustment-reverse"
  await request("/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({ id: reverseAdjustmentConversationId }),
  })
  await testDatabase.aiConversation.update({
    where: { id: reverseAdjustmentConversationId },
    data: {
      pendingProposals: [
        {
          type: "adjustment-reverse",
          adjustmentId: agentAdjustment.id,
          display: {
            accountName: "还款银行卡",
            amount: agentAdjustment.amount,
            note: agentAdjustment.note,
          },
        },
      ],
    },
  })
  await request("/api/ai/execute", {
    method: "POST",
    body: JSON.stringify({ conversationId: reverseAdjustmentConversationId }),
  })
  assert.ok(
    !(await request("/api/finance")).recentTransfers.some(
      (row) => row.id === agentAdjustment.id,
    ),
  )
  assert.equal(
    (await request("/api/dashboard?anchor=2026-08-14")).totals.day,
    25,
  )

  // 人情往来：垫付（含 AA 自己那份）、代付、借入、分次结算与撤销
  const lendingBankBefore = (await request("/api/finance")).accounts.find(
    (row) => row.id === financeAccount.id,
  ).balance
  const advance = await request("/api/lending/entries", {
    method: "POST",
    body: JSON.stringify({
      kind: "advance",
      contactName: "张三",
      date: "2026-08-15",
      amount: 300,
      selfAmount: 100,
      item: "火锅聚餐",
      category1: "餐饮",
      category2: "聚餐",
      accountId: financeAccount.id,
      dueDate: "2026-08-20",
    }),
  })
  assert.equal(advance.direction, "receivable")
  // 一共付了 300，自己那份 100，对方欠我 200
  assert.equal(advance.amount, 200)
  assert.equal(advance.outstanding, 200)
  // 垫出去的 200 不算支出，只有自己那份 100 计入当天支出
  assert.equal(
    (await request("/api/dashboard?anchor=2026-08-15")).totals.day,
    100,
  )
  let lending = await request("/api/lending")
  const zhangsan = lending.contacts.find((row) => row.name === "张三")
  assert.equal(zhangsan.receivable, 200)
  assert.equal(zhangsan.openReceivable, 200)
  assert.equal(zhangsan.untracked, 0)
  // 账户少了自己那份 + 垫出去的钱
  assert.equal(
    (await request("/api/finance")).accounts.find(
      (row) => row.id === financeAccount.id,
    ).balance,
    Number((lendingBankBefore - 300).toFixed(2)),
  )
  assert.equal((await request("/api/finance")).summary.receivable, 200)
  // 自己那份不能吃掉整笔垫付
  assert.equal(
    (
      await requestError("/api/lending/entries", {
        method: "POST",
        body: JSON.stringify({
          kind: "advance",
          contactId: (await request("/api/lending")).contacts[0].id,
          date: "2026-08-15",
          amount: 100,
          selfAmount: 100,
          item: "全是自己的份",
          category1: "餐饮",
          category2: "聚餐",
          accountId: financeAccount.id,
        }),
      })
    ).status,
    400,
  )

  const covered = await request("/api/lending/entries", {
    method: "POST",
    body: JSON.stringify({
      kind: "covered",
      contactId: zhangsan.id,
      date: "2026-08-16",
      amount: 60,
      item: "张三帮买咖啡",
      category1: "餐饮",
      category2: "饮品",
    }),
  })
  assert.equal(covered.direction, "payable")
  // 别人替我付的钱仍然是我的支出
  assert.equal(
    (await request("/api/dashboard?anchor=2026-08-16")).totals.day,
    60,
  )
  lending = await request("/api/lending")
  const zhangsanMixed = lending.contacts.find((row) => row.id === zhangsan.id)
  assert.equal(zhangsanMixed.balance, 140)
  assert.equal(zhangsanMixed.openReceivable, 200)
  assert.equal(zhangsanMixed.openPayable, 60)
  // 双向未结清时必须指定结算方向
  assert.equal(
    (
      await requestError("/api/lending/settlements", {
        method: "POST",
        body: JSON.stringify({
          contactId: zhangsan.id,
          date: "2026-08-17",
          amount: 10,
          accountId: financeAccount.id,
        }),
      })
    ).status,
    400,
  )
  // 结算金额不能超过待结清
  assert.equal(
    (
      await requestError("/api/lending/settlements", {
        method: "POST",
        body: JSON.stringify({
          contactId: zhangsan.id,
          direction: "receivable",
          date: "2026-08-17",
          amount: 500,
          accountId: financeAccount.id,
        }),
      })
    ).status,
    400,
  )
  const partial = await request("/api/lending/settlements", {
    method: "POST",
    body: JSON.stringify({
      contactId: zhangsan.id,
      direction: "receivable",
      date: "2026-08-17",
      amount: 120,
      accountId: financeAccount.id,
    }),
  })
  assert.equal(partial.settled.length, 1)
  assert.equal(partial.settled[0].cleared, false)
  lending = await request("/api/lending")
  assert.equal(
    lending.entries.find((row) => row.id === advance.id).outstanding,
    80,
  )
  const settleRest = await request("/api/lending/settlements", {
    method: "POST",
    body: JSON.stringify({
      entryId: advance.id,
      date: "2026-08-18",
      amount: 80,
      accountId: financeAccount.id,
    }),
  })
  assert.equal(settleRest.settled[0].cleared, true)
  lending = await request("/api/lending")
  assert.ok(!lending.entries.some((row) => row.id === advance.id))
  assert.equal(
    lending.contacts.find((row) => row.id === zhangsan.id).balance,
    -60,
  )
  // 结算只搬钱，不产生收支
  assert.equal(
    (await request("/api/dashboard?anchor=2026-08-18")).totals.day,
    0,
  )

  const borrowed = await request("/api/lending/entries", {
    method: "POST",
    body: JSON.stringify({
      kind: "borrow",
      contactName: "李四",
      date: "2026-08-19",
      amount: 1000,
      item: "周转",
      accountId: financeAccount.id,
    }),
  })
  assert.equal(borrowed.direction, "payable")
  // 借入的钱进账户但不算收入
  assert.equal(
    (await request("/api/dashboard?anchor=2026-08-19")).cashflow.day.income,
    0,
  )
  lending = await request("/api/lending")
  assert.equal(lending.summary.payable, 1060)
  const financeWithLending = await request("/api/finance")
  assert.equal(financeWithLending.summary.payable, 1060)
  // 往来产生的资金移动不能在资产页直接撤销
  const lendingTransfer = financeWithLending.recentTransfers.find(
    (row) => row.note === "周转",
  )
  assert.ok(lendingTransfer)
  assert.equal(lendingTransfer.reversible, false)
  assert.equal(
    (
      await requestError(`/api/finance/transfers/${lendingTransfer.id}`, {
        method: "DELETE",
      })
    ).status,
    400,
  )
  const lisiDetail = await request(
    `/api/lending/contacts/${borrowed.contactId}`,
  )
  assert.equal(lisiDetail.contact.payable, 1000)
  assert.equal(lisiDetail.entries.length, 1)
  assert.equal(lisiDetail.movements.length, 1)
  // 撤销往来会连带撤销资金移动
  assert.equal(
    (await request(`/api/lending/entries/${borrowed.id}`, { method: "DELETE" }))
      .deleted,
    true,
  )
  lending = await request("/api/lending")
  assert.equal(
    lending.contacts.find((row) => row.id === borrowed.contactId).balance,
    0,
  )
  assert.equal(lending.summary.payable, 60)
  // 撤销「别人替我付」会把关联账目送进回收站
  await request(`/api/lending/entries/${covered.id}`, { method: "DELETE" })
  assert.equal(
    (await request("/api/dashboard?anchor=2026-08-16")).totals.day,
    0,
  )
  assert.ok(
    (await request("/api/trash")).records.some(
      (row) => row.item === "张三帮买咖啡",
    ),
  )
  assert.equal((await request("/api/lending")).summary.payable, 0)

  const shanghaiToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  const shanghaiTomorrowDate = new Date(`${shanghaiToday}T00:00:00.000Z`)
  shanghaiTomorrowDate.setUTCDate(shanghaiTomorrowDate.getUTCDate() + 1)
  const shanghaiTomorrow = shanghaiTomorrowDate.toISOString().slice(0, 10)
  const todayAdvance = await request("/api/lending/entries", {
    method: "POST",
    body: JSON.stringify({
      kind: "advance",
      contactName: "时区校验",
      date: shanghaiToday,
      amount: 900,
      item: "今天垫付不应出现未跟踪",
      accountId: financeAccount.id,
    }),
  })
  assert.equal(todayAdvance.outstanding, 900)
  lending = await request("/api/lending")
  assert.equal(
    lending.contacts.find((row) => row.name === "时区校验").untracked,
    0,
  )
  assert.equal(lending.summary.untracked, 0)
  const futureAdvance = await request("/api/lending/entries", {
    method: "POST",
    body: JSON.stringify({
      kind: "advance",
      contactName: "时区校验",
      date: shanghaiTomorrow,
      amount: 50,
      item: "未来日期也不应误报未跟踪",
      accountId: financeAccount.id,
    }),
  })
  lending = await request("/api/lending")
  assert.equal(
    lending.contacts.find((row) => row.name === "时区校验").untracked,
    0,
  )
  await request(`/api/lending/entries/${todayAdvance.id}`, { method: "DELETE" })
  await request(`/api/lending/entries/${futureAdvance.id}`, {
    method: "DELETE",
  })

  const namedContact = await request("/api/lending/contacts", {
    method: "POST",
    body: JSON.stringify({ name: "可改名对象" }),
  })
  const renamedContact = await request(
    `/api/lending/contacts/${namedContact.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ name: "已改名对象" }),
    },
  )
  assert.equal(renamedContact.name, "已改名对象")
  assert.equal(
    (
      await request(`/api/lending/contacts/${namedContact.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      })
    ).enabled,
    false,
  )
  assert.equal(
    (
      await request(`/api/lending/contacts/${namedContact.id}`, {
        method: "DELETE",
      })
    ).deleted,
    true,
  )
  assert.equal(
    (
      await requestError(`/api/lending/contacts/${zhangsan.id}`, {
        method: "DELETE",
      })
    ).status,
    400,
  )

  const sourceCategory = await request("/api/management/categories", {
    method: "POST",
    body: JSON.stringify({
      category1: "测试管理",
      category2: "来源",
      primaryIcon: "food",
      secondaryIcon: "shopping",
    }),
  })
  const targetCategory = await request("/api/management/categories", {
    method: "POST",
    body: JSON.stringify({
      category1: "测试管理",
      category2: "目标",
      secondaryIcon: "gift",
    }),
  })
  await request(
    `/api/management/categories/primary/${encodeURIComponent("测试管理")}/icon`,
    {
      method: "PATCH",
      body: JSON.stringify({ primaryIcon: "transport" }),
    },
  )
  const iconOverview = await request("/api/management")
  assert.deepEqual(
    iconOverview.categories
      .filter((row) => row.category1 === "测试管理")
      .map((row) => row.primaryIcon),
    ["transport", "transport"],
  )
  assert.equal(
    (await request("/api/dictionaries")).categories.find(
      (row) => row.category1 === "测试管理" && row.category2 === "目标",
    ).secondaryIcon,
    "gift",
  )
  const managedRecord = await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-11",
      amount: 4,
      direction: "expense",
      item: "分类生命周期测试",
      category1: "测试管理",
      category2: "来源",
    }),
  })
  const renamed = await request(
    `/api/management/categories/${sourceCategory.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        category1: "测试管理",
        category2: "已改名",
        secondaryIcon: "care",
      }),
    },
  )
  assert.equal(renamed.updatedTransactions, 1)
  assert.equal(
    (
      await request(
        "/api/transactions?query=分类生命周期测试&page=1&pageSize=20",
      )
    ).records[0].category2,
    "已改名",
  )
  const iconRecord = (
    await request("/api/transactions?query=分类生命周期测试&page=1&pageSize=20")
  ).records[0]
  assert.equal(iconRecord.primaryIcon, "transport")
  assert.equal(iconRecord.secondaryIcon, "care")
  const iconDashboard = await request("/api/dashboard?anchor=2026-08-11")
  assert.equal(
    iconDashboard.breakdowns.day.find((row) => row.category === "测试管理")
      .icon,
    "transport",
  )
  assert.equal(
    iconDashboard.secondaryBreakdowns.day.find(
      (row) => row.parent === "测试管理" && row.category === "已改名",
    ).icon,
    "care",
  )
  const blockedDelete = await requestError(
    `/api/management/categories/${sourceCategory.id}`,
    { method: "DELETE" },
  )
  assert.equal(blockedDelete.status, 400)
  assert.match(JSON.stringify(blockedDelete.body), /仍被 1 笔账目使用/)
  const merged = await request(
    `/api/management/categories/${sourceCategory.id}/merge`,
    { method: "POST", body: JSON.stringify({ targetId: targetCategory.id }) },
  )
  assert.equal(merged.updatedTransactions, 1)
  assert.equal(
    (
      await request(
        "/api/transactions?query=分类生命周期测试&page=1&pageSize=20",
      )
    ).records[0].category2,
    "目标",
  )
  const lifecycleOverview = await request("/api/management")
  assert.equal(
    lifecycleOverview.categories.find((row) => row.id === sourceCategory.id)
      .mergedIntoId,
    targetCategory.id,
  )
  assert.equal(
    (
      await request(`/api/management/categories/${sourceCategory.id}`, {
        method: "DELETE",
      })
    ).ok,
    true,
  )
  await request(`/api/transactions/${managedRecord.records[0].id}`, {
    method: "DELETE",
  })
  // 账目还在回收站时不能删分类，避免还原后分类丢失
  assert.match(
    JSON.stringify(
      (
        await requestError(`/api/management/categories/${targetCategory.id}`, {
          method: "DELETE",
        })
      ).body,
    ),
    /回收站里还有 1 笔账目/,
  )
  await request("/api/trash/purge", {
    method: "POST",
    body: JSON.stringify({ ids: [managedRecord.records[0].id] }),
  })
  assert.equal(
    (
      await request(`/api/management/categories/${targetCategory.id}`, {
        method: "DELETE",
      })
    ).ok,
    true,
  )

  await request("/api/management/categories", {
    method: "POST",
    body: JSON.stringify({ category1: "待改一级", category2: "子类" }),
  })
  const primaryRename = await request(
    "/api/management/categories/primary/rename",
    {
      method: "PATCH",
      body: JSON.stringify({ from: "待改一级", to: "已改一级" }),
    },
  )
  assert.equal(primaryRename.categories, 1)
  const primaryDelete = await request(
    `/api/management/categories/primary/${encodeURIComponent("已改一级")}`,
    { method: "DELETE" },
  )
  assert.equal(primaryDelete.deleted, 1)

  const iconAgentConversationId = "smoke-agent-category-icons"
  await request("/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({ id: iconAgentConversationId }),
  })
  const iconAgentProposals = [
    {
      type: "create",
      records: [
        {
          date: "2026-08-11",
          amount: 28,
          direction: "expense",
          item: "AI 图标自动记账",
          category1: "户外活动",
          category2: "露营用品",
          primaryIcon: "travel",
          secondaryIcon: "shopping",
          note: "",
        },
      ],
    },
    {
      type: "category-icon",
      category1: "户外活动",
      icon: "care",
    },
    {
      type: "category-icon",
      category1: "户外活动",
      category2: "露营用品",
      icon: "gift",
    },
  ]
  await testDatabase.aiConversation.update({
    where: { id: iconAgentConversationId },
    data: { pendingProposals: iconAgentProposals },
  })
  const preservedIconProposals = await request(
    `/api/ai/conversations/${iconAgentConversationId}/proposals`,
    {
      method: "PUT",
      body: JSON.stringify({ proposals: iconAgentProposals }),
    },
  )
  assert.equal(preservedIconProposals.proposals[1].type, "category-icon")
  await request("/api/ai/execute", {
    method: "POST",
    body: JSON.stringify({ conversationId: iconAgentConversationId }),
  })
  const iconAgentRecord = (
    await request("/api/transactions?query=AI 图标自动记账&page=1&pageSize=20")
  ).records[0]
  assert.equal(iconAgentRecord.primaryIcon, "care")
  assert.equal(iconAgentRecord.secondaryIcon, "gift")

  const firstUserCookie = sessionCookie
  const firstUserTotal = (await request("/api/transactions?page=1&pageSize=1"))
    .total
  const secondUser = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username: "smoke_second",
      displayName: "隔离测试",
      password: "SmokePass456!",
    }),
  })
  assert.equal(secondUser.user.username, "smoke_second")
  assert.equal((await request("/api/transactions?page=1&pageSize=20")).total, 0)
  assert.equal((await request("/api/ai/settings")).profiles.length, 0)
  assert.equal(
    (
      await requestError("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          date: "2026-08-12",
          amount: 8,
          direction: "expense",
          item: "跨账本账户",
          category1: "餐饮",
          category2: "午餐",
          accountId: financeAccount.id,
        }),
      })
    ).status,
    404,
  )
  assert.equal(
    (
      await requestError(
        `/api/management/accounts/${financeAccount.id}/enabled`,
        {
          method: "PATCH",
          body: JSON.stringify({ enabled: false }),
        },
      )
    ).status,
    404,
  )
  const secondRecord = await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      date: "2026-08-12",
      amount: 9,
      direction: "expense",
      item: "第二用户账目",
      category1: "餐饮",
      category2: "午餐",
    }),
  })
  assert.equal((await request("/api/transactions?page=1&pageSize=20")).total, 1)
  sessionCookie = firstUserCookie
  assert.equal(
    (await request("/api/transactions?page=1&pageSize=1")).total,
    firstUserTotal,
  )
  assert.equal(
    (await request("/api/transactions?query=第二用户账目&page=1&pageSize=20"))
      .total,
    0,
  )
  sessionCookie = lastSetCookie.split(";", 1)[0]
  await request("/api/auth/logout", { method: "POST" })
  assert.equal((await requestError("/api/auth/me")).status, 401)
  sessionCookie = firstUserCookie

  console.log(
    "Smoke test passed: PWA, auth, isolation, CRUD, summaries, categories, accounts, finance, lending, transaction tags, tag analytics, Agent proposals, filtering, pagination, parser",
  )
} finally {
  await app.close()
  const cleanup = new PrismaClient()
  await cleanup.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  await cleanup.$disconnect()
  rmSync(testDataDir, { recursive: true, force: true })
}
