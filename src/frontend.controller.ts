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
    "analytics",
    "heatmap",
    "budgets",
    "recurring",
    "trash",
    "finance",
    "lending",
    "tags",
    "ai",
    "management",
    "settings",
    "more",
  ])
  render(@Res() response: Response) {
    return response.sendFile(path.join(process.cwd(), "dist-web", "index.html"))
  }
}
