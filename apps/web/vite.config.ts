import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ command, mode }) => {
  const isDev = command === "serve" // true only in dev
  const environment = loadEnv(mode, process.cwd(), "")
  const appEnvironment = environment.VITE_ENVIRONMENT?.trim()
  const backendPath = environment.VITE_BACKEND?.trim().replace(/\/+$/, "")
  const devProxyTarget = environment.DEV_PROXY_TARGET?.trim()

  if (!appEnvironment) throw new Error("VITE_ENVIRONMENT is required")
  if (!backendPath) throw new Error("VITE_BACKEND is required")

  const proxy =
    backendPath?.startsWith("/") && devProxyTarget
      ? {
          [backendPath]: {
            target: devProxyTarget,
            changeOrigin: true,
            ws: true,
            rewrite: (requestPath: string) =>
              requestPath.slice(backendPath.length) || "/",
          },
        }
      : undefined

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    server: isDev
      ? {
          //host: true,
          port: 5173,
          proxy,
        }
      : undefined, // in build/production, no proxy
  }
})
