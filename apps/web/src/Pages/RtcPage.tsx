import { useState, useEffect, useRef } from "react"
import { toast } from "react-hot-toast"
import { Link } from "react-router"
import { ArrowLeft, FileJson, Send } from "lucide-react"

import useUserStore from "@/UserStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const RtcPage = () => {


  type IncomingTransfer = {
    fileId: string
    name: string
    size: number
    mime: string
    receivedBytes: number
    chunks: ArrayBuffer[]
  }

  const ws = useUserStore((state) => state.ws)

  const [pc, setPc] = useState<RTCPeerConnection | null>(null)
  const [status, setStatus] = useState("idle")
  const [chatChannel, setChatChannel] = useState<RTCDataChannel | null>(null)
  const [fileChannel, setFileChannel] = useState<RTCDataChannel | null>(null)
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState<string[]>([])
  const incomingRef = useRef<IncomingTransfer | null>(null)

  const ICE_CONFIG: RTCConfiguration = {
    // iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    iceServers: []
  }

  const startWebrtc = async () => {
    const peer = new RTCPeerConnection(ICE_CONFIG)

    setPc(peer)
    setStatus("peer created")
  }

  const SendOffer = async () => {
    if (!pc || !ws) return

    const ChatChannel = pc.createDataChannel("chat")
    ChatChannel.onopen = () => {
      console.log("chat open")
    }
    ChatChannel.onmessage = (event: any) => {
      console.log("got mesage on chat channel", event.data)
      setMessages((prev) => {
        return [...prev, event.data]
      })
    }
    ChatChannel.onclose = () => {
      console.log("chat channel closed")
      toast.error("chat channel closed")
    }

    const FileChannel = pc.createDataChannel("file")
    FileChannel.onopen = () => {
      console.log("file open")
    }

    FileChannel.onmessage = (event) => {
      if (typeof event.data === "string") {
        const data = JSON.parse(event.data)
        incomingRef.current = {
          fileId: data.id,
          name: data.name,
          size: data.size,
          mime: data.mime,
          receivedBytes: 0,
          chunks: [],
        }
      }

      if (event.data instanceof ArrayBuffer) {
        if (!incomingRef.current) return

        incomingRef.current.chunks.push(event.data)
        incomingRef.current.receivedBytes += event.data.byteLength


        if (incomingRef.current.receivedBytes >= incomingRef.current.size) {
          console.log("file transfer completed btw")
          const newFile = new File(incomingRef.current.chunks, incomingRef.current.name, {
            type: incomingRef.current.mime,
          })
          const url = URL.createObjectURL(newFile)
          const a = document.createElement("a")
          a.href = url
          a.download = newFile.name

          a.click()
          URL.revokeObjectURL(url)
        }
      }
    }

    FileChannel.onclose = () => {
      console.log("file channel closed")
    }
    setChatChannel(ChatChannel)
    setFileChannel(FileChannel)

    const offer = await pc.createOffer()

    await pc.setLocalDescription(offer)

    const payload = {
      event: "create-offer",
      data: offer,
    }
    console.log("sending offer:", payload)
    ws.send(JSON.stringify(payload))
  }

  const SendAnswer = async () => {
    if (!pc || !ws) return
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    ws.send(
      JSON.stringify({
        event: "create-answer",
        data: answer,
      })
    )
    console.log("anser sent haai")
  }

  const SendIceCandiate = async (ice: any) => {
    if (!ws || !pc) return
    const payload = {
      "event": "send-ice-candiate",
      "data": ice
    }

    console.log("sending Ice-Candidate")
    ws.send(JSON.stringify(payload))
  }

  const AckIceCandidate = async (data: any) => {
    await pc?.addIceCandidate(data)
    console.log("setting up ice Ice-Candidate")
  }

  const receivedChunksRef = useRef<ArrayBuffer[]>([])

  useEffect(() => {
    if (!ws || !pc) return

    const handleMessage = async (event: MessageEvent) => {
      const msg = JSON.parse(event.data)

      if (msg.event === "recieve-offer") {
        console.log("got offer:", msg.data)

        await pc.setRemoteDescription(msg.data)
        await SendAnswer()
      }

      else if (msg.event === "recieve-answer") {
        console.log("got answer:", msg.data)
        await pc.setRemoteDescription(msg.data)
      }

      else if (msg.event === "ack-ice-candidate") {
        console.log("got remote ICE:", msg.data)
        await AckIceCandidate(msg.data)
      }
    }

    pc.onicecandidate = async (event) => {
      if (!event.candidate) return
      console.log("generated ICE:", event.candidate)
      await SendIceCandiate(event.candidate)
    }
    // ICE state
    pc.oniceconnectionstatechange = () => {
      console.log("ice state:", pc.iceConnectionState)
    }

    // Overall peer connection state
    pc.onconnectionstatechange = () => {
      console.log("pc state:", pc.connectionState)
    }

    // Receiver gets the data channel created by the initiator
    pc.ondatachannel = (event) => {
      const ch = event.channel

      if (ch.label === "chat") {
        setChatChannel(ch)

        ch.onopen = () => {
          console.log("chat channel is open")
        }

        ch.onclose = () => {
          console.log("chat channel is closed")
          toast.error("chat channel closed")
        }

        ch.onmessage = (event) => {
          console.log("MESSAGE RECEIVED:", event.data)
          setMessages((prev) => {
            return [...prev, event.data]
          })
        }
      }

      if (ch.label === "file") {
        setFileChannel(ch)

        ch.onopen = () => {
          console.log("file channel is open")
        }

        ch.onclose = () => {
          console.log("file channel is closed")
        }

        ch.onmessage = (event) => {
          console.log("file data:", event.data)
          if (event.data instanceof ArrayBuffer) {
            receivedChunksRef.current.push(event.data)
          }
        }
      }
    }

    ws.addEventListener("message", handleMessage)

    return () => {
      ws.removeEventListener("message", handleMessage)

      pc.onicecandidate = null
      pc.oniceconnectionstatechange = null
      pc.onconnectionstatechange = null
      pc.ondatachannel = null
    }
  }, [ws, pc])



  const SendMessage = async () => {
    if (chatChannel?.readyState !== "open") {
      toast.error("channel not open")
      return
    }
    const message = draft.trim()
    if (!message) {
      console.log("msg not found")
      return
    }
    console.log("sending msg")
    setMessages((prev) => {
      return [...prev, draft]
    })
    console.log("about to send:", message)
    console.log("channel:", chatChannel.id, chatChannel.readyState)
    chatChannel.send(message)

    console.log("send() completed")
    setDraft("")
  }


  const [file, setFile] = useState<any>(null)
  const HandelFileUpload = async () => {
    if (!fileChannel) return
    console.log("ready to chunk file btw", file.size)
    const bufferSize = 1024 * 1024 // 1 MB

    fileChannel.send(JSON.stringify({
      type: "file-start",
      name: file.name,
      size: file.size,
      mime: file.type,
    }))

    for (let current = 0; current < file.size; current += bufferSize) {

      if (!fileChannel) return
      const chunk = file.slice(current, current + bufferSize)
      const buffer = await chunk.arrayBuffer()

      if (fileChannel.bufferedAmount > bufferSize) {
        await waitForBuffer(fileChannel)
      }

      fileChannel.send(buffer)
    }

  }

  const waitForBuffer = (channel: RTCDataChannel) => {
    return new Promise<void>((resolve) => {
      channel.bufferedAmountLowThreshold = 256 * 1024

      if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) {
        resolve()
        return
      }

      channel.onbufferedamountlow = () => {
        channel.onbufferedamountlow = null
        resolve()
      }
    })
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            WebRTC practice
          </h1>

          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft />
              Back
            </Link>
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          {ws
            ? `socket connected (id: ${ws.id ?? "?"})`
            : "no socket — create or join a session on the landing page first"}
        </p>

        <p>Status: {status}</p>

        <Button
          onClick={startWebrtc}
          disabled={pc !== null}
        >
          {pc ? "Peer Created" : "Start WebRTC"}
        </Button>


        {/* Offer does NOT wait for channel.open */}
        {pc && (
          <Button onClick={SendOffer}>
            Send Offer
          </Button>
        )}
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                SendMessage()
              }
            }}
            placeholder="Type a message..."
          />

          <Button onClick={() => SendMessage()}  >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {messages.length > 0 ? (
          <div className="rounded-xl border bg-card p-4 font-mono text-sm">
            {messages.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
          </div>
        ) : <>
          <h1>no converstion btw</h1>
        </>}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-medium">Send a file</h2>
              <p className="text-xs text-muted-foreground">
                Select a file from your device.
              </p>
            </div>

            <Input
              type="file"
              onChange={(e) => {
                const filevalue = e.target.files?.[0]
                setFile(filevalue)
              }}
            />

            <Button type="button" onClick={HandelFileUpload}>
              Send File
            </Button>
          </div>
        </div>

      </div>
    </main>
  )
}

export default RtcPage
