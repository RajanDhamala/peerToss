import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ command, mode }) => {
  const isDev = command === "serve" // true only in dev
  const environment = loadEnv(mode, process.cwd(), "")
  const appEnvironment = environment.VITE_ENVIRONMENT?.trim()
  const backendPath = environment.VITE_BACKEND?.trim().replace(/\/+$/, "")
  const webSocketUrl = environment.VITE_WS_URL?.trim()
  const devProxyTarget = environment.DEV_PROXY_TARGET?.trim()

  if (!appEnvironment) throw new Error("VITE_ENVIRONMENT is required")
  if (!backendPath) throw new Error("VITE_BACKEND is required")
  if (!webSocketUrl) throw new Error("VITE_WS_URL is required")

  const proxy =
    devProxyTarget
      ? {
          ...(backendPath.startsWith("/")
            ? {
                [backendPath]: {
                  target: devProxyTarget,
                  changeOrigin: true,
                  rewrite: (requestPath: string) =>
                    requestPath.slice(backendPath.length) || "/",
                },
              }
            : {}),
          ...(webSocketUrl.startsWith("/")
            ? {
                [webSocketUrl]: {
                  target: devProxyTarget,
                  changeOrigin: true,
                  ws: true,
                },
              }
            : {}),
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
