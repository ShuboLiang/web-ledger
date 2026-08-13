import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { AiService } from "./ai.service.js";
import { AiSettingsService } from "./ai-settings.service.js";

@Controller("api/ai")
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly settings: AiSettingsService,
  ) {}

  @Get("settings")
  async getSettings() { return this.settings.get(); }

  @Get("conversations")
  listConversations() { return this.ai.listConversations(); }

  @Post("conversations")
  createConversation(@Body() body: { id?: string; title?: string }) { return this.ai.createConversation(body.id, body.title); }

  @Get("conversations/:id")
  getConversation(@Param("id") id: string) { return this.ai.getConversation(id); }

  @Put("conversations/:id/proposals")
  updatePendingProposals(@Param("id") id: string, @Body("proposals") proposals: unknown) { return this.ai.updatePendingProposals(id, proposals); }

  @Put("settings")
  async saveSettings(@Body() body: Record<string, unknown>) { return this.ai.saveSettings(body); }

  @Post("settings/profiles")
  async createProfile(@Body() body: Record<string, unknown>) { return this.settings.create(body); }

  @Put("settings/profiles/:id")
  async updateProfile(@Param("id") id: string, @Body() body: Record<string, unknown>) { const updated = await this.settings.update(id, body); if (updated.isDefault) this.ai.clear(); return updated; }

  @Post("settings/profiles/:id/default")
  async setDefaultProfile(@Param("id") id: string) { this.ai.clear(); return this.settings.setDefault(id); }

  @Delete("settings/profiles/:id")
  async deleteProfile(@Param("id") id: string) { this.ai.clear(); return { ok: await this.settings.remove(id) }; }

  @Post("command")
  command(@Body() body: { conversationId?: string; text?: string }) {
    if (!String(body.text || "").trim()) throw new Error("请输入要处理的内容");
    return this.ai.run(body.conversationId, String(body.text));
  }

  @Post("execute")
  execute(@Body() body: { conversationId?: string }) {
    return this.ai.execute(body.conversationId);
  }

  @Post("conversations/:id/outcome")
  async setOutcome(@Param("id") id: string, @Body("outcome") outcome: "confirmed" | "cancelled") {
    if (!["confirmed", "cancelled"].includes(outcome)) throw new Error("操作结果无效");
    await this.ai.outcome(id, outcome);
    return { ok: true };
  }

  @Delete("conversations/:id")
  async removeConversation(@Param("id") id: string) {
    return { ok: await this.ai.remove(id) };
  }
}
