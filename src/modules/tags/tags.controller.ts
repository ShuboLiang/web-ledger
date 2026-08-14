import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common"
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js"

@Controller("api/tags")
export class TagsController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  overview(
    @Query("period") period: string,
    @Query("scope") scope: string,
    @Query("month") month: string,
  ) {
    return this.ledger.tagOverview(period || month, scope)
  }

  @Get(":id")
  analytics(
    @Param("id") id: string,
    @Query("period") period: string,
    @Query("scope") scope: string,
    @Query("month") month: string,
  ) {
    return this.ledger.tagAnalytics(id, period || month, scope)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.ledger.createTag(body)
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.ledger.updateTag(id, body)
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.ledger.deleteTag(id)
  }
}
