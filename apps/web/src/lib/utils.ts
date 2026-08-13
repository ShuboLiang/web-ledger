export const money = (value: number) =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(
    Number(value) || 0,
  )

export const compactMoney = (value: number) => {
  const amount = Number(value) || 0
  const useWan = Math.abs(amount) >= 10_000
  const display = useWan ? amount / 10_000 : amount
  const formatted = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: useWan ? 2 : Number.isInteger(display) ? 0 : 2,
  }).format(display)
  return `¥${formatted}${useWan ? "万" : ""}`
}

export const conversationId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}`
