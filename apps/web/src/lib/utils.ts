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

const persistPrefix = "qing-zhang-"

export function readPersist(key: string) {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || ""
  } catch {
    return ""
  }
}

export function writePersist(key: string, value: string) {
  try {
    if (value) {
      localStorage.setItem(key, value)
      sessionStorage.removeItem(key)
    } else {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    }
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearPersist() {
  for (const storage of [localStorage, sessionStorage]) {
    Object.keys(storage)
      .filter((key) => key.startsWith(persistPrefix))
      .forEach((key) => storage.removeItem(key))
  }
}
