import { Controller, Get } from "@nestjs/common"
import { LedgerService } from "../../infrastructure/ledger/ledger.service.js"

@Controller("api/dictionaries")
export class DictionariesController {
  constructor(private readonly ledger: LedgerService) {}
  @Get() list() {
    return this.ledger.dictionaries()
  }
}
