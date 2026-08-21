import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
} from "@nestjs/common"
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js"

@Controller("api/trash")
export class TrashController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  list(@Query() query: Record<string, string>) {
    return this.ledger.listTrash(query)
  }

  @Post("restore")
  restore(@Body() body: { ids?: number[] }) {
    return this.ledger.restoreTrash(body.ids || [])
  }

  @Post("purge")
  @HttpCode(200)
  purge(@Body() body: { ids?: number[] }) {
    return this.ledger.purgeTrash(body?.ids || [])
  }

  @Delete()
  @HttpCode(200)
  empty() {
    return this.ledger.purgeTrash()
  }
}
