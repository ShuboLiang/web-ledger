import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
} from "@nestjs/common"
import type { Response } from "express"
import { AiService } from "./ai.service.js"
import { AiSettingsService } from "./ai-settings.service.js"

@Controller("api/ai")
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly settings: AiSettingsService,
  ) {}

  @Get("settings")
  async getSettings() {
    return this.settings.get()
  }

  @Get("conversations")
  listConversations() {
    return this.ai.listConversations()
  }

  @Post("conversations")
  createConversation(@Body() body: { id?: string; title?: string }) {
    return this.ai.createConversation(body.id, body.title)
  }

  @Get("conversations/:id")
  getConversation(@Param("id") id: string) {
    return this.ai.getConversation(id)
  }

  @Put("conversations/:id/proposals")
  updatePendingProposals(
    @Param("id") id: string,
    @Body("proposals") proposals: unknown,
  ) {
    return this.ai.updatePendingProposals(id, proposals)
  }

  @Post("conversations/:id/proposals/remove")
  removePendingProposal(
    @Param("id") id: string,
    @Body() body: { proposalIndex?: number; recordIndex?: number },
  ) {
    return this.ai.removePendingProposal(id, body)
  }

  @Put("settings")
  async saveSettings(@Body() body: Record<string, unknown>) {
    return this.ai.saveSettings(body)
  }

  @Post("settings/profiles")
  async createProfile(@Body() body: Record<string, unknown>) {
    return this.settings.create(body)
  }

  @Put("settings/profiles/:id")
  async updateProfile(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.settings.update(id, body)
  }

  @Post("settings/profiles/:id/default")
  async setDefaultProfile(@Param("id") id: string) {
    return this.settings.setDefault(id)
  }

  @Delete("settings/profiles/:id")
  async deleteProfile(@Param("id") id: string) {
    return { ok: await this.settings.remove(id) }
  }

  @Post("command")
  command(@Body() body: { conversationId?: string; text?: string }) {
    if (!String(body.text || "").trim()) throw new Error("请输入要处理的内容")
    return this.ai.run(body.conversationId, String(body.text))
  }

  @Post("command/stream")
  async commandStream(
    @Body() body: { conversationId?: string; text?: string },
    @Res() response: Response,
  ) {
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8")
    response.setHeader("Cache-Control", "no-cache, no-transform")
    response.setHeader("Connection", "keep-alive")
    response.setHeader("X-Accel-Buffering", "no")
    response.flushHeaders()
    const abortController = new AbortController()
    const onClose = () => {
      if (!response.writableEnded) abortController.abort()
    }
    response.once("close", onClose)
    const send = (type: string, data: unknown = {}) => {
      if (response.writableEnded || response.destroyed) return false
      return response.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
    }
    try {
      if (!String(body.text || "").trim()) {
        send("error", { message: "请输入要处理的内容" })
        response.end()
        return
      }
      await this.ai.runStreaming(
        body.conversationId,
        String(body.text),
        (event) => send(event.type, event.data),
        abortController.signal,
      )
    } catch (error) {
      if (!abortController.signal.aborted)
        send("error", {
          message: error instanceof Error ? error.message : "AI 服务出错",
        })
    } finally {
      response.off("close", onClose)
      if (!response.writableEnded && !response.destroyed) response.end()
    }
  }

  @Post("quick")
  quick(@Body() body: { text?: string }) {
    return this.ai.quick(body.text)
  }

  @Post("execute")
  execute(@Body() body: { conversationId?: string }) {
    return this.ai.execute(body.conversationId)
  }

  @Post("conversations/:id/outcome")
  async setOutcome(
    @Param("id") id: string,
    @Body("outcome") outcome: "confirmed" | "cancelled",
  ) {
    if (!["confirmed", "cancelled"].includes(outcome))
      throw new Error("操作结果无效")
    await this.ai.outcome(id, outcome)
    return { ok: true }
  }

  @Delete("conversations/:id")
  async removeConversation(@Param("id") id: string) {
    return { ok: await this.ai.remove(id) }
  }
}
