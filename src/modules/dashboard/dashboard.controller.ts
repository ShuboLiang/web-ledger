import { Controller, Get, Query } from "@nestjs/common"
import { DashboardService, parseCategoryPaths } from "./dashboard.service.js"

@Controller("api/dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("range")
  getRange(
    @Query("start") start: string,
    @Query("end") end: string,
    @Query("cats") cats?: string,
  ) {
    return this.dashboard.buildRange(start, end, parseCategoryPaths(cats))
  }

  @Get()
  async getDashboard(
    @Query("anchor") anchor?: string,
    @Query("cats") cats?: string,
  ) {
    return this.dashboard.build(anchor, parseCategoryPaths(cats))
  }
}
