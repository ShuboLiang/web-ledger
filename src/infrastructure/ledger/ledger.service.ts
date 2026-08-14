import { Injectable, Scope } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { normalizeRecord } from "../../../lib/db.mjs"
import { CurrentUserService } from "../../modules/auth/current-user.service.js"
import { PrismaService } from "../prisma/prisma.service.js"

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`)
const dateText = (value: Date) => value.toISOString().slice(0, 10)
const clean = (value: unknown, max = 80) =>
  String(value ?? "")
    .trim()
    .slice(0, max)
const cleanIcon = (value: unknown, fallback: string) => {
  const icon = clean(value, 40)
  return /^[a-z0-9-]{1,40}$/.test(icon) ? icon : fallback
}
type LedgerDatabase = Prisma.TransactionClient

@Injectable({ scope: Scope.REQUEST })
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserService,
  ) {}

  get path() {
    try {
      const url = new URL(process.env.DATABASE_URL || "")
      return `postgresql://${url.hostname}:${url.port || "5432"}${url.pathname}`
    } catch {
      return "postgresql"
    }
  }

  async context() {
    return this.contextWith(this.prisma)
  }

  private async contextWith(database: PrismaService | LedgerDatabase) {
    const ledgerId = this.currentUser.ledgerId
    let account = await database.account.findFirst({
      where: { ledgerId },
      orderBy: { sortOrder: "asc" },
    })
    account ||= await database.account.create({
      data: { ledgerId, name: "默认账户", type: "cash" },
    })
    return { ledgerId, accountId: account.id }
  }

  private serialize(row: any) {
    return {
      ...row,
      date: dateText(row.date),
      amount: Number(row.amount),
      accountName: row.account?.name || "未指定",
      primaryIcon: row.category?.primaryIcon,
      secondaryIcon: row.category?.secondaryIcon,
      account: undefined,
      category: undefined,
      created_at: row.createdAt?.toISOString?.() || row.createdAt,
      createdAt: undefined,
      updatedAt: undefined,
      ledgerId: undefined,
    }
  }

  private async inheritedPrimaryIcon(
    database: LedgerDatabase,
    ledgerId: string,
    category1: string,
    fallback = "folder",
  ) {
    const sibling = await database.category.findFirst({
      where: { ledgerId, category1 },
      select: { primaryIcon: true },
      orderBy: { createdAt: "asc" },
    })
    return sibling?.primaryIcon || fallback
  }

  async allTransactions() {
    const { ledgerId } = await this.context()
    const rows = await this.prisma.transaction.findMany({
      where: { ledgerId },
      include: {
        account: { select: { name: true } },
        category: { select: { primaryIcon: true, secondaryIcon: true } },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    })
    return rows.map((row) => this.serialize(row))
  }

  async listTransactions(limit: string | number | null = 100) {
    const { ledgerId } = await this.context()
    const take = Math.min(Math.max(Number(limit) || 100, 1), 500)
    const rows = await this.prisma.transaction.findMany({
      where: { ledgerId },
      include: {
        account: { select: { name: true } },
        category: { select: { primaryIcon: true, secondaryIcon: true } },
      },
      take,
      orderBy: [{ date: "desc" }, { id: "desc" }],
    })
    return rows.map((row) => this.serialize(row))
  }

  async pageTransactions({
    page = 1,
    pageSize = 20,
    date = "",
    month = "",
    start = "",
    end = "",
    query = "",
    category1 = "",
    category2 = "",
    direction = "",
    sortBy = "date",
    sortOrder = "desc",
    accountId = "",
  }: Record<string, unknown> = {}) {
    const { ledgerId } = await this.context()
    const take = Math.min(Math.max(Number(pageSize) || 20, 1), 100)
    const selectedDate = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(
      String(date),
    )
      ? String(date)
      : ""
    const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))
      ? String(month)
      : ""
    const selectedStart = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(
      String(start),
    )
      ? String(start)
      : ""
    const selectedEnd = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(
      String(end),
    )
      ? String(end)
      : ""
    const search = clean(query, 80)
    const primary = clean(category1, 40)
    const secondary = clean(category2, 40)
    const selectedDirection = ["expense", "income"].includes(String(direction))
      ? String(direction)
      : ""
    const where: Prisma.TransactionWhereInput = { ledgerId }
    if (selectedDate) {
      const [year, monthNumber, day] = selectedDate.split("-").map(Number)
      where.date = {
        gte: new Date(Date.UTC(year, monthNumber - 1, day)),
        lt: new Date(Date.UTC(year, monthNumber - 1, day + 1)),
      }
    } else if (selectedMonth) {
      const [year, monthNumber] = selectedMonth.split("-").map(Number)
      where.date = {
        gte: new Date(Date.UTC(year, monthNumber - 1, 1)),
        lt: new Date(Date.UTC(year, monthNumber, 1)),
      }
    } else if (selectedStart && selectedEnd && selectedStart <= selectedEnd) {
      const [startYear, startMonth, startDay] = selectedStart
        .split("-")
        .map(Number)
      const [endYear, endMonth, endDay] = selectedEnd.split("-").map(Number)
      where.date = {
        gte: new Date(Date.UTC(startYear, startMonth - 1, startDay)),
        lt: new Date(Date.UTC(endYear, endMonth - 1, endDay + 1)),
      }
    }
    if (search)
      where.OR = ["item", "note", "category1", "category2"].map((field) => ({
        [field]: { contains: search, mode: "insensitive" },
      })) as Prisma.TransactionWhereInput[]
    if (primary) where.category1 = primary
    if (secondary) where.category2 = secondary
    if (selectedDirection)
      where.amount = selectedDirection === "expense" ? { lt: 0 } : { gt: 0 }
    if (clean(accountId, 100)) where.accountId = clean(accountId, 100)
    const orderField = ["date", "amount", "item"].includes(String(sortBy))
      ? String(sortBy)
      : "date"
    const order = String(sortOrder).toLowerCase() === "asc" ? "asc" : "desc"
    const total = await this.prisma.transaction.count({ where })
    const totalPages = Math.max(1, Math.ceil(total / take))
    const current = Math.min(Math.max(Number(page) || 1, 1), totalPages)
    const rows = await this.prisma.transaction.findMany({
      where,
      include: {
        account: { select: { name: true } },
        category: { select: { primaryIcon: true, secondaryIcon: true } },
      },
      take,
      skip: (current - 1) * take,
      orderBy: [{ [orderField]: order }, { id: order }],
    })
    return {
      records: rows.map((row) => this.serialize(row)),
      total,
      page: current,
      pageSize: take,
      totalPages,
      date: selectedDate,
      month: selectedMonth,
      start: selectedStart,
      end: selectedEnd,
      query: search,
      category1: primary,
      category2: secondary,
      direction: selectedDirection,
      sortBy: orderField,
      sortOrder: order,
    }
  }

  async get(id: string | number) {
    const { ledgerId } = await this.context()
    const row = await this.prisma.transaction.findFirst({
      where: { id: Number(id), ledgerId },
      include: {
        account: { select: { name: true } },
        category: { select: { primaryIcon: true, secondaryIcon: true } },
      },
    })
    return row ? this.serialize(row) : null
  }

  async dictionaries() {
    const { ledgerId } = await this.context()
    const [projects, categories, accounts] = await Promise.all([
      this.prisma.project.findMany({
        where: { ledgerId, enabled: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.category.findMany({
        where: { ledgerId, enabled: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.account.findMany({
        where: { ledgerId, enabled: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ])
    return {
      projects: projects.map((row) => row.name),
      categories: categories.map(({ category1, category2, primaryIcon, secondaryIcon }) => ({
        category1,
        category2,
        primaryIcon,
        secondaryIcon,
      })),
      accounts: accounts.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
      })),
    }
  }

  private async addManyWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    defaultAccountId: string,
    records: any[],
  ) {
    const normalized = records.map((record) => ({
      ...normalizeRecord(record),
      accountId: clean(record?.accountId, 100),
      primaryIcon: cleanIcon(record?.primaryIcon, "folder"),
      secondaryIcon: cleanIcon(record?.secondaryIcon, "tag"),
    }))
    const created: any[] = []
    for (const record of normalized) {
      await database.project.upsert({
        where: { ledgerId_name: { ledgerId, name: record.item } },
        update: { enabled: true },
        create: { ledgerId, name: record.item },
      })
      const primaryIcon = await this.inheritedPrimaryIcon(
        database,
        ledgerId,
        record.category1,
        record.primaryIcon,
      )
      const category = await database.category.upsert({
        where: {
          ledgerId_category1_category2: {
            ledgerId,
            category1: record.category1,
            category2: record.category2,
          },
        },
        update: { enabled: true },
        create: {
          ledgerId,
          category1: record.category1,
          category2: record.category2,
          primaryIcon,
          secondaryIcon: record.secondaryIcon,
        },
      })
      const row = await database.transaction.create({
        data: {
          ledgerId,
          categoryId: category.id,
          accountId: record.accountId || defaultAccountId,
          date: asDate(record.date),
          amount: new Prisma.Decimal(record.amount),
          item: record.item,
          category1: record.category1,
          category2: record.category2,
          note: record.note,
        },
        include: {
          account: { select: { name: true } },
          category: { select: { primaryIcon: true, secondaryIcon: true } },
        },
      })
      created.push(this.serialize(row))
      await database.auditLog.create({
        data: {
          action: "create",
          entityType: "transaction",
          entityId: String(row.id),
          payload: record,
        },
      })
    }
    return created
  }

  async addMany(records: unknown[]) {
    const { ledgerId, accountId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.addManyWithDatabase(database, ledgerId, accountId, records as any[]),
    )
  }

  async update(id: string | number, changes: any) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.updateWithDatabase(database, ledgerId, id, changes),
    )
  }

  private async updateWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    id: string | number,
    changes: any,
  ) {
    const existingRow = await database.transaction.findFirst({
      where: { id: Number(id), ledgerId },
      include: { account: { select: { name: true } } },
    })
    const existing = existingRow ? this.serialize(existingRow) : null
    if (!existing) throw new Error(`未找到编号为 ${id} 的账目`)
    const merged = normalizeRecord({
      ...existing,
      ...changes,
      amount: changes.amount ?? Math.abs(existing.amount),
      direction:
        changes.direction ?? (existing.amount > 0 ? "income" : "expense"),
    })
    await database.project.upsert({
      where: { ledgerId_name: { ledgerId, name: merged.item } },
      update: { enabled: true },
      create: { ledgerId, name: merged.item },
    })
    const primaryIcon = await this.inheritedPrimaryIcon(
      database,
      ledgerId,
      merged.category1,
      cleanIcon(changes?.primaryIcon, "folder"),
    )
    const category = await database.category.upsert({
      where: {
        ledgerId_category1_category2: {
          ledgerId,
          category1: merged.category1,
          category2: merged.category2,
        },
      },
      update: { enabled: true },
      create: {
        ledgerId,
        category1: merged.category1,
        category2: merged.category2,
        primaryIcon,
        secondaryIcon: cleanIcon(changes?.secondaryIcon, "tag"),
      },
    })
    const row = await database.transaction.update({
      where: { id: Number(id) },
      data: {
        categoryId: category.id,
        date: asDate(merged.date),
        amount: new Prisma.Decimal(merged.amount),
        item: merged.item,
        category1: merged.category1,
        category2: merged.category2,
        note: merged.note,
        ...(changes.accountId ? { accountId: changes.accountId } : {}),
      },
      include: {
        account: { select: { name: true } },
        category: { select: { primaryIcon: true, secondaryIcon: true } },
      },
    })
    await database.auditLog.create({
      data: {
        action: "update",
        entityType: "transaction",
        entityId: String(id),
        payload: changes,
      },
    })
    return this.serialize(row)
  }

  async bulkCategorize(
    ids: number[],
    changes: { category1: string; category2: string },
  ) {
    const { ledgerId } = await this.context()
    const category1 = clean(changes.category1, 40),
      category2 = clean(changes.category2, 40)
    if (!category1 || !category2 || !ids.length)
      throw new Error("请选择账目和分类")
    return this.prisma.$transaction(async (database) => {
      const primaryIcon = await this.inheritedPrimaryIcon(
        database,
        ledgerId,
        category1,
      )
      const category = await database.category.upsert({
        where: {
          ledgerId_category1_category2: { ledgerId, category1, category2 },
        },
        update: { enabled: true },
        create: { ledgerId, category1, category2, primaryIcon },
      })
      const result = await database.transaction.updateMany({
        where: { ledgerId, id: { in: ids.map(Number) } },
        data: { categoryId: category.id, category1, category2 },
      })
      await database.auditLog.create({
        data: {
          action: "bulk-categorize",
          entityType: "transaction",
          payload: { ids, category1, category2 },
        },
      })
      return result.count
    })
  }

  async delete(id: string | number) {
    const { ledgerId } = await this.context()
    return this.prisma.$transaction((database) =>
      this.deleteWithDatabase(database, ledgerId, id),
    )
  }

  private async deleteWithDatabase(
    database: LedgerDatabase,
    ledgerId: string,
    id: string | number,
  ) {
    const result = await database.transaction.deleteMany({
      where: { id: Number(id), ledgerId },
    })
    if (result.count)
      await database.auditLog.create({
        data: {
          action: "delete",
          entityType: "transaction",
          entityId: String(id),
        },
      })
    return result.count
  }

  async executeAiOperations(
    operations: any[],
    database?: LedgerDatabase,
  ): Promise<any[]> {
    if (!database)
      return this.prisma.$transaction((transaction) =>
        this.executeAiOperations(operations, transaction),
      )
    const { ledgerId, accountId } = await this.contextWith(database)
    const results: any[] = []
    for (const proposal of operations) {
      if (proposal?.type === "create")
        results.push({
          type: "create",
          records: await this.addManyWithDatabase(
            database,
            ledgerId,
            accountId,
            proposal.records || [],
          ),
        })
      else if (proposal?.type === "update")
        results.push({
          type: "update",
          record: await this.updateWithDatabase(
            database,
            ledgerId,
            proposal.id,
            proposal.changes || {},
          ),
        })
      else if (proposal?.type === "delete")
        results.push({
          type: "delete",
          id: proposal.id,
          deleted: Boolean(
            await this.deleteWithDatabase(database, ledgerId, proposal.id),
          ),
        })
      else if (proposal?.type === "category-icon") {
        const category1 = clean(proposal.category1, 40)
        const category2 = clean(proposal.category2, 40)
        const icon = cleanIcon(proposal.icon, "")
        if (!category1 || !icon) throw new Error("分类图标操作内容无效")
        if (category2) {
          const category = await database.category.findFirst({
            where: { ledgerId, category1, category2 },
          })
          if (!category) throw new Error(`分类“${category1} / ${category2}”不存在`)
          await database.category.update({
            where: { id: category.id },
            data: { secondaryIcon: icon },
          })
          await database.auditLog.create({
            data: {
              action: "ai-category-secondary-icon-update",
              entityType: "category",
              entityId: category.id,
              payload: { category1, category2, icon },
            },
          })
          results.push({ type: "category-icon", category1, category2, icon })
        } else {
          const updated = await database.category.updateMany({
            where: { ledgerId, category1 },
            data: { primaryIcon: icon },
          })
          if (!updated.count) throw new Error(`一级分类“${category1}”不存在`)
          await database.auditLog.create({
            data: {
              action: "ai-category-primary-icon-update",
              entityType: "category",
              payload: { category1, icon, categories: updated.count },
            },
          })
          results.push({
            type: "category-icon",
            category1,
            icon,
            updated: updated.count,
          })
        }
      }
      else throw new Error("包含未知操作")
    }
    return results
  }
}
