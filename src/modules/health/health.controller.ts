import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { Public } from "../auth/public.decorator.js";

@Controller("api/health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    const databaseUrl = new URL(process.env.DATABASE_URL || "postgresql://localhost/qing_zhang");
    databaseUrl.username = "";
    databaseUrl.password = "";
    return {
      ok: true,
      service: "qing-zhang-api",
      architecture: "nestjs-modular-monolith",
      database: databaseUrl.toString(),
    };
  }
}
