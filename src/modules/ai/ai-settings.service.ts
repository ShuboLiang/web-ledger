import { Injectable, Scope } from "@nestjs/common";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { CurrentUserService } from "../auth/current-user.service.js";

const API_TYPES = new Set(["openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai"]);
const THINKING_LEVELS = new Set(["minimal", "low", "medium", "high", "xhigh", "max"]);
const cleanId = (value: unknown, label: string) => { const text = String(value || "").trim(); if (!text || !/^[a-zA-Z0-9._:/-]+$/.test(text)) throw new Error(`${label}格式无效`); return text; };
const cleanUrl = (value: unknown) => { const url = new URL(String(value || "").trim()); if (!["http:", "https:"].includes(url.protocol)) throw new Error("Base URL 必须使用 http 或 https"); return url.toString().replace(/\/$/, ""); };

@Injectable({ scope: Scope.REQUEST })
export class AiSettingsService {
  private readonly dataDir: string;

  constructor(private readonly prisma: PrismaService, private readonly currentUser: CurrentUserService) {
    this.dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
    mkdirSync(this.dataDir, { recursive: true });
  }
  private get modelsPath() { return path.join(this.dataDir, `pi-models-${this.currentUser.userId}.json`); }

  private publicProfile(row: any) {
    return { id: row.id, name: row.name, providerId: row.providerId, modelId: row.modelId, baseUrl: row.baseUrl, apiType: row.apiType, authHeader: row.authHeader, thinkingEnabled: row.thinkingEnabled, thinkingLevel: row.thinkingLevel, hasApiKey: Boolean(row.apiKey), isDefault: row.isDefault, enabled: row.enabled };
  }

  async list() { return (await this.prisma.aiModelProfile.findMany({ where: { userId: this.currentUser.userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] })).map((row) => this.publicProfile(row)); }

  async get() {
    const profiles = await this.list();
    const active = profiles.find((profile) => profile.isDefault) || profiles[0];
    return active ? { ...active, configured: active.hasApiKey, profiles } : { configured: false, hasApiKey: false, profiles };
  }

  private writeModelsFile(value: any) {
    const config = { providers: { [value.providerId]: { baseUrl: value.baseUrl, api: value.apiType, authHeader: value.authHeader, compat: value.apiType === "openai-completions" ? { supportsDeveloperRole: false, supportsReasoningEffort: Boolean(value.thinkingEnabled) } : undefined, models: [{ id: value.modelId, name: value.modelId, reasoning: Boolean(value.thinkingEnabled), input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 }] } } };
    writeFileSync(this.modelsPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    try { chmodSync(this.modelsPath, 0o600); } catch {}
  }

  async runtime() {
    const row = await this.prisma.aiModelProfile.findFirst({ where: { userId: this.currentUser.userId, isDefault: true, enabled: true } });
    if (!row) throw new Error("请先在“设置 → AI 模型”中新建并启用一个模型配置");
    this.writeModelsFile(row);
    return { ...row, modelsPath: this.modelsPath };
  }

  private normalize(input: Record<string, any>, current?: any) {
    const apiKey = String(input.apiKey || "").trim() || current?.apiKey || null;
    if (!apiKey) throw new Error("请填写 API Key；本地无密钥服务可填写占位值");
    const thinkingEnabled = input.thinkingEnabled === undefined ? Boolean(current?.thinkingEnabled) : input.thinkingEnabled === true;
    const thinkingLevel = THINKING_LEVELS.has(input.thinkingLevel) ? input.thinkingLevel : THINKING_LEVELS.has(current?.thinkingLevel) ? current.thinkingLevel : "medium";
    return { name: String(input.name || input.modelId || current?.name || "自定义模型").trim().slice(0, 80), providerId: cleanId(input.providerId, "Provider ID"), modelId: cleanId(input.modelId, "Model ID"), baseUrl: cleanUrl(input.baseUrl), apiType: API_TYPES.has(input.apiType) ? input.apiType : "openai-completions", authHeader: input.authHeader !== false, apiKey: input.clearApiKey ? null : apiKey, thinkingEnabled, thinkingLevel };
  }

  async create(input: Record<string, any>) {
    const data = this.normalize(input);
    const count = await this.prisma.aiModelProfile.count({ where: { userId: this.currentUser.userId } });
    const row = await this.prisma.aiModelProfile.create({ data: { ...data, userId: this.currentUser.userId, isDefault: input.isDefault === true || count === 0 } });
    if (row.isDefault) await this.setDefault(row.id);
    return this.publicProfile(row);
  }

  async update(id: string, input: Record<string, any>) {
    const current = await this.prisma.aiModelProfile.findFirst({ where: { id, userId: this.currentUser.userId } });
    if (!current) throw new Error("模型配置不存在");
    const row = await this.prisma.aiModelProfile.update({ where: { id }, data: this.normalize(input, current) });
    return this.publicProfile(row);
  }

  async setDefault(id: string) {
    const target = await this.prisma.aiModelProfile.findFirst({ where: { id, userId: this.currentUser.userId } });
    if (!target) throw new Error("模型配置不存在");
    const row = await this.prisma.$transaction(async (database) => { await database.aiModelProfile.updateMany({ where: { userId: this.currentUser.userId }, data: { isDefault: false } }); return database.aiModelProfile.update({ where: { id }, data: { isDefault: true, enabled: true } }); });
    this.writeModelsFile(row);
    return this.publicProfile(row);
  }

  async remove(id: string) {
    const row = await this.prisma.aiModelProfile.findFirst({ where: { id, userId: this.currentUser.userId } });
    if (!row) return false;
    if (row.isDefault) throw new Error("默认模型配置不能删除，请先切换默认配置");
    await this.prisma.aiModelProfile.delete({ where: { id } });
    return true;
  }

  async save(input: Record<string, any>) {
    const current = await this.prisma.aiModelProfile.findFirst({ where: { userId: this.currentUser.userId, isDefault: true } });
    let saved;
    if (input.id && await this.prisma.aiModelProfile.findFirst({ where: { id: input.id, userId: this.currentUser.userId } })) saved = await this.update(input.id, input);
    else if (current) saved = await this.update(current.id, input);
    else {
      const reusable = await this.prisma.aiModelProfile.findFirst({ where: { userId: this.currentUser.userId, providerId: String(input.providerId || ""), modelId: String(input.modelId || "") } });
      saved = reusable ? await this.update(reusable.id, input) : await this.create({ ...input, isDefault: true });
    }
    await this.setDefault(saved.id);
    return this.get();
  }
}
