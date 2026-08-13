import { Global, Module } from "@nestjs/common"
import { LedgerService } from "./ledger.service.js"
import { PrismaService } from "../prisma/prisma.service.js"

@Global()
@Module({
  providers: [PrismaService, LedgerService],
  exports: [PrismaService, LedgerService],
})
export class LedgerModule {}
