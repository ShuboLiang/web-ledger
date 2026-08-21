import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common"
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js"

const TRASH_RETENTION_DAYS = 30

@Injectable()
export class TrashCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrashCleanupService.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.purgeExpired().catch((error) =>
      this.logger.error(
        error instanceof Error ? error.stack : String(error),
        "TrashStartup",
      ),
    )
    this.timer = setInterval(
      () => {
        void this.purgeExpired().catch((error) =>
          this.logger.error(
            error instanceof Error ? error.stack : String(error),
            "TrashTick",
          ),
        )
      },
      6 * 60 * 60 * 1000,
    )
    this.timer.unref?.()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async purgeExpired() {
    if (this.running) return { skipped: true }
    this.running = true
    try {
      const cutoff = new Date()
      cutoff.setUTCDate(cutoff.getUTCDate() - TRASH_RETENTION_DAYS)
      const result = await this.prisma.transaction.deleteMany({
        where: {
          deletedAt: { not: null, lte: cutoff },
        },
      })
      if (result.count)
        this.logger.log(
          `回收站清理：彻底删除 ${result.count} 笔超过 ${TRASH_RETENTION_DAYS} 天的账目`,
        )
      return { purged: result.count }
    } finally {
      this.running = false
    }
  }
}
