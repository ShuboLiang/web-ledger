import { Controller, Get, Res } from "@nestjs/common"
import type { Response } from "express"
import path from "node:path"

@Controller()
export class FrontendController {
  @Get([
    "login",
    "register",
    "dashboard",
    "transactions",
    "transactions/recurring",
    "transactions/trash",
    "analytics",
    "analytics/heatmap",
    "analytics/budgets",
    "analytics/tags",
    "heatmap",
    "budgets",
    "recurring",
    "trash",
    "finance",
    "finance/lending",
    "lending",
    "tags",
    "ai",
    "management",
    "settings",
    "settings/categories",
    "more",
  ])
  render(@Res() response: Response) {
    return response.sendFile(path.join(process.cwd(), "dist-web", "index.html"))
  }
}
