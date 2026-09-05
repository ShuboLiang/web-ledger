import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js"
import { CurrentUserService } from "../auth/current-user.service.js"

@Injectable()
export class ShoppingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly user: CurrentUserService,
  ) {}

  private validate(body: Record<string, unknown>, partial = false) {
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
      data.unitPrice = new Prisma.Decimal(value)
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

  async overview() {
    const rows = await this.prisma.shoppingItem.findMany({
      where: { ledgerId: this.user.ledgerId },
      orderBy: [{ purchased: "asc" }, { createdAt: "desc" }, { id: "desc" }],
    })
    let pendingTotal = new Prisma.Decimal(0)
    let purchasedTotal = new Prisma.Decimal(0)
    let pendingCount = 0
    const items = rows.map(({ ledgerId, ...row }) => {
      const subtotal = row.unitPrice.mul(row.quantity)
      if (row.purchased) purchasedTotal = purchasedTotal.add(subtotal)
      else {
        pendingTotal = pendingTotal.add(subtotal)
        pendingCount++
      }
      return {
        ...row,
        unitPrice: row.unitPrice.toNumber(),
        subtotal: subtotal.toNumber(),
      }
    })
    return {
      items,
      summary: {
        pendingTotal: pendingTotal.toNumber(),
        purchasedTotal: purchasedTotal.toNumber(),
        total: pendingTotal.add(purchasedTotal).toNumber(),
        pendingCount,
        purchasedCount: rows.length - pendingCount,
      },
    }
  }

  async create(body: Record<string, unknown>) {
    const data = this.validate(body)
    const row = await this.prisma.shoppingItem.create({
      data: {
        ...data,
        name: data.name!,
        unitPrice: data.unitPrice!,
        ledgerId: this.user.ledgerId,
      },
    })
    return { id: row.id }
  }

  async update(id: string, body: Record<string, unknown>) {
    const data = this.validate(body, true)
    const result = await this.prisma.shoppingItem.updateMany({
      where: { id, ledgerId: this.user.ledgerId },
      data,
    })
    if (!result.count) throw new NotFoundException("购物计划不存在")
    return { ok: true }
  }

  async remove(id: string) {
    const result = await this.prisma.shoppingItem.deleteMany({
      where: { id, ledgerId: this.user.ledgerId },
    })
    if (!result.count) throw new NotFoundException("购物计划不存在")
    return { ok: true }
  }
}
