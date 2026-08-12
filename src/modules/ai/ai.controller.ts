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

  @Put("settings")
  async saveSettings(@Body() body: Record<string, unknown>) { return this.ai.saveSettings(body); }

  @Post("settings/profiles")
  async createProfile(@Body() body: Record<string, unknown>) { return this.settings.create(body); }

  @Put("settings/profiles/:id")
  async updateProfile(@Param("id") id: string, @Body() body: Record<string, unknown>) { return this.settings.update(id, body); }

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
  execute(@Body() body: { conversationId?: string; proposals?: any[] }) {
    return this.ai.execute(body.conversationId, body.proposals || []);
  }

  @Post("conversations/:id/outcome")
  setOutcome(@Param("id") id: string, @Body("outcome") outcome: "confirmed" | "cancelled") {
    if (!["confirmed", "cancelled"].includes(outcome)) throw new Error("操作结果无效");
    return { ok: this.ai.outcome(id, outcome) };
  }

  @Delete("conversations/:id")
  removeConversation(@Param("id") id: string) {
    this.ai.remove(id);
    return { ok: true };
  }
}
