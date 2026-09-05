import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common"
import { ShoppingService } from "./shopping.service.js"

@Controller("api/shopping")
export class ShoppingController {
  constructor(private readonly shopping: ShoppingService) {}
  @Get()
  overview() {
    return this.shopping.overview()
  }
  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.shopping.create(body)
  }
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.shopping.update(id, body)
  }
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.shopping.remove(id)
  }
}
