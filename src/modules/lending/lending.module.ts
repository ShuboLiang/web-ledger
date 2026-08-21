import { Module } from "@nestjs/common"
import { LendingController } from "./lending.controller.js"

@Module({ controllers: [LendingController] })
export class LendingModule {}
