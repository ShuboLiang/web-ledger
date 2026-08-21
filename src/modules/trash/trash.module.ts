import { Module } from "@nestjs/common"
import { TrashCleanupService } from "./trash-cleanup.service.js"
import { TrashController } from "./trash.controller.js"

@Module({
  controllers: [TrashController],
  providers: [TrashCleanupService],
})
export class TrashModule {}
