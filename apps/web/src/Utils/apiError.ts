type ApiErrorBody = {
  error?: unknown
  retry_after_seconds?: unknown
}

export function getApiErrorMessage(
  response: Response,
  body: ApiErrorBody,
  fallback: string
) {
  const serverMessage =
    typeof body.error === "string" && body.error.trim()
      ? body.error.trim()
      : null

  if (response.status !== 419 && response.status !== 429) {
    return serverMessage ?? fallback
  }

  const retryAfterHeaderValue = response.headers.get("Retry-After")
  const retryAfterHeader = retryAfterHeaderValue
    ? Number(retryAfterHeaderValue)
    : Number.NaN
  const retryAfterBody = Number(body.retry_after_seconds)
  const retryAfterSeconds =
    Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
    ? retryAfterHeader
    : Number.isFinite(retryAfterBody) && retryAfterBody > 0
      ? retryAfterBody
      : null
  const retryMessage =
    retryAfterSeconds && retryAfterSeconds > 0
      ? ` Try again in about ${Math.ceil(retryAfterSeconds)} seconds.`
      : " Please wait a moment and try again."

  return `${serverMessage ?? "Too many attempts."}${retryMessage}`
}
