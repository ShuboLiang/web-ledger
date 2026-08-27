import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { minimal2023Preset } from "@vite-pwa/assets-generator/config"
import { VitePWA } from "vite-plugin-pwa"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const pwaAssetPreset = {
  ...minimal2023Preset,
  maskable: {
    ...minimal2023Preset.maskable,
    padding: 0.12,
    resizeOptions: { background: "#0b2527", fit: "contain" as const },
  },
  apple: {
    ...minimal2023Preset.apple,
    padding: 0.08,
    resizeOptions: { background: "#0b2527", fit: "contain" as const },
  },
}

export default defineConfig({
  root: path.resolve(projectRoot, "apps/web"),
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      pwaAssets: {
        preset: pwaAssetPreset,
        image: "public/icon-512.svg",
        overrideManifestIcons: true,
      },
      manifest: {
        id: "/",
        name: "轻账 · 专业记账工作台",
        short_name: "轻账",
        description: "带自然语言 AI 录入的本地优先记账工作台",
        lang: "zh-CN",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        theme_color: "#0f766e",
        background_color: "#f1f4f1",
        categories: ["finance", "productivity"],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(projectRoot, "apps/web/src") } },
  build: {
    outDir: path.resolve(projectRoot, "dist-web"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@ant-design/plots") || id.includes("@antv"))
            return "charts"
          if (id.includes("@ant-design/x")) return "ai-ui"
          if (
            id.includes("node_modules/antd") ||
            id.includes("@ant-design/icons")
          )
            return "antd"
          if (id.includes("@tanstack/react-query")) return "query"
          if (id.includes("react-markdown") || id.includes("remark-gfm"))
            return "markdown"
          return undefined
        },
      },
    },
  },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:3218" } },
})
