import { Module } from "@nestjs/common"
import { FiltersController } from "./filters.controller.js"

@Module({ controllers: [FiltersController] })
export class FiltersModule {}
