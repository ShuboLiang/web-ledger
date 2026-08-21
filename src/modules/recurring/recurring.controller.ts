import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from "@nestjs/common"
import { CurrentUserService } from "../auth/current-user.service.js"
import { RecurringService } from "./recurring.service.js"

@Controller("api/recurring")
export class RecurringController {
  constructor(
    private readonly recurring: RecurringService,
    private readonly currentUser: CurrentUserService,
  ) {}

  @Get()
  list() {
    return this.recurring.list(this.currentUser.ledgerId)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.recurring.create(this.currentUser.ledgerId, body)
  }

  @Post("pending/:id/confirm")
  confirmPending(@Param("id") id: string) {
    return this.recurring.confirmPending(this.currentUser.ledgerId, id)
  }

  @Post("pending/:id/dismiss")
  dismissPending(@Param("id") id: string) {
    return this.recurring.dismissPending(this.currentUser.ledgerId, id)
  }

  @Post(":id/generate")
  generate(@Param("id") id: string) {
    return this.recurring.generateNow(this.currentUser.ledgerId, id)
  }

  @Post(":id/skip")
  skip(@Param("id") id: string) {
    return this.recurring.skipNext(this.currentUser.ledgerId, id)
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.recurring.update(this.currentUser.ledgerId, id, body)
  }

  @Delete(":id")
  @HttpCode(200)
  remove(@Param("id") id: string) {
    return this.recurring.remove(this.currentUser.ledgerId, id)
  }
}
