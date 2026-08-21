import { useEffect, useState } from "react"

const LandingPage = () => {
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)

  const connectWs = () => {
    if (isConnecting || isConnected) return

    setIsConnecting(true)

    const instance = new WebSocket("ws://localhost:3000/ws")

    instance.onopen = () => {
      console.log("connected")

      setIsConnecting(false)
      setIsConnected(true)
      setWs(instance)
    }

    instance.onerror = (err) => {
      console.log("failed websocket connection:", err)
      setIsConnecting(false)
    }

    instance.onclose = () => {
      console.log("websocket disconnected")

      setIsConnected(false)
      setIsConnecting(false)
      setWs(null)
    }

    instance.onmessage = (event) => {
      console.log("server:", event.data)
    }
  }

  const handleSendEvent = (event: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log("websocket is not connected")
      return
    }

    ws.send(
      JSON.stringify({
        event,
        data: `from ${event} endpoint`,
      }),
    )
  }

  useEffect(() => {
    return () => {
      ws?.close()
    }
  }, [ws])

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-16">
        <div className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.8fr]">

          <section className="flex flex-col justify-center">
            <div className="mb-5 flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${isConnected
                  ? "bg-emerald-400"
                  : isConnecting
                    ? "bg-amber-400"
                    : "bg-zinc-600"
                  }`}
              />

              <span className="text-sm text-zinc-400">
                {isConnected
                  ? "WebSocket connected"
                  : isConnecting
                    ? "Connecting..."
                    : "WebSocket disconnected"}
              </span>
            </div>

            <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-6xl">
              Gorilla WebSocket
              <span className="block text-zinc-500">event playground.</span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-7 text-zinc-400">
              Connect to your Go WebSocket server and send different event
              payloads directly from the browser.
            </p>

            <div className="mt-8">
              <button
                onClick={connectWs}
                disabled={isConnecting || isConnected}
                className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {isConnecting
                  ? "Connecting..."
                  : isConnected
                    ? "Connected"
                    : "Connect WebSocket"}
              </button>
            </div>
          </section>

          {/* Event panel */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-2xl shadow-black/20">
            <div className="mb-6">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Event Console
              </p>

              <h2 className="mt-2 text-xl font-semibold">
                Send an event
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Each button sends a JSON payload to the Go server.
              </p>
            </div>

            <div className="space-y-3">
              <EventButton
                name="base"
                description="Send base event"
                disabled={!isConnected}
                onClick={() => handleSendEvent("base")}
              />

              <EventButton
                name="test"
                description="Send test event"
                disabled={!isConnected}
                onClick={() => handleSendEvent("test")}
              />

              <EventButton
                name="demo"
                description="Send demo event"
                disabled={!isConnected}
                onClick={() => handleSendEvent("demo")}
              />
            </div>

            <div className="mt-6 rounded-xl border border-zinc-800 bg-black/30 p-4 font-mono text-xs text-zinc-400">
              <span className="text-zinc-600">endpoint</span>
              <span className="ml-2">ws://localhost:3000/ws</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

type EventButtonProps = {
  name: string
  description: string
  disabled?: boolean
  onClick: () => void
}

const EventButton = ({
  name,
  description,
  disabled,
  onClick,
}: EventButtonProps) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-left transition hover:border-zinc-700 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <div>
        <p className="font-mono text-sm text-zinc-100">
          {name}
        </p>

        <p className="mt-1 text-xs text-zinc-500">
          {description}
        </p>
      </div>

      <span className="text-zinc-600 transition group-hover:translate-x-1 group-hover:text-white">
        →
      </span>
    </button>
  )
}

export default LandingPage
