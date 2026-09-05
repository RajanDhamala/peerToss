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


const WEBSOCKET_ENDPOINT = requireEnvironmentValue(
  "VITE_WS_URL",
  import.meta.env.VITE_WS_URL
)

function createWebSocketUrl() {
  const url = new URL(WEBSOCKET_ENDPOINT, window.location.origin)

  if (url.protocol === "https:") {
    url.protocol = "wss:"
  } else if (url.protocol === "http:") {
    url.protocol = "ws:"
  } else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("VITE_WS_URL must use HTTP, HTTPS, WS, or WSS")
  }


  if (
    IS_PRODUCTION &&
    window.location.protocol === "https:" &&
    url.protocol !== "wss:"
  ) {
    throw new Error("VITE_WS_URL must use WSS in production")
  }


  return url.toString()
}

export const WEBSOCKET_URL = createWebSocketUrl()
