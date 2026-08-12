import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import path from "node:path";

@Controller()
export class FrontendController {
  @Get(["dashboard", "transactions", "analytics", "ai", "management", "settings"])
  render(@Res() response: Response) {
    return response.sendFile(path.join(process.cwd(), "dist-web", "index.html"));
  }
}
