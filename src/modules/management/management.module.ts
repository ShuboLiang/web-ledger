import { Module } from "@nestjs/common";
import { ManagementController } from "./management.controller.js";
import { ManagementService } from "./management.service.js";

@Module({ controllers: [ManagementController], providers: [ManagementService] })
export class ManagementModule {}
