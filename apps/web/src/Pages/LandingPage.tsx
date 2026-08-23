import { useCallback, useState } from "react"
import { Link } from "react-router"
import { QRCodeSVG } from "qrcode.react"
import toast from "react-hot-toast"
import {
  ArrowRight,
  Copy,
  Loader2,
  Moon,
  QrCode,
  ScanLine,
  Send,
  Sun,
} from "lucide-react"

import { useTheme } from "@/hooks/useTheme"
import useUserStore, { type AppWebSocket } from "@/UserStore"
import QrScanner from "@/components/QrScanner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

const API_BASE = import.meta.env.VITE_API_URL || "/api"
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/ws`

type CreatedSession = {
  session_id: string
  Code: string
}

type WsMessage = {
  SocketId?: unknown
  event?: string
  data?: { user2?: string }
}

const LandingPage = () => {
  const { theme, toggleTheme } = useTheme()
  const ws = useUserStore((state) => state.ws)
  const setWs = useUserStore((state) => state.setWs)

  // Create-session flow
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [closeSessionConfirmOpen, setCloseSessionConfirmOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [session, setSession] = useState<CreatedSession | null>(null)

  // Join-session flow
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinedSession, setJoinedSession] = useState<string | null>(null)
  const [joinMode, setJoinMode] = useState<"code" | "scan">("code")

  const handleCreateSession = async () => {
    setCreating(true)
    try {
      const res = await fetch(`${API_BASE}/createSession`)
      const body = await res.json()
      if (!res.ok || body.error) {
        throw new Error(body.error || "failed to create session")
      }
      setSession({
        session_id: body.session_id,
        Code: body.Code,
      })
      const socket = new WebSocket(WS_URL) as AppWebSocket
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return

        let msg: WsMessage
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }

        console.log("ws message:", msg)

        if (typeof msg.SocketId === "string") {
          socket.id = msg.SocketId
          setWs(socket)
          return
        }

        if (msg.event === "user-joined") {
          console.log("User2 joined:", msg.data?.user2)
          toast.success(`User2 joined: ${msg.data?.user2 ?? "someone"}`)
        } else if (msg.event == "user-left") {
          console.log("user left the room", msg.data)
        }else if (msg.event=="recieve-offer"){
          console.log("got the web rtc offer btw",data)
        }
      })
      setWs(socket)
      setConfirmOpen(false)
    } catch (err) {
      toast.error("Could not create session. Is the server running?")
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  const handleCloseSession = () => {
    ws?.close()
    setWs(null)
    setSession(null)
    setCloseSessionConfirmOpen(false)
  }

  const handleJoinSession = async (rawCode?: string) => {
    const code = (rawCode ?? joinCode).trim()
    if (!code) {
      toast.error("Enter a session code first")
      return
    }
    setJoining(true)
    try {
      const res = await fetch(`${API_BASE}/JoinSession/${encodeURIComponent(code)}`)
      const body = await res.json()
      if (!res.ok || body.error) {
        throw new Error(body.error || "invalid or expired session")
      }

      const socket = new WebSocket(WS_URL) as AppWebSocket
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return

        try {
          const message = JSON.parse(event.data) as { SocketId?: unknown }
          if (typeof message.SocketId === "string") {
            socket.id = message.SocketId
            setWs(socket)
          }
        } catch {
          return
        }
      })
      setWs(socket)

      setJoinedSession(code)
      setJoinOpen(false)
      toast.success("Session found — paired up")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "failed to join session")
    } finally {
      setJoining(false)
    }
  }

  // The QR encodes the session ID directly.
  const handleQrDetect = useCallback((value: string) => {
    const code = value.trim()
    setJoinCode(code)
    handleJoinSession(code)
    // handleJoinSession always joins with the explicit code argument; its
    // closure over joinCode is never read on this path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shareUrl = session?.session_id ?? ""

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error("Could not copy")
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Theme toggle — the only chrome on the page */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="absolute top-5 right-5"
      >
        {theme === "dark" ? <Sun /> : <Moon />}
      </Button>

      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">

        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Send className="size-6" />
        </div>

        <h1 className="mt-8 text-4xl font-semibold tracking-tight sm:text-5xl">
          PeerToss
        </h1>
        <p className="mt-4 max-w-md text-balance text-muted-foreground">
          Toss files, links, and clipboard text straight to another device —
          no accounts, no uploads.
        </p>

        {joinedSession ? (
          <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-6">
            <p className="text-sm text-muted-foreground">
              Connected to session
            </p>
            <p className="font-mono text-lg font-medium">{joinedSession}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setJoinedSession(null)}
            >
              Leave session
            </Button>
          </div>
        ) : (
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={() => setConfirmOpen(true)}>
              <QrCode />
              Start Sharing
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setJoinOpen(true)}
            >
              Join Session
              <ArrowRight />
            </Button>
          </div>
        )}

        {/* WebRTC handshake practice lives on its own page */}
        <Link
          to="/rtc"
          className="mt-6 text-sm text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
        >
          practice the WebRTC handshake →
        </Link>

        {/* Confirmation before creating a session */}
        <Dialog
          open={confirmOpen}
          onOpenChange={(open) => !creating && setConfirmOpen(open)}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Start a sharing session?</DialogTitle>
              <DialogDescription>
                We'll create a temporary session and generate a QR code the
                other device can scan to join you.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setConfirmOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateSession} disabled={creating}>
                {creating && <Loader2 className="animate-spin" />}
                {creating ? "Creating..." : "Create Session"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* QR + pairing code after session is created */}
        <Dialog
          open={session !== null}
          onOpenChange={(open) => !open && setCloseSessionConfirmOpen(true)}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Scan to join</DialogTitle>
              <DialogDescription>
                Let the other device scan this code, or share the pairing code
                below. The session is temporary and expires on its own.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4">
              <div className="rounded-xl border bg-white p-4">
                <QRCodeSVG value={shareUrl} size={176} />
              </div>

              <button
                onClick={() => copy(session?.session_id ?? "", "Pairing code")}
                className="group flex items-center gap-2 rounded-lg border bg-muted px-4 py-2 font-mono text-sm font-medium tracking-widest transition hover:bg-accent"
              >
                {session?.session_id}
                <Copy className="size-3.5 opacity-50 transition group-hover:opacity-100" />
              </button>
            </div>

            <DialogFooter>
              <Link to="/rtc">
             <Button
                variant="outline"
                onClick={() => setCloseSessionConfirmOpen(true)}
              >
                rtc page
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => setCloseSessionConfirmOpen(true)}
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={closeSessionConfirmOpen}
          onOpenChange={setCloseSessionConfirmOpen}
        >
          <DialogContent className="sm:left-[calc(50%+4rem)] sm:top-[52%] sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Disconnect this session?</DialogTitle>
              <DialogDescription>
                Closing this session will disconnect its WebSocket connection.
                You'll need to create a new session to reconnect.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setCloseSessionConfirmOpen(false)}
              >
                Keep session
              </Button>
              <Button variant="destructive" onClick={handleCloseSession}>
                Disconnect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Join with a code or a QR scan */}
        <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Join a session</DialogTitle>
              <DialogDescription>
                {joinMode === "code"
                  ? "Enter the pairing code or session ID you received from the other device."
                  : "Point your camera at the QR code shown on the other device."}
              </DialogDescription>
            </DialogHeader>

            {joinMode === "code" ? (
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoinSession()}
                placeholder="Session code"
                className="text-center font-mono"
                autoFocus
              />
            ) : (
              <QrScanner onDetect={handleQrDetect} />
            )}

            <DialogFooter className="sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setJoinMode((m) => (m === "code" ? "scan" : "code"))}
                disabled={joining}
              >
                <ScanLine />
                {joinMode === "code" ? "Scan QR instead" : "Enter code instead"}
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setJoinOpen(false)}
                  disabled={joining}
                >
                  Cancel
                </Button>
                {joinMode === "code" && (
                  <Button onClick={() => handleJoinSession()} disabled={joining}>
                    {joining && <Loader2 className="animate-spin" />}
                    {joining ? "Joining..." : "Join"}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}

export default LandingPage
