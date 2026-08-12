export const money = (value: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(Number(value) || 0);
export const conversationId = () => globalThis.crypto?.randomUUID?.() || `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`;
