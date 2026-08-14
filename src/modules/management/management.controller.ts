import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common"
import { ManagementService } from "./management.service.js"

@Controller("api/management")
export class ManagementController {
  constructor(private readonly management: ManagementService) {}
  @Get() overview() {
    return this.management.overview()
  }
  @Get("budgets") budgets(@Query("month") month: string) {
    return this.management.budgetOverview(month)
  }
  @Post("budgets/copy-previous") copyPreviousBudgets(
    @Body("month") month: string,
  ) {
    return this.management.copyPreviousBudgets(month)
  }
  @Patch("budgets/:id") updateBudget(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.management.updateBudget(id, body)
  }
  @Delete("budgets/:id") deleteBudget(@Param("id") id: string) {
    return this.management.deleteBudget(id)
  }
  @Post(":type") create(
    @Param("type") type: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.management.create(type, body)
  }
  @Patch(":type/:id/enabled") setEnabled(
    @Param("type") type: string,
    @Param("id") id: string,
    @Body("enabled") enabled: boolean,
  ) {
    return this.management.setEnabled(type, id, enabled !== false)
  }
  @Patch("categories/primary/rename") renamePrimary(
    @Body() body: Record<string, unknown>,
  ) {
    return this.management.renamePrimary(body)
  }
  @Patch("categories/primary/:name/icon") updatePrimaryIcon(
    @Param("name") name: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.management.updatePrimaryIcon(name, body)
  }
  @Delete("categories/primary/:name") deletePrimary(
    @Param("name") name: string,
  ) {
    return this.management.deletePrimary(name)
  }
  @Patch("categories/:id") updateCategory(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.management.updateCategory(id, body)
  }
  @Post("categories/:id/merge") mergeCategory(
    @Param("id") id: string,
    @Body("targetId") targetId: string,
  ) {
    return this.management.mergeCategory(id, targetId)
  }
  @Delete("categories/:id") deleteCategory(@Param("id") id: string) {
    return this.management.deleteCategory(id)
  }
}
