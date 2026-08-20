export type CalcKey =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "00"
  | "."
  | "+"
  | "-"
  | "*"
  | "/"
  | "AC"
  | "back"
  | "="

const OPS = new Set(["+", "-", "*", "/"])
const MAX_INT_DIGITS = 8

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function formatExprNumber(value: number) {
  if (!Number.isFinite(value)) return "0"
  const rounded = roundMoney(value)
  if (Object.is(rounded, -0) || rounded === 0) return "0"
  return String(rounded)
}

export function displayAmount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return ""
  return roundMoney(Number(value)).toFixed(2)
}

export function isOperator(char: string) {
  return OPS.has(char)
}

function isUnaryMinusAt(expr: string, index: number) {
  return expr[index] === "-" && (index === 0 || isOperator(expr[index - 1]))
}

export function lastBinaryOpIndex(expr: string) {
  for (let i = expr.length - 1; i >= 0; i--) {
    if (isOperator(expr[i]) && !isUnaryMinusAt(expr, i)) return i
  }
  return -1
}

export function tailNumber(expr: string) {
  return expr.slice(lastBinaryOpIndex(expr) + 1)
}

export function prettyExpr(expr: string) {
  if (!expr) return "0"
  let out = ""
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (ch === "*") out += " × "
    else if (ch === "/") out += " ÷ "
    else if (ch === "+" && i > 0) out += " + "
    else if (ch === "-" && !isUnaryMinusAt(expr, i)) out += " − "
    else out += ch
  }
  return out.replace(/\s+/g, " ").trim()
}

function stripTrailingOp(expr: string) {
  let next = expr
  while (
    next.length &&
    isOperator(next[next.length - 1]) &&
    !isUnaryMinusAt(next, next.length - 1)
  ) {
    next = next.slice(0, -1)
  }
  return next
}

type CalcOp = "+" | "-" | "*" | "/"

type Token = { type: "num"; value: number } | { type: "op"; value: CalcOp }

function tokenize(expr: string): Token[] | null {
  if (!expr) return null
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]
    if (isUnaryMinusAt(expr, i) || /[0-9.]/.test(ch)) {
      let j = i
      if (expr[j] === "-") j += 1
      while (j < expr.length && /[0-9.]/.test(expr[j])) j += 1
      const raw = expr.slice(i, j)
      if (raw === "-" || raw === "." || raw === "-.") return null
      const num = Number(raw)
      if (!Number.isFinite(num)) return null
      tokens.push({ type: "num", value: num })
      i = j
      continue
    }
    if (isOperator(ch)) {
      tokens.push({ type: "op", value: ch as CalcOp })
      i += 1
      continue
    }
    return null
  }
  return tokens.length ? tokens : null
}

export function evaluateExpr(expr: string) {
  const trimmed = stripTrailingOp(expr)
  if (!trimmed || trimmed === "-") return null
  const tokens = tokenize(trimmed)
  if (!tokens) return null

  const withMul: Token[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type === "op" && (token.value === "*" || token.value === "/")) {
      const left = withMul.pop()
      const right = tokens[i + 1]
      i += 1
      if (!left || left.type !== "num" || !right || right.type !== "num") {
        return null
      }
      if (token.value === "/" && right.value === 0) return null
      withMul.push({
        type: "num",
        value:
          token.value === "*"
            ? left.value * right.value
            : left.value / right.value,
      })
    } else {
      withMul.push(token)
    }
  }

  let acc: number | null = null
  let op: CalcOp | null = null
  for (const token of withMul) {
    if (token.type === "num") {
      if (acc == null) acc = token.value
      else if (op === "+") acc += token.value
      else if (op === "-") acc -= token.value
      else return null
      op = null
    } else {
      if (token.value !== "+" && token.value !== "-") return null
      op = token.value
    }
  }
  if (acc == null || op != null) return null
  return acc
}

function appendNumeric(expr: string, key: string) {
  const tail = tailNumber(expr)
  const head = expr.slice(0, expr.length - tail.length)
  const negative = tail.startsWith("-")
  const unsigned = negative ? tail.slice(1) : tail
  const sign = negative ? "-" : ""

  if (key === ".") {
    if (unsigned.includes(".")) return expr
    if (!unsigned) return `${head}${sign}0.`
    return `${expr}.`
  }

  const digits = key === "00" ? "00" : key
  if (!/^\d+$/.test(digits)) return expr

  if (unsigned.includes(".")) {
    const decimals = unsigned.split(".")[1] || ""
    const room = 2 - decimals.length
    if (room <= 0) return expr
    return expr + digits.slice(0, room)
  }

  if (unsigned === "0") {
    if (digits === "00") return expr
    return `${head}${sign}${digits.replace(/^0+/, "") || "0"}`
  }

  if (!unsigned) {
    if (digits === "00") return `${head}${sign}0`
    return expr + digits
  }

  const room = MAX_INT_DIGITS - unsigned.length
  if (room <= 0) return expr
  return expr + digits.slice(0, room)
}

export function applyCalcKey(
  expr: string,
  key: CalcKey,
  justEvaluated: boolean,
): { expr: string; justEvaluated: boolean } {
  if (key === "AC") return { expr: "", justEvaluated: false }
  if (key === "back") return { expr: expr.slice(0, -1), justEvaluated: false }
  if (key === "=") {
    const value = evaluateExpr(expr)
    if (value == null) return { expr, justEvaluated }
    return { expr: formatExprNumber(value), justEvaluated: true }
  }
  if (isOperator(key)) {
    if (!expr || expr === "-") {
      return {
        expr: key === "-" ? "-" : expr,
        justEvaluated: false,
      }
    }
    const last = expr[expr.length - 1]
    if (isOperator(last) && !isUnaryMinusAt(expr, expr.length - 1)) {
      return { expr: expr.slice(0, -1) + key, justEvaluated: false }
    }
    return { expr: expr + key, justEvaluated: false }
  }
  const base = justEvaluated ? "" : expr
  return { expr: appendNumeric(base, key), justEvaluated: false }
}

export function resultError(
  value: number | null,
  options: { min?: number; allowNegative?: boolean },
) {
  if (value == null) return "无法计算"
  const rounded = roundMoney(value)
  if (!options.allowNegative && rounded < 0) return "金额不能为负"
  if (options.min != null && rounded < options.min) {
    return options.min > 0 ? "金额必须大于 0" : "金额不能小于 0"
  }
  return null
}
