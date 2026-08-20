import { CalculatorOutlined } from "@ant-design/icons"
import { Drawer, Modal } from "antd"
import { useEffect, useMemo, useState, type CSSProperties } from "react"
import {
  applyCalcKey,
  displayAmount,
  evaluateExpr,
  formatExprNumber,
  isOperator,
  prettyExpr,
  resultError,
  roundMoney,
  type CalcKey,
} from "@/lib/amount-expr"
import { useIsMobileViewport } from "@/lib/use-viewport"

type AmountCalculatorProps = {
  value?: number | null
  onChange?: (value: number | null) => void
  min?: number
  placeholder?: string
  disabled?: boolean
  allowNegative?: boolean
  id?: string
  className?: string
  style?: CSSProperties
}

const KEYS: { key: CalcKey; label: string; kind?: "op" | "fn" }[] = [
  { key: "AC", label: "AC", kind: "fn" },
  { key: "back", label: "⌫", kind: "fn" },
  { key: "/", label: "÷", kind: "op" },
  { key: "*", label: "×", kind: "op" },
  { key: "7", label: "7" },
  { key: "8", label: "8" },
  { key: "9", label: "9" },
  { key: "-", label: "−", kind: "op" },
  { key: "4", label: "4" },
  { key: "5", label: "5" },
  { key: "6", label: "6" },
  { key: "+", label: "+", kind: "op" },
  { key: "1", label: "1" },
  { key: "2", label: "2" },
  { key: "3", label: "3" },
  { key: "=", label: "=", kind: "op" },
  { key: "0", label: "0" },
  { key: "00", label: "00" },
  { key: ".", label: "." },
]

function keyFromKeyboard(event: KeyboardEvent): CalcKey | "confirm" | null {
  if (event.key === "Enter") return "confirm"
  if (event.key === "Backspace") return "back"
  if (event.key === "Escape") return null
  if (event.key === "=") return "="
  if (event.key === "+") return "+"
  if (event.key === "-") return "-"
  if (event.key === "*") return "*"
  if (event.key === "/") return "/"
  if (event.key === ".") return "."
  if (/^\d$/.test(event.key)) return event.key as CalcKey
  return null
}

function AmountCalcPad({
  expr,
  error,
  preview,
  startedFromValue,
  currentValue,
  canConfirm,
  showKeyboardHint,
  onKey,
  onConfirm,
}: {
  expr: string
  error: string | null
  preview: number | null
  startedFromValue: boolean
  currentValue?: number | null
  canConfirm: boolean
  showKeyboardHint: boolean
  onKey: (key: CalcKey) => void
  onConfirm: () => void
}) {
  return (
    <>
      <p className="amount-calc-hint">
        {startedFromValue
          ? "可在现有金额上直接加减，例如 +3 或 −5。"
          : "输入金额，也可用 + − × ÷ 边算边记。"}
      </p>
      <div className="amount-calc-display" aria-live="polite">
        <strong>{prettyExpr(expr)}</strong>
        <small className={error ? "is-error" : undefined}>
          {error
            ? error
            : preview != null && expr && /[+\-*/]/.test(expr.slice(1))
              ? `= ${displayAmount(preview)}`
              : startedFromValue
                ? `当前 ${displayAmount(currentValue)}`
                : " "}
        </small>
      </div>
      <div className="amount-calc-keys">
        {KEYS.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`amount-calc-key${item.kind ? ` is-${item.kind}` : ""}`}
            aria-label={item.label}
            onClick={() => onKey(item.key)}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className="amount-calc-key is-done"
          aria-label="完成"
          disabled={!canConfirm}
          onClick={onConfirm}
        >
          完成
        </button>
      </div>
      {showKeyboardHint ? (
        <p className="amount-calc-kbd">数字键和 + − 可直接输入，Enter 完成</p>
      ) : null}
    </>
  )
}

export function AmountCalculator({
  value,
  onChange,
  min,
  placeholder = "0.00",
  disabled,
  allowNegative = false,
  id,
  className,
  style,
}: AmountCalculatorProps) {
  const mobile = useIsMobileViewport()
  const [open, setOpen] = useState(false)
  const [expr, setExpr] = useState("")
  const [justEvaluated, setJustEvaluated] = useState(false)

  const preview = useMemo(() => evaluateExpr(expr), [expr])
  const pendingOp = Boolean(expr && isOperator(expr[expr.length - 1]))
  const error =
    preview == null
      ? expr && !pendingOp && expr !== "-"
        ? "无法计算"
        : null
      : resultError(preview, { min, allowNegative })
  const canConfirm = preview != null && !error

  const resetFromValue = () => {
    setExpr(
      value == null || !Number.isFinite(Number(value))
        ? ""
        : formatExprNumber(Number(value)),
    )
    setJustEvaluated(false)
  }

  const openSheet = () => {
    if (disabled) return
    resetFromValue()
    setOpen(true)
  }

  const closeSheet = () => setOpen(false)

  const applyKey = (key: CalcKey) => {
    const next = applyCalcKey(expr, key, justEvaluated)
    setExpr(next.expr)
    setJustEvaluated(next.justEvaluated)
  }

  const confirm = () => {
    if (!canConfirm || preview == null) return
    onChange?.(roundMoney(preview))
    closeSheet()
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeSheet()
        return
      }
      const mapped = keyFromKeyboard(event)
      if (!mapped) return
      if (
        event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" ||
          event.target.tagName === "TEXTAREA")
      ) {
        return
      }
      event.preventDefault()
      if (mapped === "confirm") confirm()
      else applyKey(mapped)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, expr, justEvaluated, canConfirm, preview])

  const shown = displayAmount(value)
  const startedFromValue = value != null && Number.isFinite(Number(value))
  const pad = (
    <AmountCalcPad
      expr={expr}
      error={error}
      preview={preview}
      startedFromValue={startedFromValue}
      currentValue={value}
      canConfirm={canConfirm}
      showKeyboardHint={!mobile}
      onKey={applyKey}
      onConfirm={confirm}
    />
  )

  return (
    <>
      <button
        type="button"
        id={id}
        disabled={disabled}
        className={`amount-calc-trigger ${className || ""}`.trim()}
        style={style}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={shown ? `金额 ${shown}，打开计算器` : "打开金额计算器"}
        onClick={openSheet}
      >
        <span className="amount-calc-prefix">¥</span>
        <span
          className={shown ? "amount-calc-value" : "amount-calc-placeholder"}
        >
          {shown || placeholder}
        </span>
        <CalculatorOutlined />
      </button>
      {mobile ? (
        <Drawer
          className="amount-calc-sheet"
          title="金额计算"
          placement="bottom"
          height="auto"
          open={open}
          push={false}
          zIndex={1200}
          destroyOnHidden
          onClose={closeSheet}
        >
          {pad}
        </Drawer>
      ) : (
        <Modal
          className="amount-calc-modal"
          rootClassName="amount-calc-modal"
          title="金额计算"
          open={open}
          footer={null}
          width={380}
          centered
          zIndex={1200}
          destroyOnHidden
          onCancel={closeSheet}
        >
          {pad}
        </Modal>
      )}
    </>
  )
}
