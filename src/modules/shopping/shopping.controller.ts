import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common"
import { CurrentUserService } from "../auth/current-user.service.js"
import { ShoppingService } from "./shopping.service.js"

@Controller("api/shopping")
export class ShoppingController {
  constructor(
    private readonly shopping: ShoppingService,
    private readonly currentUser: CurrentUserService,
  ) {}

  @Get()
  overview(@Query("month") month: string, @Query("horizon") horizon: string) {
    return this.shopping.overview(this.currentUser.ledgerId, month, horizon)
  }

  @Post("incomes/copy-previous")
  copyPreviousIncomes(@Body() body: Record<string, unknown>) {
    return this.shopping.copyPreviousIncomes(this.currentUser.ledgerId, body)
  }

  @Post("incomes")
  createIncome(@Body() body: Record<string, unknown>) {
    return this.shopping.createIncome(this.currentUser.ledgerId, body)
  }

  @Patch("incomes/:id")
  updateIncome(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.shopping.updateIncome(this.currentUser.ledgerId, id, body)
  }

  @Delete("incomes/:id")
  @HttpCode(200)
  removeIncome(@Param("id") id: string) {
    return this.shopping.removeIncome(this.currentUser.ledgerId, id)
  }

  @Post("items")
  createItem(@Body() body: Record<string, unknown>) {
    return this.shopping.createItem(this.currentUser.ledgerId, body)
  }

  @Patch("items/:id")
  updateItem(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.shopping.updateItem(this.currentUser.ledgerId, id, body)
  }

  @Delete("items/:id")
  @HttpCode(200)
  removeItem(@Param("id") id: string) {
    return this.shopping.removeItem(this.currentUser.ledgerId, id)
  }
}
