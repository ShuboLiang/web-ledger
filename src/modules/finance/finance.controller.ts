import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common"
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js"

@Controller("api/finance")
export class FinanceController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  overview() {
    return this.ledger.financeOverview()
  }

  @Post("accounts")
  createAccount(@Body() body: Record<string, unknown>) {
    return this.ledger.createAccount(body)
  }

  @Patch("accounts/:id")
  updateAccount(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.ledger.updateAccount(id, body)
  }

  @Post("accounts/:id/reconcile")
  reconcileAccount(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.ledger.reconcileAccount(id, body)
  }

  @Delete("accounts/:id")
  deleteAccount(@Param("id") id: string) {
    return this.ledger.deleteAccount(id)
  }

  @Post("transfers")
  createTransfer(@Body() body: Record<string, unknown>) {
    return this.ledger.createTransfer(body)
  }

  @Delete("transfers/:id")
  deleteTransfer(@Param("id") id: string) {
    return this.ledger.deleteTransfer(id)
  }

  @Post("liabilities")
  createLiability(@Body() body: Record<string, unknown>) {
    return this.ledger.createLiability(body)
  }

  @Post("liabilities/:id/payments")
  payLiability(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.ledger.payLiability(id, body)
  }

  @Post("liabilities/:id/settlement")
  settleLiability(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.ledger.settleLiability(id, body)
  }

  @Delete("liabilities/:liabilityId/payments/:paymentId")
  deleteLiabilityPayment(
    @Param("liabilityId") liabilityId: string,
    @Param("paymentId") paymentId: string,
  ) {
    return this.ledger.deleteLiabilityPayment(liabilityId, paymentId)
  }
}
