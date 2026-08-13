import { Controller, Get, Query } from "@nestjs/common"
import { DashboardService } from "./dashboard.service.js"

@Controller("api/dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("range")
  getRange(@Query("start") start: string, @Query("end") end: string) {
    return this.dashboard.buildRange(start, end)
  }

  @Get()
  async getDashboard(@Query("anchor") anchor?: string) {
    return this.dashboard.build(anchor)
  }
}
