import { Grid } from "antd"
import { useEffect } from "react"

/** Ant Design `md` breakpoint and below (viewport width < 768px). */
export function useIsMobileViewport() {
  const screens = Grid.useBreakpoint()
  return !screens.md
}

/** Enable Select search only on desktop to avoid mobile dropdown search + iOS zoom. */
export function useSearchableSelect() {
  const screens = Grid.useBreakpoint()
  return Boolean(screens.md)
}

/** Make leftover DatePicker / RangePicker inputs read-only on mobile. */
export function usePickerInputReadOnly() {
  const screens = Grid.useBreakpoint()
  return !screens.md
}

/** Prevent iOS keyboard when Select / leftover DatePicker inputs steal focus. */
export function useMobileSheetFocusGuard() {
  const mobile = useIsMobileViewport()
  useEffect(() => {
    if (!mobile) return
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (
        target.classList.contains("ant-select-selection-search-input") ||
        Boolean(target.closest(".ant-picker-input"))
      ) {
        target.blur()
      }
    }
    document.addEventListener("focusin", onFocusIn)
    return () => document.removeEventListener("focusin", onFocusIn)
  }, [mobile])
}

function overlayIsOpen() {
  return Boolean(
    document.querySelector(".ant-drawer-open") ||
      document.querySelector(".ant-modal-wrap:not([style*='display: none'])"),
  )
}

/** Keep the page behind drawers / modals from scrolling, including on iOS. */
export function useOverlayScrollLock() {
  useEffect(() => {
    let locked = false
    let scrollY = 0

    const lock = () => {
      if (locked) return
      locked = true
      scrollY = window.scrollY
      document.documentElement.classList.add("overlay-scroll-lock")
      document.body.classList.add("overlay-scroll-lock")
      document.body.style.top = `-${scrollY}px`
    }

    const unlock = () => {
      if (!locked) return
      locked = false
      document.documentElement.classList.remove("overlay-scroll-lock")
      document.body.classList.remove("overlay-scroll-lock")
      document.body.style.top = ""
      window.scrollTo(0, scrollY)
    }

    const sync = () => {
      if (overlayIsOpen()) lock()
      else unlock()
    }

    const observer = new MutationObserver(sync)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    })
    sync()
    return () => {
      observer.disconnect()
      unlock()
    }
  }, [])
}
