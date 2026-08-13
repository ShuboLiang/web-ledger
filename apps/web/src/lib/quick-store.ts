import { create } from "zustand"
import { api } from "./api"

export type QuickResult = {
  message: string
  executed: number
  warning?: string
}

type QuickState = {
  pending: boolean
  result: QuickResult | null
  error: string | null
  run: (text: string) => Promise<void>
  consume: () => void
}

/**
 * AI 快捷记账的全局状态。
 * 放在 zustand 里而不是组件内 useMutation：页面切换（组件卸载）时
 * 请求继续执行、loading 与结果都不丢失，切回页面仍能看到。
 */
export const useQuickStore = create<QuickState>()((set, get) => ({
  pending: false,
  result: null,
  error: null,
  run: async (text: string) => {
    if (get().pending) return
    set({ pending: true, error: null })
    try {
      const result = await api<QuickResult>("/api/ai/quick", {
        method: "POST",
        body: JSON.stringify({ text }),
      })
      set({ result })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "请求失败",
      })
    } finally {
      set({ pending: false })
    }
  },
  consume: () => set({ result: null, error: null }),
}))
