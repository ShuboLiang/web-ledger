import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeRecord } from "../../../lib/db.mjs";
import { PrismaService } from "../prisma/prisma.service.js";

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateText = (value: Date) => value.toISOString().slice(0, 10);
const clean = (value: unknown, max = 80) => String(value ?? "").trim().slice(0, max);

@Injectable()
export class LedgerService {
  private readonly ready: Promise<{ ledgerId: string; accountId: string }>;

  constructor(private readonly prisma: PrismaService) {
    this.ready = this.initialize();
  }

  get path() {
    try {
      const url = new URL(process.env.DATABASE_URL || "");
      return `postgresql://${url.hostname}:${url.port || "5432"}${url.pathname}`;
    } catch { return "postgresql"; }
  }

  private async initialize() {
    await this.prisma.$connect();
    let ledger = await this.prisma.ledger.findFirst({ where: { isDefault: true } });
    ledger ||= await this.prisma.ledger.create({ data: { name: "主账本", isDefault: true } });
    let account = await this.prisma.account.findFirst({ where: { ledgerId: ledger.id }, orderBy: { sortOrder: "asc" } });
    account ||= await this.prisma.account.create({ data: { ledgerId: ledger.id, name: "默认账户", type: "cash" } });
    const count = await this.prisma.transaction.count({ where: { ledgerId: ledger.id } });
    if (count === 0 && process.env.NO_SEED !== "1") {
      const seedPath = path.resolve(process.env.INITIAL_LEDGER_PATH || path.join(process.cwd(), "data", "initial-ledger.json"));
      const records = JSON.parse(readFileSync(seedPath, "utf8"));
      await this.addManyInternal(ledger.id, account.id, records);
    }
    return { ledgerId: ledger.id, accountId: account.id };
  }

  private serialize(row: any) {
    return { ...row, date: dateText(row.date), amount: Number(row.amount), accountName: row.account?.name || "未指定", account: undefined, created_at: row.createdAt?.toISOString?.() || row.createdAt, createdAt: undefined, updatedAt: undefined, ledgerId: undefined };
  }

  async allTransactions() {
    const { ledgerId } = await this.ready;
    const rows = await this.prisma.transaction.findMany({ where: { ledgerId }, include: { account: { select: { name: true } } }, orderBy: [{ date: "desc" }, { id: "desc" }] });
    return rows.map((row) => this.serialize(row));
  }

  async listTransactions(limit: string | number | null = 100) {
    const { ledgerId } = await this.ready;
    const take = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const rows = await this.prisma.transaction.findMany({ where: { ledgerId }, include: { account: { select: { name: true } } }, take, orderBy: [{ date: "desc" }, { id: "desc" }] });
    return rows.map((row) => this.serialize(row));
  }

  async pageTransactions({ page = 1, pageSize = 20, month = "", query = "", category1 = "", category2 = "", direction = "", sortBy = "date", sortOrder = "desc", accountId = "" }: Record<string, unknown> = {}) {
    const { ledgerId } = await this.ready;
    const take = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)) ? String(month) : "";
    const search = clean(query, 80);
    const primary = clean(category1, 40);
    const secondary = clean(category2, 40);
    const selectedDirection = ["expense", "income"].includes(String(direction)) ? String(direction) : "";
    const where: Prisma.TransactionWhereInput = { ledgerId };
    if (selectedMonth) {
      const [year, monthNumber] = selectedMonth.split("-").map(Number);
      where.date = { gte: new Date(Date.UTC(year, monthNumber - 1, 1)), lt: new Date(Date.UTC(year, monthNumber, 1)) };
    }
    if (search) where.OR = ["item", "note", "category1", "category2"].map((field) => ({ [field]: { contains: search, mode: "insensitive" } })) as Prisma.TransactionWhereInput[];
    if (primary) where.category1 = primary;
    if (secondary) where.category2 = secondary;
    if (selectedDirection) where.amount = selectedDirection === "expense" ? { lt: 0 } : { gt: 0 };
    if (clean(accountId, 100)) where.accountId = clean(accountId, 100);
    const orderField = ["date", "amount", "item"].includes(String(sortBy)) ? String(sortBy) : "date";
    const order = String(sortOrder).toLowerCase() === "asc" ? "asc" : "desc";
    const total = await this.prisma.transaction.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / take));
    const current = Math.min(Math.max(Number(page) || 1, 1), totalPages);
    const rows = await this.prisma.transaction.findMany({ where, include: { account: { select: { name: true } } }, take, skip: (current - 1) * take, orderBy: [{ [orderField]: order }, { id: order }] });
    return { records: rows.map((row) => this.serialize(row)), total, page: current, pageSize: take, totalPages, month: selectedMonth, query: search, category1: primary, category2: secondary, direction: selectedDirection, sortBy: orderField, sortOrder: order };
  }

  async get(id: string | number) {
    const { ledgerId } = await this.ready;
    const row = await this.prisma.transaction.findFirst({ where: { id: Number(id), ledgerId }, include: { account: { select: { name: true } } } });
    return row ? this.serialize(row) : null;
  }

  async dictionaries() {
    const { ledgerId } = await this.ready;
    const [projects, categories, accounts] = await Promise.all([
      this.prisma.project.findMany({ where: { ledgerId, enabled: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      this.prisma.category.findMany({ where: { ledgerId, enabled: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      this.prisma.account.findMany({ where: { ledgerId, enabled: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    ]);
    return { projects: projects.map((row) => row.name), categories: categories.map(({ category1, category2 }) => ({ category1, category2 })), accounts: accounts.map((row) => ({ id: row.id, name: row.name, type: row.type })) };
  }

  private async addManyInternal(ledgerId: string, defaultAccountId: string, records: any[]) {
    const normalized = records.map((record) => ({ ...normalizeRecord(record), accountId: clean(record?.accountId, 100) }));
    return this.prisma.$transaction(async (database) => {
      const created: any[] = [];
      for (const record of normalized) {
        await database.project.upsert({ where: { ledgerId_name: { ledgerId, name: record.item } }, update: { enabled: true }, create: { ledgerId, name: record.item } });
        const category = await database.category.upsert({ where: { ledgerId_category1_category2: { ledgerId, category1: record.category1, category2: record.category2 } }, update: { enabled: true }, create: { ledgerId, category1: record.category1, category2: record.category2 } });
        const row = await database.transaction.create({ data: { ledgerId, categoryId: category.id, accountId: record.accountId || defaultAccountId, date: asDate(record.date), amount: new Prisma.Decimal(record.amount), item: record.item, category1: record.category1, category2: record.category2, note: record.note } });
        created.push(this.serialize(row));
        await database.auditLog.create({ data: { action: "create", entityType: "transaction", entityId: String(row.id), payload: record } });
      }
      return created;
    });
  }

  async addMany(records: unknown[]) {
    const { ledgerId, accountId } = await this.ready;
    return this.addManyInternal(ledgerId, accountId, records as any[]);
  }

  async update(id: string | number, changes: any) {
    const { ledgerId } = await this.ready;
    const existing = await this.get(id);
    if (!existing) throw new Error(`未找到编号为 ${id} 的账目`);
    const merged = normalizeRecord({ ...existing, ...changes, amount: changes.amount ?? Math.abs(existing.amount), direction: changes.direction ?? (existing.amount > 0 ? "income" : "expense") });
    return this.prisma.$transaction(async (database) => {
      await database.project.upsert({ where: { ledgerId_name: { ledgerId, name: merged.item } }, update: { enabled: true }, create: { ledgerId, name: merged.item } });
      const category = await database.category.upsert({ where: { ledgerId_category1_category2: { ledgerId, category1: merged.category1, category2: merged.category2 } }, update: { enabled: true }, create: { ledgerId, category1: merged.category1, category2: merged.category2 } });
      const row = await database.transaction.update({ where: { id: Number(id) }, data: { categoryId: category.id, date: asDate(merged.date), amount: new Prisma.Decimal(merged.amount), item: merged.item, category1: merged.category1, category2: merged.category2, note: merged.note, ...(changes.accountId ? { accountId: changes.accountId } : {}) } });
      await database.auditLog.create({ data: { action: "update", entityType: "transaction", entityId: String(id), payload: changes } });
      return this.serialize(row);
    });
  }

  async bulkCategorize(ids: number[], changes: { category1: string; category2: string }) {
    const { ledgerId } = await this.ready;
    const category1 = clean(changes.category1, 40), category2 = clean(changes.category2, 40);
    if (!category1 || !category2 || !ids.length) throw new Error("请选择账目和分类");
    return this.prisma.$transaction(async (database) => {
      const category = await database.category.upsert({ where: { ledgerId_category1_category2: { ledgerId, category1, category2 } }, update: { enabled: true }, create: { ledgerId, category1, category2 } });
      const result = await database.transaction.updateMany({ where: { ledgerId, id: { in: ids.map(Number) } }, data: { categoryId: category.id, category1, category2 } });
      await database.auditLog.create({ data: { action: "bulk-categorize", entityType: "transaction", payload: { ids, category1, category2 } } });
      return result.count;
    });
  }

  async delete(id: string | number) {
    const { ledgerId } = await this.ready;
    return this.prisma.$transaction(async (database) => {
      const result = await database.transaction.deleteMany({ where: { id: Number(id), ledgerId } });
      if (result.count) await database.auditLog.create({ data: { action: "delete", entityType: "transaction", entityId: String(id) } });
      return result.count;
    });
  }

}
