const scopeLabels: Record<string, string> = {
  day: "今天",
  week: "本周",
  month: "本月",
  year: "本年",
}

const directionLabels: Record<string, string> = {
  expense: "仅支出",
  income: "仅收入",
}

const joinParts = (parts: string[]) => parts.filter(Boolean).join(" · ")

export function presetSummary(page: string, rawParams: string) {
  const params = new URLSearchParams(rawParams)
  const catsText = () => {
    const cats = (params.get("cats") || "")
      .split(";")
      .map((path) => path.split("/").filter(Boolean).join(" / "))
      .filter(Boolean)
    return cats.length ? `分类：${cats.join("、")}` : ""
  }
  if (page === "analytics") {
    const scope = params.get("scope")
    const range =
      params.get("start") && params.get("end")
        ? `${params.get("start")} ~ ${params.get("end")}`
        : ""
    return joinParts([
      scope ? (scopeLabels[scope] || scope) : "",
      range ? `自定义 ${range}` : "",
      catsText(),
    ])
  }
  if (page === "transactions") {
    const time =
      params.get("date") ||
      params.get("month") ||
      (params.get("start") && params.get("end")
        ? `${params.get("start")} ~ ${params.get("end")}`
        : "")
    const tags = (params.get("tagIds") || params.get("tagId") || "")
      .split(",")
      .filter(Boolean)
    const categoryText = params.get("cats")
      ? catsText()
      : params.get("category1")
        ? `分类：${params.get("category1")}${params.get("category2") ? ` / ${params.get("category2")}` : ""}`
        : ""
    return joinParts([
      time ? `时间 ${time}` : "全部时间",
      directionLabels[params.get("direction") || ""] || "",
      categoryText,
      params.get("query") ? `搜索“${params.get("query")}”` : "",
      params.get("accountId") ? "指定账户" : "",
      tags.length ? `${tags.length} 个标签` : "",
    ])
  }
  return rawParams
}
