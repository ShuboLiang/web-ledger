import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js"

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`)
const shanghaiMonth = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).format(new Date())

type ShoppingDb = Prisma.TransactionClient
type ShoppingStore = PrismaService | ShoppingDb
type MoneyRow = {
  id: string
  month: Date
  name: string
  amount: Prisma.Decimal | number
  note: string
}

export const SHOPPING_PROPOSAL_TYPES = [
  "shopping-income-create",
  "shopping-income-update",
  "shopping-income-delete",
  "shopping-income-copy",
  "shopping-item-create",
  "shopping-item-update",
  "shopping-item-delete",
] as const

@Injectable()
export class ShoppingService {
  constructor(private readonly prisma: PrismaService) {}

  private store(database?: ShoppingDb): ShoppingStore {
    return database || this.prisma
  }

  private async write<T>(
    database: ShoppingDb | undefined,
    fn: (db: ShoppingStore) => Promise<T>,
  ) {
    if (database) return fn(database)
    return this.prisma.$transaction((transaction) => fn(transaction))
  }

  private monthText(value: unknown, fallback = false) {
    const month = String(value || "").trim()
    if (!month && fallback) return shanghaiMonth()
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new BadRequestException("请填写有效月份")
    return month
  }

  private monthDate(month: string) {
    return asDate(`${month}-01`)
  }

  private addMonths(month: string, count: number) {
    const date = this.monthDate(month)
    date.setUTCMonth(date.getUTCMonth() + count)
    return date.toISOString().slice(0, 7)
  }

  private money(value: unknown, label: string, min: number) {
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount < min)
      throw new BadRequestException(
        min > 0 ? `${label}必须大于 0` : `${label}不能为负数`,
      )
    return Number(amount.toFixed(2))
  }

  private label(value: unknown, max: number, field: string) {
    const text = String(value ?? "").trim()
    if (!text) throw new BadRequestException(`请填写${field}`)
    return text.slice(0, max)
  }

  private note(value: unknown) {
    return String(value ?? "")
      .trim()
      .slice(0, 500)
  }

  private monthKey(value: Date) {
    return value.toISOString().slice(0, 7)
  }

  private status(income: number, planned: number) {
    const remaining = Number((income - planned).toFixed(2))
    const usageRate = income > 0 ? planned / income : planned > 0 ? 1 : 0
    return {
      income: Number(income.toFixed(2)),
      planned: Number(planned.toFixed(2)),
      remaining,
      usageRate,
      status: remaining < 0 ? "over" : usageRate >= 0.8 ? "warning" : "normal",
    }
  }

  private serializeMoney(row: MoneyRow) {
    return {
      id: row.id,
      month: this.monthKey(row.month),
      name: row.name,
      amount: Number(row.amount),
      note: row.note,
    }
  }

  private serializeItem(row: MoneyRow & { purchased: boolean }) {
    return {
      ...this.serializeMoney(row),
      purchased: row.purchased,
      subtotal: Number(row.amount),
    }
  }

  private sumAmount(rows: MoneyRow[]) {
    return Number(
      rows.reduce((total, row) => total + Number(row.amount), 0).toFixed(2),
    )
  }

  async overview(ledgerId: string, monthValue: unknown, horizonValue: unknown) {
    const month = this.monthText(monthValue, true)
    const horizon = Number(horizonValue)
    const months = Number.isFinite(horizon)
      ? Math.min(12, Math.max(1, Math.trunc(horizon)))
      : 6
    const start = this.monthDate(month)
    const end = this.monthDate(this.addMonths(month, months))
    const [allIncomes, allItems] = await Promise.all([
      this.prisma.shoppingIncome.findMany({
        where: { ledgerId, month: { gte: start, lt: end } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.shoppingItem.findMany({
        where: { ledgerId, month: { gte: start, lt: end } },
        orderBy: { createdAt: "desc" },
      }),
    ])
    const incomeByMonth = new Map<string, number>()
    const plannedByMonth = new Map<string, number>()
    for (const row of allIncomes) {
      const key = this.monthKey(row.month)
      incomeByMonth.set(key, (incomeByMonth.get(key) || 0) + Number(row.amount))
    }
    for (const row of allItems) {
      const key = this.monthKey(row.month)
      plannedByMonth.set(
        key,
        (plannedByMonth.get(key) || 0) + Number(row.amount),
      )
    }
    const incomes = allIncomes
      .filter((row) => this.monthKey(row.month) === month)
      .map((row) => this.serializeMoney(row))
    const items = allItems
      .filter((row) => this.monthKey(row.month) === month)
      .map((row) => this.serializeItem(row))
    const monthItems = allItems.filter(
      (row) => this.monthKey(row.month) === month,
    )
    const pendingItems = monthItems.filter((row) => !row.purchased)
    const purchasedItems = monthItems.filter((row) => row.purchased)
    const current = this.status(
      incomeByMonth.get(month) || 0,
      plannedByMonth.get(month) || 0,
    )
    return {
      month,
      incomeCount: incomes.length,
      itemCount: items.length,
      purchasedCount: items.filter((row) => row.purchased).length,
      incomes,
      items,
      summary: {
        pendingTotal: this.sumAmount(pendingItems),
        purchasedTotal: this.sumAmount(purchasedItems),
        total: this.sumAmount(monthItems),
        pendingCount: pendingItems.length,
        purchasedCount: purchasedItems.length,
      },
      months: Array.from({ length: months }, (_, index) => {
        const key = this.addMonths(month, index)
        const monthIncomes = allIncomes
          .filter((row) => this.monthKey(row.month) === key)
          .map((row) => this.serializeMoney(row))
        const monthItems = allItems
          .filter((row) => this.monthKey(row.month) === key)
          .map((row) => this.serializeItem(row))
        return {
          month: key,
          incomeCount: monthIncomes.length,
          itemCount: monthItems.length,
          purchasedCount: monthItems.filter((item) => item.purchased).length,
          incomes: monthIncomes,
          items: monthItems,
          ...this.status(
            incomeByMonth.get(key) || 0,
            plannedByMonth.get(key) || 0,
          ),
        }
      }),
      ...current,
    }
  }

  async agentOverview(
    ledgerId: string,
    monthValue: unknown,
    horizonValue: unknown,
  ) {
    const data = await this.overview(ledgerId, monthValue, horizonValue)
    return {
      month: data.month,
      income: data.income,
      planned: data.planned,
      remaining: data.remaining,
      status: data.status,
      usageRate: data.usageRate,
      incomeCount: data.incomeCount,
      itemCount: data.itemCount,
      purchasedCount: data.purchasedCount,
      incomes: data.incomes,
      items: data.items,
      months: data.months.map((row) => ({
        month: row.month,
        income: row.income,
        planned: row.planned,
        remaining: row.remaining,
        status: row.status,
        incomeCount: row.incomeCount,
        itemCount: row.itemCount,
        purchasedCount: row.purchasedCount,
      })),
    }
  }

  private lineInput(body: Record<string, unknown>, amountLabel: string) {
    return {
      month: this.monthText(body.month, true),
      name: this.label(body.name, 80, "名称"),
      amount: this.money(body.amount, amountLabel, 0.01),
      note: this.note(body.note),
    }
  }

  async createIncome(
    ledgerId: string,
    body: Record<string, unknown>,
    database?: ShoppingDb,
  ) {
    const value = this.lineInput(body, "收入金额")
    const row = await this.write(database, async (db) => {
      const created = await db.shoppingIncome.create({
        data: {
          ledgerId,
          month: this.monthDate(value.month),
          name: value.name,
          amount: new Prisma.Decimal(value.amount),
          note: value.note,
        },
      })
      await db.auditLog.create({
        data: {
          action: "shopping-income-create",
          entityType: "shopping-income",
          entityId: created.id,
          payload: value,
        },
      })
      return created
    })
    return this.serializeMoney(row)
  }

  async copyPreviousIncomes(
    ledgerId: string,
    body: Record<string, unknown>,
    database?: ShoppingDb,
  ) {
    const month = this.monthText(body.month, true)
    const previous = this.addMonths(month, -1)
    const db = this.store(database)
    const [source, existing] = await Promise.all([
      db.shoppingIncome.findMany({
        where: { ledgerId, month: this.monthDate(previous) },
        orderBy: { createdAt: "asc" },
      }),
      db.shoppingIncome.count({
        where: { ledgerId, month: this.monthDate(month) },
      }),
    ])
    if (!source.length)
      throw new BadRequestException(`${previous} 没有收入可复制`)
    if (existing)
      throw new BadRequestException("本月已有收入，请直接改金额或添加其他收入")
    const copied = await this.write(database, async (tx) => {
      const rows = await Promise.all(
        source.map((item) =>
          tx.shoppingIncome.create({
            data: {
              ledgerId,
              month: this.monthDate(month),
              name: item.name,
              amount: item.amount,
              note: item.note,
            },
          }),
        ),
      )
      await tx.auditLog.create({
        data: {
          action: "shopping-income-copy",
          entityType: "shopping-income",
          entityId: ledgerId,
          payload: { month, from: previous, copied: rows.length },
        },
      })
      return rows
    })
    return {
      month,
      from: previous,
      copied: copied.length,
      incomes: copied.map((row) => this.serializeMoney(row)),
    }
  }

  private async income(
    ledgerId: string,
    id: string,
    db: ShoppingStore = this.prisma,
  ) {
    const row = await db.shoppingIncome.findFirst({
      where: { id, ledgerId },
    })
    if (!row) throw new NotFoundException("收入记录不存在")
    return row
  }

  async getIncome(ledgerId: string, id: string) {
    return this.serializeMoney(await this.income(ledgerId, id))
  }

  async updateIncome(
    ledgerId: string,
    id: string,
    body: Record<string, unknown>,
    database?: ShoppingDb,
  ) {
    const current = await this.income(ledgerId, id, this.store(database))
    const month =
      body.month === undefined
        ? this.monthKey(current.month)
        : this.monthText(body.month)
    const name =
      body.name === undefined ? current.name : this.label(body.name, 80, "名称")
    const amount =
      body.amount === undefined
        ? Number(current.amount)
        : this.money(body.amount, "收入金额", 0.01)
    const note = body.note === undefined ? current.note : this.note(body.note)
    const row = await this.write(database, async (db) => {
      const updated = await db.shoppingIncome.update({
        where: { id },
        data: {
          month: this.monthDate(month),
          name,
          amount: new Prisma.Decimal(amount),
          note,
        },
      })
      await db.auditLog.create({
        data: {
          action: "shopping-income-update",
          entityType: "shopping-income",
          entityId: id,
          payload: { month, name, amount, note },
        },
      })
      return updated
    })
    return this.serializeMoney(row)
  }

  async removeIncome(ledgerId: string, id: string, database?: ShoppingDb) {
    const current = await this.income(ledgerId, id, this.store(database))
    await this.write(database, async (db) => {
      await db.shoppingIncome.delete({ where: { id } })
      await db.auditLog.create({
        data: {
          action: "shopping-income-delete",
          entityType: "shopping-income",
          entityId: id,
          payload: {
            month: this.monthKey(current.month),
            name: current.name,
            amount: Number(current.amount),
          },
        },
      })
    })
    return { id, deleted: true }
  }

  async createItem(
    ledgerId: string,
    body: Record<string, unknown>,
    database?: ShoppingDb,
  ) {
    const value = this.lineInput(body, "物品价格")
    const item = await this.write(database, async (db) => {
      const row = await db.shoppingItem.create({
        data: {
          ledgerId,
          month: this.monthDate(value.month),
          name: value.name,
          amount: new Prisma.Decimal(value.amount),
          note: value.note,
        },
      })
      await db.auditLog.create({
        data: {
          action: "shopping-item-create",
          entityType: "shopping-item",
          entityId: row.id,
          payload: value,
        },
      })
      return row
    })
    return this.serializeItem(item)
  }

  private async item(
    ledgerId: string,
    id: string,
    db: ShoppingStore = this.prisma,
  ) {
    const row = await db.shoppingItem.findFirst({
      where: { id, ledgerId },
    })
    if (!row) throw new NotFoundException("购物清单项目不存在")
    return row
  }

  async getItem(ledgerId: string, id: string) {
    return this.serializeItem(await this.item(ledgerId, id))
  }

  async updateItem(
    ledgerId: string,
    id: string,
    body: Record<string, unknown>,
    database?: ShoppingDb,
  ) {
    const current = await this.item(ledgerId, id, this.store(database))
    const month =
      body.month === undefined
        ? this.monthKey(current.month)
        : this.monthText(body.month)
    const name =
      body.name === undefined
        ? current.name
        : this.label(body.name, 80, "物品名称")
    const amount =
      body.amount === undefined
        ? Number(current.amount)
        : this.money(body.amount, "物品价格", 0.01)
    const note = body.note === undefined ? current.note : this.note(body.note)
    const purchased =
      body.purchased === undefined ? current.purchased : body.purchased === true
    const item = await this.write(database, async (db) => {
      const row = await db.shoppingItem.update({
        where: { id },
        data: {
          month: this.monthDate(month),
          name,
          amount: new Prisma.Decimal(amount),
          note,
          purchased,
        },
      })
      await db.auditLog.create({
        data: {
          action: "shopping-item-update",
          entityType: "shopping-item",
          entityId: id,
          payload: { month, name, amount, note, purchased },
        },
      })
      return row
    })
    return this.serializeItem(item)
  }

  async removeItem(ledgerId: string, id: string, database?: ShoppingDb) {
    const current = await this.item(ledgerId, id, this.store(database))
    await this.write(database, async (db) => {
      await db.shoppingItem.delete({ where: { id } })
      await db.auditLog.create({
        data: {
          action: "shopping-item-delete",
          entityType: "shopping-item",
          entityId: id,
          payload: {
            month: this.monthKey(current.month),
            name: current.name,
            amount: Number(current.amount),
          },
        },
      })
    })
    return { id, deleted: true }
  }

  private validatePlan(body: Record<string, unknown>, partial = false) {
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new BadRequestException("请填写购物计划")
    const data: {
      name?: string
      unitPrice?: Prisma.Decimal
      quantity?: number
      note?: string
      purchased?: boolean
    } = {}
    if (!partial || "name" in body) {
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.trim().length > 80
      )
        throw new BadRequestException("物品名称需为 1–80 个字")
      data.name = body.name.trim()
    }
    if (!partial || "unitPrice" in body) {
      const value = body.unitPrice
      if (
        (typeof value !== "number" && typeof value !== "string") ||
        !/^\d+(\.\d{1,2})?$/.test(String(value)) ||
        !Number.isFinite(Number(value)) ||
        Number(value) > 99999999.99
      )
        throw new BadRequestException(
          "预计单价需在 0–99999999.99 元之间，最多两位小数",
        )
      data.unitPrice = new Prisma.Decimal(String(value))
    }
    if (!partial || "quantity" in body) {
      const value = body.quantity === undefined ? 1 : body.quantity
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > 9999
      )
        throw new BadRequestException("数量需为 1–9999 的整数")
      data.quantity = value
    }
    if ("note" in body) {
      if (typeof body.note !== "string" || body.note.length > 500)
        throw new BadRequestException("备注不能超过 500 个字")
      data.note = body.note.trim()
    }
    if ("purchased" in body) {
      if (typeof body.purchased !== "boolean")
        throw new BadRequestException("购买状态无效")
      data.purchased = body.purchased
    }
    if (partial && !Object.keys(data).length)
      throw new BadRequestException("请提供要修改的内容")
    return data
  }

  async create(ledgerId: string, body: Record<string, unknown>) {
    const data = this.validatePlan(body)
    const subtotal = data.unitPrice!.mul(data.quantity!)
    const row = await this.prisma.shoppingItem.create({
      data: {
        ledgerId,
        month: this.monthDate(shanghaiMonth()),
        name: data.name!,
        unitPrice: data.unitPrice!,
        quantity: data.quantity!,
        amount: subtotal,
        note: data.note ?? "",
        purchased: data.purchased ?? false,
      },
    })
    return { id: row.id }
  }

  async update(ledgerId: string, id: string, body: Record<string, unknown>) {
    const data = this.validatePlan(body, true)
    const current = await this.item(ledgerId, id)
    const unitPrice = data.unitPrice ?? current.unitPrice
    const quantity = data.quantity ?? current.quantity
    await this.prisma.shoppingItem.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        unitPrice,
        quantity,
        amount: unitPrice.mul(quantity),
        ...(data.note !== undefined ? { note: data.note } : {}),
        ...(data.purchased !== undefined ? { purchased: data.purchased } : {}),
      },
    })
    return { ok: true }
  }

  async remove(ledgerId: string, id: string) {
    await this.item(ledgerId, id)
    await this.prisma.shoppingItem.delete({ where: { id } })
    return { ok: true }
  }

  async executeAiProposal(
    ledgerId: string,
    proposal: any,
    database: ShoppingDb,
  ) {
    if (proposal?.type === "shopping-income-create")
      return {
        type: proposal.type,
        income: await this.createIncome(
          ledgerId,
          proposal.shoppingIncome || {},
          database,
        ),
      }
    if (proposal?.type === "shopping-income-update")
      return {
        type: proposal.type,
        income: await this.updateIncome(
          ledgerId,
          String(proposal.incomeId || ""),
          proposal.changes || {},
          database,
        ),
      }
    if (proposal?.type === "shopping-income-delete")
      return {
        type: proposal.type,
        result: await this.removeIncome(
          ledgerId,
          String(proposal.incomeId || ""),
          database,
        ),
      }
    if (proposal?.type === "shopping-income-copy")
      return {
        type: proposal.type,
        result: await this.copyPreviousIncomes(
          ledgerId,
          { month: proposal.month },
          database,
        ),
      }
    if (proposal?.type === "shopping-item-create")
      return {
        type: proposal.type,
        item: await this.createItem(
          ledgerId,
          proposal.shoppingItem || {},
          database,
        ),
      }
    if (proposal?.type === "shopping-item-update")
      return {
        type: proposal.type,
        item: await this.updateItem(
          ledgerId,
          String(proposal.itemId || ""),
          proposal.changes || {},
          database,
        ),
      }
    if (proposal?.type === "shopping-item-delete")
      return {
        type: proposal.type,
        result: await this.removeItem(
          ledgerId,
          String(proposal.itemId || ""),
          database,
        ),
      }
    throw new Error("包含未知操作")
  }
}
