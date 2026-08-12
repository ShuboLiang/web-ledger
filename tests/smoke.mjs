import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const here = path.dirname(fileURLToPath(import.meta.url));
if (existsSync(path.join(here, "..", ".env"))) process.loadEnvFile(path.join(here, "..", ".env"));
const schema = `smoke_${Date.now()}`;
const testUrl = new URL(process.env.DATABASE_URL);
testUrl.searchParams.set("schema", schema);
process.env.DATABASE_URL = testUrl.toString();
const testDataDir = mkdtempSync(path.join(tmpdir(), "qing-zhang-smoke-"));
const modelsPath = path.join(testDataDir, "pi-models.json");
process.env.NO_SEED = "1";
process.env.DATA_DIR = testDataDir;
execFileSync(process.execPath, [path.join(here, "..", "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], { cwd: path.join(here, ".."), env: process.env, stdio: "ignore" });
const { startServer } = await import("../dist/src/main.js");
const { parseLocally } = await import("../lib/ai.mjs");
const { app, server } = await startServer({ port: 0 });
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

async function request(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await response.json();
  assert.ok(response.ok, body.error || `HTTP ${response.status}`);
  return body;
}

async function requestError(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await response.json();
  assert.equal(response.ok, false, `Expected ${pathname} to fail`);
  return { status: response.status, body };
}

try {
  const health = await request("/api/health");
  assert.equal(health.ok, true);
  assert.match(health.database, /^postgresql:\/\//);
  const page = await (await fetch(base)).text();
  assert.match(page, /id="root"/);
  assert.match(page, /\/assets\//);
  const dashboardPage = await (await fetch(`${base}/dashboard`)).text();
  assert.match(dashboardPage, /id="root"/);
  assert.equal((await request("/api/ai/conversations/smoke-conversation", { method: "DELETE" })).ok, true);
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
  });
  assert.equal(savedSettings.providerId, "test-provider");
  assert.equal(existsSync(modelsPath), true);
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  const runtime = await ModelRuntime.create({ modelsPath });
  await runtime.setRuntimeApiKey("test-provider", "sk-test-secret");
  assert.equal(runtime.getModel("test-provider", "test-model")?.id, "test-model");
  const publicSettings = await request("/api/ai/settings");
  assert.equal(publicSettings.hasApiKey, true);
  assert.equal("apiKey" in publicSettings, false);
  assert.ok(publicSettings.profiles.length >= 1);
  const created = await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({ date: "2026-08-11", amount: 10, direction: "expense", item: "测试午饭", category1: "餐饮", category2: "午餐", note: "smoke" }),
  });
  const id = created.records[0].id;
  const firstDashboard = await request("/api/dashboard?anchor=2026-08-11");
  assert.equal(firstDashboard.totals.day, 10);
  assert.equal(firstDashboard.secondaryBreakdowns.day[0].category, "午餐");
  assert.equal(firstDashboard.secondaryBreakdowns.day[0].parent, "餐饮");
  assert.equal(firstDashboard.secondaryBreakdowns.day[0].share, 1);

  await request(`/api/transactions/${id}`, { method: "PUT", body: JSON.stringify({ amount: 12 }) });
  assert.equal((await request("/api/dashboard?anchor=2026-08-11")).totals.day, 12);

  const parsed = parseLocally("今天午饭吃了13.6", "2026-08-11");
  assert.equal(parsed[0].category1, "餐饮");

  await request(`/api/transactions/${id}`, { method: "DELETE" });
  assert.equal((await request("/api/dashboard?anchor=2026-08-11")).totals.day, 0);
  const batch = await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({ records: Array.from({ length: 25 }, (_, index) => ({ date: "2026-08-11", amount: 1, direction: "expense", item: `分页测试${index + 1}`, category1: "其他", category2: "待分类", note: "" })) }),
  });
  const bulk = await request("/api/transactions/bulk-categorize", { method: "POST", body: JSON.stringify({ ids: batch.records.slice(0, 2).map((row) => row.id), category1: "餐饮", category2: "测试批量分类" }) });
  assert.equal(bulk.updated, 2);
  await request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({ date: "2026-07-20", amount: 2, direction: "expense", item: "月份筛选测试", category1: "其他", category2: "待分类", note: "" }),
  });
  const pageThree = await request("/api/transactions?month=2026-08&page=3&pageSize=10");
  assert.equal(pageThree.total, 25);
  assert.equal(pageThree.totalPages, 3);
  assert.equal(pageThree.records.length, 5);
  const julyPage = await request("/api/transactions?month=2026-07&page=1&pageSize=20");
  assert.equal(julyPage.total, 1);
  const searchedPage = await request("/api/transactions?month=2026-08&page=1&pageSize=20&query=分页测试25&category1=其他");
  assert.equal(searchedPage.total, 1);
  assert.equal(searchedPage.records[0].item, "分页测试25");
  const customRange = await request("/api/dashboard/range?start=2026-08-01&end=2026-08-31");
  assert.equal(customRange.days, 31);
  assert.equal(customRange.cashflow.expense, 25);
  const account = await request("/api/management/accounts", { method: "POST", body: JSON.stringify({ name: "测试账户", type: "cash", openingBalance: 0 }) });
  const management = await request("/api/management");
  assert.ok(management.accounts.some((row) => row.id === account.id));
  const accountRecord = await request("/api/transactions", { method: "POST", body: JSON.stringify({ date: "2026-08-11", amount: 3, direction: "expense", item: "账户测试", category1: "其他", category2: "测试", accountId: account.id }) });
  assert.equal(accountRecord.records[0].accountId, account.id);
  assert.equal((await request(`/api/transactions?query=账户测试&page=1&pageSize=20`)).records[0].accountName, "测试账户");

  const sourceCategory = await request("/api/management/categories", { method: "POST", body: JSON.stringify({ category1: "测试管理", category2: "来源" }) });
  const targetCategory = await request("/api/management/categories", { method: "POST", body: JSON.stringify({ category1: "测试管理", category2: "目标" }) });
  const managedRecord = await request("/api/transactions", { method: "POST", body: JSON.stringify({ date: "2026-08-11", amount: 4, direction: "expense", item: "分类生命周期测试", category1: "测试管理", category2: "来源" }) });
  const renamed = await request(`/api/management/categories/${sourceCategory.id}`, { method: "PATCH", body: JSON.stringify({ category1: "测试管理", category2: "已改名" }) });
  assert.equal(renamed.updatedTransactions, 1);
  assert.equal((await request("/api/transactions?query=分类生命周期测试&page=1&pageSize=20")).records[0].category2, "已改名");
  const blockedDelete = await requestError(`/api/management/categories/${sourceCategory.id}`, { method: "DELETE" });
  assert.equal(blockedDelete.status, 400);
  assert.match(JSON.stringify(blockedDelete.body), /仍被 1 笔账目使用/);
  const merged = await request(`/api/management/categories/${sourceCategory.id}/merge`, { method: "POST", body: JSON.stringify({ targetId: targetCategory.id }) });
  assert.equal(merged.updatedTransactions, 1);
  assert.equal((await request("/api/transactions?query=分类生命周期测试&page=1&pageSize=20")).records[0].category2, "目标");
  const lifecycleOverview = await request("/api/management");
  assert.equal(lifecycleOverview.categories.find((row) => row.id === sourceCategory.id).mergedIntoId, targetCategory.id);
  assert.equal((await request(`/api/management/categories/${sourceCategory.id}`, { method: "DELETE" })).ok, true);
  await request(`/api/transactions/${managedRecord.records[0].id}`, { method: "DELETE" });
  assert.equal((await request(`/api/management/categories/${targetCategory.id}`, { method: "DELETE" })).ok, true);

  await request("/api/management/categories", { method: "POST", body: JSON.stringify({ category1: "待改一级", category2: "子类" }) });
  const primaryRename = await request("/api/management/categories/primary/rename", { method: "PATCH", body: JSON.stringify({ from: "待改一级", to: "已改一级" }) });
  assert.equal(primaryRename.categories, 1);
  const primaryDelete = await request(`/api/management/categories/primary/${encodeURIComponent("已改一级")}`, { method: "DELETE" });
  assert.equal(primaryDelete.deleted, 1);

  console.log("Smoke test passed: PostgreSQL health, profiles, CRUD, summaries, custom range, classification lifecycle, accounts, filtering, pagination, parser");
} finally {
  await app.close();
  const cleanup = new PrismaClient();
  await cleanup.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await cleanup.$disconnect();
  rmSync(testDataDir, { recursive: true, force: true });
}
