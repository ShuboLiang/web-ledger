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
  assert.ok(publicSettings.profiles.length >= 1)
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

  const sourceCategory = await request("/api/management/categories", {
    method: "POST",
    body: JSON.stringify({ category1: "测试管理", category2: "来源" }),
  })
  const targetCategory = await request("/api/management/categories", {
    method: "POST",
    body: JSON.stringify({ category1: "测试管理", category2: "目标" }),
  })
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
      body: JSON.stringify({ category1: "测试管理", category2: "已改名" }),
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
    "Smoke test passed: auth, long-lived session, user isolation, PostgreSQL health, profiles, CRUD, summaries, custom range, classification lifecycle, accounts, filtering, pagination, parser",
  )
} finally {
  await app.close()
  const cleanup = new PrismaClient()
  await cleanup.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  await cleanup.$disconnect()
  rmSync(testDataDir, { recursive: true, force: true })
}
