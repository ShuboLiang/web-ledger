import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const API_TYPES = new Set(["openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai"]);

function cleanUrl(value) {
  const raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw) return "http://127.0.0.1:11434/v1";
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Base URL 必须使用 http 或 https");
  return url.toString().replace(/\/$/, "");
}

function cleanId(value, label) {
  const result = String(value || "").trim();
  if (!result || !/^[a-zA-Z0-9._:/-]+$/.test(result)) throw new Error(`${label}只能包含字母、数字、点、横线、下划线、斜线或冒号`);
  return result;
}

export function createAiSettingsStore(filePath) {
  const target = path.resolve(filePath);
  const modelsPath = path.join(path.dirname(target), "pi-models.json");
  mkdirSync(path.dirname(target), { recursive: true });
  let stored = {};
  if (existsSync(target)) {
    try { stored = JSON.parse(readFileSync(target, "utf8")); }
    catch { stored = {}; }
  }

  function normalized() {
    return {
      mode: stored.mode === "custom" ? "custom" : "default",
      providerId: stored.providerId || "my-provider",
      modelId: stored.modelId || "my-model",
      baseUrl: stored.baseUrl || "http://127.0.0.1:11434/v1",
      apiType: API_TYPES.has(stored.apiType) ? stored.apiType : "openai-completions",
      authHeader: stored.authHeader !== false,
      apiKey: stored.apiKey || "",
    };
  }

  function publicSettings() {
    const value = normalized();
    return {
      mode: value.mode,
      providerId: value.providerId,
      modelId: value.modelId,
      baseUrl: value.baseUrl,
      apiType: value.apiType,
      authHeader: value.authHeader,
      hasApiKey: Boolean(value.apiKey),
    };
  }

  function writeModelsFile(value) {
    if (value.mode !== "custom") return;
    const config = {
      providers: {
        [value.providerId]: {
          baseUrl: value.baseUrl,
          api: value.apiType,
          authHeader: value.authHeader,
          compat: value.apiType === "openai-completions" ? {
            supportsDeveloperRole: false,
            supportsReasoningEffort: false,
          } : undefined,
          models: [{
            id: value.modelId,
            name: value.modelId,
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 8192,
          }],
        },
      },
    };
    writeFileSync(modelsPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    try { chmodSync(modelsPath, 0o600); } catch {}
  }

  return {
    get: publicSettings,
    runtime() {
      return { ...normalized(), modelsPath };
    },
    save(input) {
      const mode = input.mode === "custom" ? "custom" : "default";
      const current = normalized();
      const next = {
        mode,
        providerId: mode === "custom" ? cleanId(input.providerId, "Provider ID") : current.providerId,
        modelId: mode === "custom" ? cleanId(input.modelId, "Model ID") : current.modelId,
        baseUrl: mode === "custom" ? cleanUrl(input.baseUrl) : current.baseUrl,
        apiType: mode === "custom" && API_TYPES.has(input.apiType) ? input.apiType : current.apiType,
        authHeader: input.authHeader !== false,
        apiKey: current.apiKey,
      };
      if (typeof input.apiKey === "string" && input.apiKey.trim()) next.apiKey = input.apiKey.trim();
      if (input.clearApiKey === true) next.apiKey = "";
      if (mode === "custom" && !next.apiKey) throw new Error("请填写自定义模型服务的 API Key；本地无密钥服务可填任意占位值");
      stored = next;
      writeFileSync(target, `${JSON.stringify(stored, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      try { chmodSync(target, 0o600); } catch {}
      writeModelsFile(next);
      return publicSettings();
    },
  };
}
