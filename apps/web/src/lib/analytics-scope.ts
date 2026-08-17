import { readPersist, writePersist } from "@/lib/utils"

export const analyticsScopeKey = "qing-zhang-analytics-filter"
const analyticsAnchorSessionKey = "qing-zhang-analytics-anchor"
export type AnalyticsScope = "day" | "week" | "month" | "year"

const scopes: AnalyticsScope[] = ["day", "week", "month", "year"]

export function isAnalyticsScope(
  value: string | null,
): value is AnalyticsScope {
  return Boolean(value && scopes.includes(value as AnalyticsScope))
}

export function readAnalyticsScope(): AnalyticsScope | null {
  const saved = readPersist(analyticsScopeKey)
  if (!saved) return null
  const scope = new URLSearchParams(saved.replace(/^\?/, "")).get("scope")
  return isAnalyticsScope(scope) ? scope : null
}

export function writeAnalyticsScope(scope: AnalyticsScope) {
  writePersist(analyticsScopeKey, `?scope=${scope}`)
}

export function readAnalyticsAnchor() {
  try {
    return sessionStorage.getItem(analyticsAnchorSessionKey) || ""
  } catch {
    return ""
  }
}

export function writeAnalyticsAnchor(anchor: string) {
  try {
    if (anchor) sessionStorage.setItem(analyticsAnchorSessionKey, anchor)
    else sessionStorage.removeItem(analyticsAnchorSessionKey)
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function analyticsPath() {
  const params = new URLSearchParams()
  const scope = readAnalyticsScope()
  const anchor = readAnalyticsAnchor()
  if (scope) params.set("scope", scope)
  if (anchor) params.set("anchor", anchor)
  const query = params.toString()
  return query ? `/analytics?${query}` : "/analytics"
}
