import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { AlertCircle, ArrowLeft, Loader2, Radio } from "lucide-react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"

import useUserStore, { type AppWebSocket } from "@/UserStore"
import {
  backendEndpoint,
  WEBSOCKET_URL,
} from "@/Config/Environment"
import { rtcSession } from "@/global/rtc/RtcSessionController"

type WsMessage = {
  SocketId?: unknown
}

type JoinState = "joining" | "connecting" | "error"

function JoinSessionPage() {
  const navigate = useNavigate()
  const { token: pathToken } = useParams<{ token?: string }>()
  const [searchParams] = useSearchParams()
  const setWs = useUserStore((state) => state.setWs)
  const [joinState, setJoinState] = useState<JoinState>("joining")
  const [errorMessage, setErrorMessage] = useState("")
  const [attempt, setAttempt] = useState(0)
  const token = (searchParams.get("token") ?? pathToken ?? "").trim()

  useEffect(() => {
    let cancelled = false
    let handedOff = false
    let socket: AppWebSocket | null = null
    let cleanupSocketListeners = () => {}
    const abortController = new AbortController()

    const storedSocket = useUserStore.getState().ws
    rtcSession.endSession()
    if (storedSocket && storedSocket.readyState < WebSocket.CLOSING) {
      storedSocket.close()
    }
    setWs(null)

    if (!token) {
      return () => abortController.abort()
    }

    const fail = (message: string) => {
      if (cancelled || handedOff) return

      cleanupSocketListeners()
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close()
      if (!socket || useUserStore.getState().ws === socket) setWs(null)

      setJoinState("error")
      setErrorMessage(message)
      toast.error(message, { id: "join-session-link-error" })
    }

    const joinSession = async () => {
      try {
        const response = await fetch(
          backendEndpoint("JoinSession/" + encodeURIComponent(token)),
          { signal: abortController.signal }
        )
        const body = await response.json().catch(() => ({}))
        if (cancelled) return
        if (!response.ok || body.error) {
          throw new Error(body.error || "Invalid or expired session")
        }

        setJoinState("connecting")
        socket = new WebSocket(WEBSOCKET_URL) as AppWebSocket

        const handleMessage = (event: MessageEvent) => {
          if (cancelled || !socket || typeof event.data !== "string") return

          let message: WsMessage
          try {
            message = JSON.parse(event.data) as WsMessage
          } catch {
            return
          }

          if (typeof message.SocketId !== "string") return

          socket.id = message.SocketId
          handedOff = true
          cleanupSocketListeners()
          setWs(socket)
          toast.success("Connected to the sharing room")
          navigate("/rtc", { replace: true })
        }

        const handleSocketFailure = () => {
          fail("Could not establish the session connection")
        }

        cleanupSocketListeners = () => {
          socket?.removeEventListener("message", handleMessage)
          socket?.removeEventListener("error", handleSocketFailure)
          socket?.removeEventListener("close", handleSocketFailure)
        }

        socket.addEventListener("message", handleMessage)
        socket.addEventListener("error", handleSocketFailure)
        socket.addEventListener("close", handleSocketFailure)
        setWs(socket)
      } catch (error) {
        if (cancelled || abortController.signal.aborted) return
        fail(
          error instanceof Error ? error.message : "Failed to join session"
        )
      }
    }

    void joinSession()

    return () => {
      cancelled = true
      abortController.abort()
      cleanupSocketListeners()

      if (!handedOff && socket) {
        if (useUserStore.getState().ws === socket) setWs(null)
        if (socket.readyState < WebSocket.CLOSING) socket.close()
      }
    }
  }, [attempt, navigate, setWs, token])

  const visibleJoinState = token ? joinState : "error"
  const visibleErrorMessage = token
    ? errorMessage
    : "This invite link does not contain a session token."

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F5F4F0] px-4 text-[#14171F]">
      <section className="w-full max-w-md rounded-2xl border border-[#E4E1DA] bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#14171F]">
          {visibleJoinState === "error" ? (
            <AlertCircle className="size-5 text-red-300" />
          ) : (
            <Radio className="size-5 text-[#F2A33C]" />
          )}
        </div>

        <h1 className="mt-5 text-xl font-semibold">
          {visibleJoinState === "error" ? "Could not join room" : "Joining room"}
        </h1>

        {visibleJoinState === "error" ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-[#6F6B5F]">
              {visibleErrorMessage}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              {token && (
                <button
                  type="button"
                  onClick={() => {
                    setJoinState("joining")
                    setErrorMessage("")
                    setAttempt((current) => current + 1)
                  }}
                  className="rounded-xl bg-[#14171F] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#262B3A]"
                >
                  Try again
                </button>
              )}
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E4E1DA] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[#F5F4F0]"
              >
                <ArrowLeft className="size-4" />
                Back to PeerToss
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[#6F6B5F]">
            <Loader2 className="size-4 animate-spin" />
            {visibleJoinState === "joining"
              ? "Checking your invite…"
              : "Opening the secure connection…"}
          </div>
        )}
      </section>
    </main>
  )
}

export default JoinSessionPage
