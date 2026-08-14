import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common"
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js"

@Controller("api/transactions")
export class TransactionsController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  async list(@Query() query: Record<string, string>) {
    const paged = [
      "page",
      "date",
      "month",
      "start",
      "end",
      "pageSize",
      "query",
      "category1",
      "category2",
      "direction",
      "accountId",
      "tagId",
      "sortBy",
      "sortOrder",
    ].some((key) => Object.hasOwn(query, key))
    return paged
      ? this.ledger.pageTransactions(query)
      : { records: await this.ledger.listTransactions(query.limit) }
  }

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    const records = Array.isArray(body.records) ? body.records : [body]
    return { records: await this.ledger.addMany(records) }
  }

  @Post("bulk-categorize")
  async bulkCategorize(
    @Body() body: { ids?: number[]; category1?: string; category2?: string },
  ) {
    const updated = await this.ledger.bulkCategorize(body.ids || [], {
      category1: body.category1 || "",
      category2: body.category2 || "",
    })
    return { updated }
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() changes: Record<string, unknown>,
  ) {
    return { record: await this.ledger.update(id, changes) }
  }

  @Delete(":id")
  @HttpCode(200)
  async remove(@Param("id") id: string) {
    return { ok: Boolean(await this.ledger.delete(id)) }
  }
}
