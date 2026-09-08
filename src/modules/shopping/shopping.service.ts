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

type MoneyRow = {
  id: string
  month: Date
  name: string
  amount: Prisma.Decimal | number
  note: string
}

@Injectable()
export class ShoppingService {
  constructor(private readonly prisma: PrismaService) {}

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
    return { ...this.serializeMoney(row), purchased: row.purchased }
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
          purchasedCount: monthItems.filter((row) => row.purchased).length,
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

  private lineInput(body: Record<string, unknown>, amountLabel: string) {
    return {
      month: this.monthText(body.month, true),
      name: this.label(body.name, 80, "名称"),
      amount: this.money(body.amount, amountLabel, 0.01),
      note: this.note(body.note),
    }
  }

  async createIncome(ledgerId: string, body: Record<string, unknown>) {
    const value = this.lineInput(body, "收入金额")
    const row = await this.prisma.$transaction(async (database) => {
      const created = await database.shoppingIncome.create({
        data: {
          ledgerId,
          month: this.monthDate(value.month),
          name: value.name,
          amount: new Prisma.Decimal(value.amount),
          note: value.note,
        },
      })
      await database.auditLog.create({
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

  async copyPreviousIncomes(ledgerId: string, body: Record<string, unknown>) {
    const month = this.monthText(body.month, true)
    const previous = this.addMonths(month, -1)
    const [source, existing] = await Promise.all([
      this.prisma.shoppingIncome.findMany({
        where: { ledgerId, month: this.monthDate(previous) },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.shoppingIncome.count({
        where: { ledgerId, month: this.monthDate(month) },
      }),
    ])
    if (!source.length)
      throw new BadRequestException(`${previous} 没有收入可复制`)
    if (existing)
      throw new BadRequestException("本月已有收入，请直接改金额或添加其他收入")
    const copied = await this.prisma.$transaction(async (database) => {
      const rows = await Promise.all(
        source.map((item) =>
          database.shoppingIncome.create({
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
      await database.auditLog.create({
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

  private async income(ledgerId: string, id: string) {
    const row = await this.prisma.shoppingIncome.findFirst({
      where: { id, ledgerId },
    })
    if (!row) throw new NotFoundException("收入记录不存在")
    return row
  }

  async updateIncome(
    ledgerId: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    const current = await this.income(ledgerId, id)
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
    const row = await this.prisma.$transaction(async (database) => {
      const updated = await database.shoppingIncome.update({
        where: { id },
        data: {
          month: this.monthDate(month),
          name,
          amount: new Prisma.Decimal(amount),
          note,
        },
      })
      await database.auditLog.create({
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

  async removeIncome(ledgerId: string, id: string) {
    const current = await this.income(ledgerId, id)
    await this.prisma.$transaction(async (database) => {
      await database.shoppingIncome.delete({ where: { id } })
      await database.auditLog.create({
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

  async createItem(ledgerId: string, body: Record<string, unknown>) {
    const value = this.lineInput(body, "物品价格")
    const item = await this.prisma.$transaction(async (database) => {
      const row = await database.shoppingItem.create({
        data: {
          ledgerId,
          month: this.monthDate(value.month),
          name: value.name,
          amount: new Prisma.Decimal(value.amount),
          note: value.note,
        },
      })
      await database.auditLog.create({
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

  private async item(ledgerId: string, id: string) {
    const row = await this.prisma.shoppingItem.findFirst({
      where: { id, ledgerId },
    })
    if (!row) throw new NotFoundException("购物清单项目不存在")
    return row
  }

  async updateItem(
    ledgerId: string,
    id: string,
    body: Record<string, unknown>,
  ) {
    const current = await this.item(ledgerId, id)
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
    const item = await this.prisma.$transaction(async (database) => {
      const row = await database.shoppingItem.update({
        where: { id },
        data: {
          month: this.monthDate(month),
          name,
          amount: new Prisma.Decimal(amount),
          note,
          purchased,
        },
      })
      await database.auditLog.create({
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

  async removeItem(ledgerId: string, id: string) {
    const current = await this.item(ledgerId, id)
    await this.prisma.$transaction(async (database) => {
      await database.shoppingItem.delete({ where: { id } })
      await database.auditLog.create({
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
}
