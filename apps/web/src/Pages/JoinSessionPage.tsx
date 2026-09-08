import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"

import useUserStore, { type AppWebSocket } from "@/UserStore"
import {
  backendEndpoint,
  WEBSOCKET_URL,
} from "@/Config/Environment"
import { rtcSession } from "@/global/rtc/RtcSessionController"
import { getApiErrorMessage } from "@/Utils/apiError"

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
    rtcSession.setNegotiationRole("participant")
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
          throw new Error(
            getApiErrorMessage(response, body, "Invalid or expired session")
          )
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
          rtcSession.attachSocket(socket)
          rtcSession.startPeer()
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
    <main className="flex min-h-dvh flex-col bg-[#f2f3f5] font-sans text-foreground selection:bg-violet-100 selection:text-violet-950 dark:bg-[#111214] dark:selection:bg-violet-900 dark:selection:text-violet-100">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-20 w-full max-w-[1360px] items-center gap-5 px-5 sm:px-8 lg:px-12">
          <Link
            to="/"
            aria-label="PeerToss home"
            className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F] focus-visible:ring-offset-4 focus-visible:ring-offset-card"
          >
            <img
              src="/peertoss-wordmark.svg?v=2"
              alt="PeerToss"
              width="127"
              height="33"
              className="h-8 w-auto dark:invert"
            />
          </Link>
          <span className="border-l border-border pl-5 text-sm text-muted-foreground">
            Join room
          </span>
        </div>
      </header>

      <div className="grid flex-1 place-items-center px-5 py-10 sm:px-8">
        <section
          aria-labelledby="join-room-title"
          className="w-full max-w-md rounded-2xl border border-[#dedfe3] bg-card p-6 text-card-foreground shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:border-border sm:p-8"
        >
          <div className="flex items-center gap-3">
            {visibleJoinState === "error" && (
              <AlertCircle className="size-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            )}
            <h1 id="join-room-title" className="text-xl font-semibold tracking-tight">
              {visibleJoinState === "error" ? "Could not join room" : "Joining room"}
            </h1>
          </div>

          {visibleJoinState === "error" ? (
            <>
              <p role="alert" className="mt-3 break-words text-sm leading-6 text-muted-foreground">
                {visibleErrorMessage}
              </p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                {token && (
                  <button
                    type="button"
                    onClick={() => {
                      setJoinState("joining")
                      setErrorMessage("")
                      setAttempt((current) => current + 1)
                    }}
                    className="min-h-11 rounded-xl bg-[#14171F] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#262B3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F] focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none dark:bg-foreground dark:text-background dark:hover:bg-foreground/90"
                  >
                    Try again
                  </button>
                )}
                <Link
                  to="/"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-input bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7CB88F] focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back to PeerToss
                </Link>
              </div>
            </>
          ) : (
            <div role="status" className="mt-4 flex items-center gap-3 text-sm leading-6 text-muted-foreground">
              <Loader2 className="size-5 shrink-0 animate-spin text-[#357A4B] motion-reduce:animate-none dark:text-[#8DCEA1]" aria-hidden="true" />
              {visibleJoinState === "joining"
                ? "Checking your invite…"
                : "Connecting to your peer…"}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default JoinSessionPage
