import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  root: path.resolve(__dirname, "apps/web"),
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "apps/web/src") } },
  build: {
    outDir: path.resolve(__dirname, "dist-web"),
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
