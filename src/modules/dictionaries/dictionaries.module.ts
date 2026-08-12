import { Module } from "@nestjs/common";
import { DictionariesController } from "./dictionaries.controller.js";

@Module({ controllers: [DictionariesController] })
export class DictionariesModule {}
