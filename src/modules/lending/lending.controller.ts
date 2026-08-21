import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from "@nestjs/common"
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js"

@Controller("api/lending")
export class LendingController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  overview() {
    return this.ledger.lendingOverview()
  }

  @Get("reminders")
  reminders() {
    return this.ledger.lendingReminders()
  }

  @Get("contacts/:id")
  contact(@Param("id") id: string) {
    return this.ledger.lendingContact(id)
  }

  @Post("contacts")
  createContact(@Body() body: Record<string, unknown>) {
    return this.ledger.createLendingContact(body)
  }

  @Patch("contacts/:id")
  updateContact(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.ledger.updateLendingContact(id, body)
  }

  @Delete("contacts/:id")
  @HttpCode(200)
  deleteContact(@Param("id") id: string) {
    return this.ledger.deleteLendingContact(id)
  }

  @Post("entries")
  createEntry(@Body() body: Record<string, unknown>) {
    return this.ledger.createLendingEntry(body)
  }

  @Delete("entries/:id")
  @HttpCode(200)
  deleteEntry(@Param("id") id: string) {
    return this.ledger.deleteLendingEntry(id)
  }

  @Post("settlements")
  settle(@Body() body: Record<string, unknown>) {
    return this.ledger.settleLending(body)
  }

  @Delete("settlements/:id")
  @HttpCode(200)
  reverseSettlement(@Param("id") id: string) {
    return this.ledger.deleteLendingSettlement(id)
  }
}
