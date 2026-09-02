function requireEnvironmentValue(name: string, value: string | undefined) {
  const normalizedValue = value?.trim()
  if (!normalizedValue) {
    throw new Error(`${name} is required`)
  }

  return normalizedValue
}

export const APP_ENVIRONMENT = requireEnvironmentValue(
  "VITE_ENVIRONMENT",
  import.meta.env.VITE_ENVIRONMENT
).toUpperCase()

export const IS_PRODUCTION = APP_ENVIRONMENT === "PRODUCTION"

export const BACKEND_BASE_URL = requireEnvironmentValue(
  "VITE_BACKEND",
  import.meta.env.VITE_BACKEND
).replace(/\/+$/, "")

export function backendEndpoint(path: string) {
  return `${BACKEND_BASE_URL}/${path.replace(/^\/+/, "")}`
}

function createWebSocketUrl() {
  const url = new URL(backendEndpoint("ws"), window.location.origin)

  if (
    IS_PRODUCTION &&
    window.location.protocol === "https:" &&
    url.protocol !== "https:"
  ) {
    throw new Error("VITE_BACKEND must use HTTPS in production")
  }

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  return url.toString()
}

export const WEBSOCKET_URL = createWebSocketUrl()
