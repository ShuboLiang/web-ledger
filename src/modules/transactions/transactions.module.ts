import { Module } from "@nestjs/common"
import { TransactionsController } from "./transactions.controller.js"

@Module({ controllers: [TransactionsController] })
export class TransactionsModule {}
