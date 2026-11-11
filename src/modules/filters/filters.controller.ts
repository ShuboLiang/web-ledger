import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common"
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js"
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js"

const clean = (value: unknown, max: number) =>
  String(value ?? "")
    .trim()
    .slice(0, max)

@Controller("api/filter-presets")
export class FiltersController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@Query("page") page: string) {
    const { ledgerId } = await this.ledger.context()
    return this.prisma.filterPreset.findMany({
      where: { ledgerId, page: clean(page, 20) || undefined },
      orderBy: { updatedAt: "desc" },
      select: { id: true, page: true, name: true, params: true, updatedAt: true },
    })
  }

  @Post()
  async save(@Body() body: Record<string, unknown>) {
    const { ledgerId } = await this.ledger.context()
    const page = clean(body.page, 20)
    const name = clean(body.name, 40)
    const params = clean(body.params, 2000)
    if (!page || !name || !params)
      throw new BadRequestException("筛选方案内容不完整")
    const existing = await this.prisma.filterPreset.findFirst({
      where: { ledgerId, page, name },
    })
    if (existing)
      return this.prisma.filterPreset.update({
        where: { id: existing.id },
        data: { params },
        select: { id: true, page: true, name: true, params: true, updatedAt: true },
      })
    return this.prisma.filterPreset.create({
      data: { ledgerId, page, name, params },
      select: { id: true, page: true, name: true, params: true, updatedAt: true },
    })
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    const { ledgerId } = await this.ledger.context()
    const preset = await this.prisma.filterPreset.findFirst({
      where: { id: clean(id, 60), ledgerId },
    })
    if (!preset) throw new NotFoundException("筛选方案不存在")
    const name = clean(body.name, 40)
    const params = clean(body.params, 2000)
    if (name && name !== preset.name) {
      const conflict = await this.prisma.filterPreset.findFirst({
        where: { ledgerId, page: preset.page, name },
      })
      if (conflict) throw new BadRequestException(`方案“${name}”已存在`)
    }
    return this.prisma.filterPreset.update({
      where: { id: preset.id },
      data: {
        ...(name ? { name } : {}),
        ...(params ? { params } : {}),
      },
      select: { id: true, page: true, name: true, params: true, updatedAt: true },
    })
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    const { ledgerId } = await this.ledger.context()
    const preset = await this.prisma.filterPreset.findFirst({
      where: { id: clean(id, 60), ledgerId },
    })
    if (!preset) throw new NotFoundException("筛选方案不存在")
    await this.prisma.filterPreset.delete({ where: { id: preset.id } })
    return { ok: true }
  }
}
