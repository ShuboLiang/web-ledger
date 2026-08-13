import { ConflictException, Injectable } from "@nestjs/common"

@Injectable()
export class AiConversationCoordinator {
  private readonly busy = new Set<string>()

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (this.busy.has(key))
      throw new ConflictException("这段对话正在处理上一项操作，请稍候")
    this.busy.add(key)
    try {
      return await operation()
    } finally {
      this.busy.delete(key)
    }
  }
}
