import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";

@Injectable()
export class ManagementService {
  constructor(private readonly prisma: PrismaService) {}
  private async ledgerId() { const ledger = await this.prisma.ledger.findFirst({ where: { isDefault: true } }); if (!ledger) throw new Error("默认账本不存在"); return ledger.id; }
  private label(value: unknown) { return String(value || "").trim().slice(0, 40); }
  private async category(id: string) {
    const ledgerId = await this.ledgerId();
    const row = await this.prisma.category.findFirst({ where: { id, ledgerId } });
    if (!row) throw new NotFoundException("分类不存在");
    return row;
  }
  async overview() {
    const ledgerId = await this.ledgerId();
    const [accounts, projects, categories, budgets, tags, usage] = await Promise.all([
      this.prisma.account.findMany({ where: { ledgerId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      this.prisma.project.findMany({ where: { ledgerId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      this.prisma.category.findMany({ where: { ledgerId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      this.prisma.budget.findMany({ where: { ledgerId }, orderBy: { month: "desc" } }),
      this.prisma.tag.findMany({ where: { ledgerId }, orderBy: { createdAt: "asc" } }),
      this.prisma.transaction.groupBy({ by: ["categoryId"], where: { ledgerId }, _count: { _all: true } }),
    ]);
    const usageById = new Map(usage.map((row) => [row.categoryId, row._count._all]));
    const categoryById = new Map(categories.map((row) => [row.id, row]));
    return {
      accounts: accounts.map((x) => ({ ...x, openingBalance: Number(x.openingBalance) })),
      projects,
      categories: categories.map((row) => ({
        ...row,
        usageCount: usageById.get(row.id) || 0,
        mergedInto: row.mergedIntoId ? categoryById.get(row.mergedIntoId) && {
          id: row.mergedIntoId,
          category1: categoryById.get(row.mergedIntoId)!.category1,
          category2: categoryById.get(row.mergedIntoId)!.category2,
        } : null,
      })),
      budgets: budgets.map((x) => ({ ...x, month: x.month.toISOString().slice(0, 7), amount: Number(x.amount) })),
      tags,
    };
  }
  async create(type: string, input: any) {
    const ledgerId = await this.ledgerId();
    const name = String(input.name || "").trim();
    if (type === "accounts") { if (!name) throw new BadRequestException("请填写账户名称"); return this.prisma.account.create({ data: { ledgerId, name, type: input.type || "cash", openingBalance: new Prisma.Decimal(Number(input.openingBalance) || 0) } }); }
    if (type === "projects") { if (!name) throw new BadRequestException("请填写项目名称"); return this.prisma.project.create({ data: { ledgerId, name } }); }
    if (type === "categories") { const category1 = String(input.category1 || "").trim(), category2 = String(input.category2 || "").trim(); if (!category1 || !category2) throw new BadRequestException("请填写一级分类和二级分类"); return this.prisma.category.create({ data: { ledgerId, category1, category2 } }); }
    if (type === "budgets") { const amount = Number(input.amount); if (!/^\d{4}-\d{2}$/.test(String(input.month || "")) || !Number.isFinite(amount) || amount <= 0) throw new BadRequestException("请填写有效月份和预算金额"); return this.prisma.budget.create({ data: { ledgerId, month: new Date(`${input.month}-01T00:00:00.000Z`), category1: input.category1 || null, amount: new Prisma.Decimal(amount) } }); }
    if (type === "tags") { if (!name) throw new BadRequestException("请填写标签名称"); return this.prisma.tag.create({ data: { ledgerId, name, color: input.color || "#0f766e" } }); }
    throw new Error("不支持的管理类型");
  }
  async setEnabled(type: string, id: string, enabled: boolean) {
    if (type === "accounts") return this.prisma.account.update({ where: { id }, data: { enabled } });
    if (type === "projects") return this.prisma.project.update({ where: { id }, data: { enabled } });
    if (type === "categories") {
      const category = await this.category(id);
      if (enabled && category.mergedIntoId) throw new BadRequestException("该分类已经合并，请使用合并后的目标分类");
      return this.prisma.category.update({ where: { id }, data: { enabled } });
    }
    if (type === "tags") return this.prisma.tag.update({ where: { id }, data: { enabled } });
    throw new Error("不支持的管理类型");
  }

  async updateCategory(id: string, input: Record<string, unknown>) {
    const source = await this.category(id);
    const category1 = this.label(input.category1);
    const category2 = this.label(input.category2);
    if (!category1 || !category2) throw new BadRequestException("请填写一级分类和二级分类");
    if (source.mergedIntoId) throw new BadRequestException("已合并分类不能修改");
    if (source.category1 === category1 && source.category2 === category2) return { category: source, updatedTransactions: 0 };
    const duplicate = await this.prisma.category.findFirst({ where: { ledgerId: source.ledgerId, category1, category2, id: { not: id } } });
    if (duplicate) throw new BadRequestException("目标分类已存在，请使用“合并分类”");
    return this.prisma.$transaction(async (database) => {
      const category = await database.category.update({ where: { id }, data: { category1, category2 } });
      const updated = await database.transaction.updateMany({ where: { ledgerId: source.ledgerId, categoryId: id }, data: { category1, category2 } });
      await database.auditLog.create({ data: { action: "category-update", entityType: "category", entityId: id, payload: { from: { category1: source.category1, category2: source.category2 }, to: { category1, category2 }, updatedTransactions: updated.count } } });
      return { category, updatedTransactions: updated.count };
    });
  }

  async renamePrimary(input: Record<string, unknown>) {
    const ledgerId = await this.ledgerId();
    const from = this.label(input.from);
    const to = this.label(input.to);
    if (!from || !to) throw new BadRequestException("请填写原一级分类和新名称");
    if (from === to) throw new BadRequestException("新名称与原名称相同");
    const sourceCount = await this.prisma.category.count({ where: { ledgerId, category1: from } });
    if (!sourceCount) throw new NotFoundException("一级分类不存在");
    const targetCount = await this.prisma.category.count({ where: { ledgerId, category1: to } });
    if (targetCount) throw new BadRequestException("目标一级分类已存在，请逐项移动或合并二级分类");
    return this.prisma.$transaction(async (database) => {
      const categories = await database.category.updateMany({ where: { ledgerId, category1: from }, data: { category1: to } });
      const transactions = await database.transaction.updateMany({ where: { ledgerId, category1: from }, data: { category1: to } });
      const budgets = await database.budget.updateMany({ where: { ledgerId, category1: from }, data: { category1: to } });
      await database.auditLog.create({ data: { action: "category-primary-rename", entityType: "category", payload: { from, to, categories: categories.count, transactions: transactions.count, budgets: budgets.count } } });
      return { categories: categories.count, updatedTransactions: transactions.count, updatedBudgets: budgets.count };
    });
  }

  async mergeCategory(id: string, targetId: string) {
    const source = await this.category(id);
    if (!targetId || targetId === id) throw new BadRequestException("请选择另一个目标分类");
    const target = await this.prisma.category.findFirst({ where: { id: targetId, ledgerId: source.ledgerId } });
    if (!target) throw new NotFoundException("目标分类不存在");
    if (target.mergedIntoId) throw new BadRequestException("目标分类本身已被合并");
    return this.prisma.$transaction(async (database) => {
      const updated = await database.transaction.updateMany({ where: { ledgerId: source.ledgerId, categoryId: id }, data: { categoryId: target.id, category1: target.category1, category2: target.category2 } });
      await database.category.update({ where: { id }, data: { enabled: false, mergedIntoId: target.id } });
      if (!target.enabled) await database.category.update({ where: { id: target.id }, data: { enabled: true } });
      await database.auditLog.create({ data: { action: "category-merge", entityType: "category", entityId: id, payload: { from: { category1: source.category1, category2: source.category2 }, to: { id: target.id, category1: target.category1, category2: target.category2 }, updatedTransactions: updated.count } } });
      return { target, updatedTransactions: updated.count };
    });
  }

  async deleteCategory(id: string) {
    const category = await this.category(id);
    const usageCount = await this.prisma.transaction.count({ where: { ledgerId: category.ledgerId, categoryId: id } });
    if (usageCount) throw new BadRequestException(`该分类仍被 ${usageCount} 笔账目使用，请先停用或合并`);
    const siblingCount = await this.prisma.category.count({ where: { ledgerId: category.ledgerId, category1: category.category1, id: { not: id } } });
    if (!siblingCount) {
      const budgetCount = await this.prisma.budget.count({ where: { ledgerId: category.ledgerId, category1: category.category1 } });
      if (budgetCount) throw new BadRequestException(`该一级分类仍被 ${budgetCount} 条预算使用，不能删除最后一个二级分类`);
    }
    await this.prisma.$transaction(async (database) => {
      await database.category.delete({ where: { id } });
      await database.auditLog.create({ data: { action: "category-delete", entityType: "category", entityId: id, payload: { category1: category.category1, category2: category.category2 } } });
    });
    return { ok: true };
  }

  async deletePrimary(name: string) {
    const ledgerId = await this.ledgerId();
    const category1 = this.label(name);
    const categories = await this.prisma.category.findMany({ where: { ledgerId, category1 }, select: { id: true } });
    if (!categories.length) throw new NotFoundException("一级分类不存在");
    const ids = categories.map((row) => row.id);
    const [usageCount, budgetCount] = await Promise.all([
      this.prisma.transaction.count({ where: { ledgerId, categoryId: { in: ids } } }),
      this.prisma.budget.count({ where: { ledgerId, category1 } }),
    ]);
    if (usageCount || budgetCount) throw new BadRequestException(`该一级分类仍关联 ${usageCount} 笔账目、${budgetCount} 条预算，请先停用或合并`);
    await this.prisma.$transaction(async (database) => {
      await database.category.deleteMany({ where: { ledgerId, id: { in: ids } } });
      await database.auditLog.create({ data: { action: "category-primary-delete", entityType: "category", payload: { category1, categories: ids.length } } });
    });
    return { ok: true, deleted: ids.length };
  }
}
