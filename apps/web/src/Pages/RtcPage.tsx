import { useEffect, useRef, useState } from "react"
import MessageComponent from "@/components/rtc/MessageComponet"

import { toast } from "react-hot-toast"
import { Link } from "react-router"
import {
  ArrowLeft,
  ArrowUpRight,
  Gauge,
  Loader2,
  MessageCircle,
  Radio,
  Upload,
} from "lucide-react"

import useUserStore from "@/UserStore"
import { ManifestPanel } from "@/components/rtc/ManifestPanel"
import { SpeedMeter, type SpeedDirection } from "@/components/rtc/SpeedMeter"
import { formatBytes, type ChatItem } from "@/components/rtc/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

const SAFE_FILE_CHUNK_SIZE = 16 * 1024
const MAX_BUFFERED_AMOUNT = 1024 * 1024
const BUFFERED_AMOUNT_LOW_THRESHOLD = 256 * 1024
const PROGRESS_REPORT_INTERVAL = 256 * 1024
const SPEED_TEST_SAMPLE_SIZE = 4 * 1024 * 1024
const SPEED_TEST_CHUNK_SIZE = 16 * 1024

type IncomingTransfer = {
  fileId: string
  name: string
  size: number
  mime: string
  receivedBytes: number
  lastReportedBytes: number
  chunks: ArrayBuffer[]
}

type IncomingSpeedTest = {
  id: string
  size: number
  receivedBytes: number
  startedAt: number
  returnSample: boolean
}

type SpeedTestControlMessage = {
  type?: unknown
  id?: unknown
  size?: unknown
  mbps?: unknown
  complete?: unknown
  message?: unknown
}

function RtcPage() {
  const ws = useUserStore((state) => state.ws)

  const [pc, setPc] = useState<RTCPeerConnection | null>(null)
  const [status, setStatus] = useState("idle")
  const [chatChannel, setChatChannel] = useState<RTCDataChannel | null>(null)
  const [fileChannel, setFileChannel] = useState<RTCDataChannel | null>(null)
  const [chatReady, setChatReady] = useState(false)
  const [fileReady, setFileReady] = useState(false)
  // Retained for the existing chat data-channel handler.
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState<ChatItem[]>([])
  const [draggingFile, setDraggingFile] = useState(false)
  const [sendingFile, setSendingFile] = useState(false)
  const [uploadMbps, setUploadMbps] = useState<number | null>(null)
  const [downloadMbps, setDownloadMbps] = useState<number | null>(null)
  const [speedTestRunning, setSpeedTestRunning] = useState(false)
  const [speedTestDirection, setSpeedTestDirection] =
    useState<SpeedDirection | null>(null)
  const [speedTestWaiting, setSpeedTestWaiting] = useState(false)
  const [mobileSpeedOpen, setMobileSpeedOpen] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const incomingRef = useRef<IncomingTransfer | null>(null)
  const fileChannelRef = useRef<RTCDataChannel | null>(null)
  const outgoingFileRef = useRef(false)
  const incomingSpeedTestRef = useRef<IncomingSpeedTest | null>(null)
  const speedTestIdRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isMouseOver, setIsMouseOver] = useState(false)

  const ICE_CONFIG: RTCConfiguration = {
    // iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    iceServers: [],
  }

  const startWebrtc = async () => {
    const peer = new RTCPeerConnection(ICE_CONFIG)

    setPc(peer)
    setStatus("peer created")
  }

  const stopSpeedTest = () => {
    speedTestIdRef.current = null
    incomingSpeedTestRef.current = null
    setSpeedTestRunning(false)
    setSpeedTestDirection(null)
    setSpeedTestWaiting(false)
  }

  const completeIncomingTransfer = (fileId?: string) => {
    const received = incomingRef.current
    if (!received || (fileId && received.fileId !== fileId)) return

    incomingRef.current = null
    const newFile = new File(received.chunks, received.name, {
      type: received.mime,
    })
    const url = URL.createObjectURL(newFile)

    setMessages((prev) =>
      prev.map((item) =>
        item.id === received.fileId
          ? {
            ...item,
            url,
            transferredBytes: received.size,
            transferStatus: "complete",
          }
          : item
      )
    )
  }

  const failIncomingTransfer = (fileId?: string) => {
    const activeTransfer = incomingRef.current
    const failedFileId = fileId ?? activeTransfer?.fileId
    if (!failedFileId) return

    if (!fileId || activeTransfer?.fileId === fileId) {
      incomingRef.current = null
    }
    setMessages((prev) =>
      prev.map((item) =>
        item.id === failedFileId && item.transferStatus !== "complete"
          ? { ...item, transferStatus: "failed" }
          : item
      )
    )
  }

  // Shared by both peers: the offerer assigns it to the channel it created,
  // and the joiner gets it via pc.ondatachannel.
  const onFileChannelMessage = (event: MessageEvent) => {
    if (typeof event.data === "string") {
      try {
        const data = JSON.parse(event.data) as SpeedTestControlMessage & {
          name?: unknown
          mime?: unknown
        }

        if (
          typeof data.type === "string" &&
          data.type.startsWith("speed-test-")
        ) {
          // The data-channel callback runs after this render has initialized.
          // eslint-disable-next-line react-hooks/immutability
          void handleSpeedTestControl(data)
          return
        }

        if (data.type === "file-complete") {
          completeIncomingTransfer(
            typeof data.id === "string" ? data.id : undefined
          )
          return
        }

        if (data.type === "file-error") {
          failIncomingTransfer(typeof data.id === "string" ? data.id : undefined)
          return
        }

        if (data.type && data.type !== "file-start") return
        if (typeof data.name !== "string" || typeof data.size !== "number") return

        const fileName = data.name
        const fileSize = data.size

        if (speedTestIdRef.current) {
          fileChannelRef.current?.send(
            JSON.stringify({ type: "file-error", id: data.id })
          )
          return
        }

        const fileId = typeof data.id === "string" ? data.id : crypto.randomUUID()
        const mime =
          typeof data.mime === "string" && data.mime
            ? data.mime
            : "application/octet-stream"

        incomingRef.current = {
          fileId,
          name: fileName,
          size: fileSize,
          mime,
          receivedBytes: 0,
          lastReportedBytes: 0,
          chunks: [],
        }
        setMessages((prev) => [
          ...prev,
          {
            id: fileId,
            kind: mime.startsWith("image/") ? "image" : "file",
            mine: false,
            ts: Date.now(),
            name: fileName,
            size: fileSize,
            mime,
            transferredBytes: 0,
            transferStatus: "receiving",
          },
        ])
      } catch {
        console.warn("Ignored invalid file metadata")
      }
      return
    }

    if (!(event.data instanceof ArrayBuffer)) return

    if (incomingSpeedTestRef.current) {
      // The data-channel callback runs after this render has initialized.
      // eslint-disable-next-line react-hooks/immutability
      handleIncomingSpeedTestChunk(event.data)
      return
    }

    if (!incomingRef.current) return

    const received = incomingRef.current
    received.chunks.push(event.data)
    received.receivedBytes += event.data.byteLength

    const shouldReportProgress =
      received.lastReportedBytes === 0 ||
      received.receivedBytes - received.lastReportedBytes >= PROGRESS_REPORT_INTERVAL ||
      received.receivedBytes >= received.size

    if (shouldReportProgress) {
      received.lastReportedBytes = received.receivedBytes
      setMessages((prev) =>
        prev.map((item) =>
          item.id === received.fileId
            ? {
              ...item,
              transferredBytes: Math.min(received.receivedBytes, received.size),
            }
            : item
        )
      )
    }

    if (received.receivedBytes >= received.size) {
      completeIncomingTransfer(received.fileId)
    }
  }

  const SendOffer = async () => {
    if (!pc || !ws) return

    const ChatChannel = pc.createDataChannel("chat")
    ChatChannel.onopen = () => {
      console.log("chat open")
      setChatReady(true)
    }
    ChatChannel.onmessage = (event: MessageEvent<string>) => {
      console.log("got mesage on chat channel", event.data)
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          kind: "text",
          mine: false,
          ts: Date.now(),
          text: String(event.data),
        },
      ])
    }
    ChatChannel.onclose = () => {
      console.log("chat channel closed")
      setChatReady(false)
      toast.error("chat channel closed")
    }

    const FileChannel = pc.createDataChannel("file")
    FileChannel.binaryType = "arraybuffer"
    fileChannelRef.current = FileChannel
    FileChannel.onopen = () => {
      console.log("file open")
      setFileReady(true)
    }

    FileChannel.onmessage = onFileChannelMessage

    FileChannel.onclose = () => {
      console.log("file channel closed")
      if (fileChannelRef.current === FileChannel) fileChannelRef.current = null
      setFileReady(false)
      failIncomingTransfer()
      stopSpeedTest()
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

  const SendIceCandiate = async (ice: RTCIceCandidate) => {
    if (!ws || !pc) return
    const payload = {
      event: "send-ice-candiate",
      data: ice,
    }

    console.log("sending Ice-Candidate")
    ws.send(JSON.stringify(payload))
  }

  const AckIceCandidate = async (data: RTCIceCandidateInit) => {
    await pc?.addIceCandidate(data)
    console.log("setting up ice Ice-Candidate")
  }

  // RTCPeerConnection is intentionally a mutable browser object.
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    if (!ws || !pc) return

    const handleMessage = async (event: MessageEvent) => {
      const msg = JSON.parse(event.data)

      if (msg.event === "recieve-offer") {
        console.log("got offer:", msg.data)

        await pc.setRemoteDescription(msg.data)
        await SendAnswer()
      } else if (msg.event === "recieve-answer") {
        console.log("got answer:", msg.data)
        await pc.setRemoteDescription(msg.data)
      } else if (msg.event === "ack-ice-candidate") {
        console.log("got remote ICE:", msg.data)
        await AckIceCandidate(msg.data)
      }
    }

    // RTCPeerConnection is a mutable browser API stored by identity in state.
    // eslint-disable-next-line react-hooks/immutability
    pc.onicecandidate = async (event) => {
      if (!event.candidate) return
      console.log("generated ICE:", event.candidate)
      await SendIceCandiate(event.candidate)
    }

    pc.oniceconnectionstatechange = () => {
      console.log("ice state:", pc.iceConnectionState)
    }

    pc.onconnectionstatechange = () => {
      console.log("pc state:", pc.connectionState)
      setStatus(pc.connectionState)
    }

    // Receiver gets the data channel created by the initiator.
    pc.ondatachannel = (event) => {
      const channel = event.channel

      if (channel.label === "chat") {
        setChatChannel(channel)

        channel.onopen = () => {
          console.log("chat channel is open")
          setChatReady(true)
        }

        channel.onclose = () => {
          console.log("chat channel is closed")
          setChatReady(false)
          toast.error("chat channel closed")
        }

        channel.onmessage = (event) => {
          console.log("MESSAGE RECEIVED:", event.data)
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              kind: "text",
              mine: false,
              ts: Date.now(),
              text: String(event.data),
            },
          ])
        }
      }

      if (channel.label === "file") {
        channel.binaryType = "arraybuffer"
        fileChannelRef.current = channel
        setFileChannel(channel)

        channel.onopen = () => {
          console.log("file channel is open")
          setFileReady(true)
        }

        channel.onclose = () => {
          console.log("file channel is closed")
          if (fileChannelRef.current === channel) fileChannelRef.current = null
          setFileReady(false)
          failIncomingTransfer()
          stopSpeedTest()
        }

        channel.onmessage = (event) => {
          console.log("file data:", event.data)
          onFileChannelMessage(event)
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
    // Keep the existing signaling lifecycle tied only to the active socket
    // and peer connection so UI renders do not rebind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, pc])

  // Retained for the existing chat data-channel handler.
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
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        kind: "text",
        mine: true,
        ts: Date.now(),
        text: message,
      },
    ])
    console.log("about to send:", message)
    console.log("channel:", chatChannel.id, chatChannel.readyState)
    chatChannel.send(message)

    console.log("send() completed")
    setDraft("")
  }

  const channelOpen = chatReady && chatChannel?.readyState === "open"
  const transferChannelOpen = fileReady && fileChannel?.readyState === "open"
  const directConnectionOpen = channelOpen && transferChannelOpen
  const textMessages = messages.filter((item) => item.kind === "text")
  const transfers = messages.filter((item) => item.kind !== "text")

  const waitForBuffer = (channel: RTCDataChannel) => {
    return new Promise<void>((resolve, reject) => {
      channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD

      if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) {
        resolve()
        return
      }

      const cleanup = () => {
        channel.removeEventListener("bufferedamountlow", handleBufferedAmountLow)
        channel.removeEventListener("close", handleChannelClose)
        channel.removeEventListener("error", handleChannelError)
      }
      const handleBufferedAmountLow = () => {
        cleanup()
        resolve()
      }
      const handleChannelClose = () => {
        cleanup()
        reject(new Error("File channel closed during transfer"))
      }
      const handleChannelError = () => {
        cleanup()
        reject(new Error("File channel failed during transfer"))
      }

      channel.addEventListener("bufferedamountlow", handleBufferedAmountLow)
      channel.addEventListener("close", handleChannelClose, { once: true })
      channel.addEventListener("error", handleChannelError, { once: true })
    })
  }

  const sendSpeedTestSample = async (
    id: string,
    type: "speed-test-start" | "speed-test-return-start"
  ) => {
    const channel = fileChannelRef.current
    if (!channel || channel.readyState !== "open") {
      throw new Error("File channel is not open")
    }

    const negotiatedMaximum = pc?.sctp?.maxMessageSize
    const chunkSize =
      negotiatedMaximum && negotiatedMaximum > 0
        ? Math.min(SPEED_TEST_CHUNK_SIZE, negotiatedMaximum)
        : SPEED_TEST_CHUNK_SIZE
    const fullChunk = new ArrayBuffer(chunkSize)

    channel.send(
      JSON.stringify({
        type,
        id,
        size: SPEED_TEST_SAMPLE_SIZE,
      })
    )

    for (let sentBytes = 0; sentBytes < SPEED_TEST_SAMPLE_SIZE;) {
      if (channel.readyState !== "open") {
        throw new Error("File channel closed during speed test")
      }
      if (channel.bufferedAmount >= MAX_BUFFERED_AMOUNT) {
        await waitForBuffer(channel)
      }

      const remainingBytes = SPEED_TEST_SAMPLE_SIZE - sentBytes
      const payload =
        remainingBytes >= chunkSize
          ? fullChunk
          : fullChunk.slice(0, remainingBytes)
      channel.send(payload)
      sentBytes += payload.byteLength
    }

    await waitForBuffer(channel)
  }

  const sendSpeedTestError = (id: string, message: string) => {
    const channel = fileChannelRef.current
    if (channel?.readyState !== "open") return

    channel.send(JSON.stringify({ type: "speed-test-error", id, message }))
  }

  async function finishIncomingSpeedTest() {
    const incoming = incomingSpeedTestRef.current
    const channel = fileChannelRef.current
    if (!incoming || !channel || channel.readyState !== "open") return

    incomingSpeedTestRef.current = null
    const elapsedSeconds = Math.max(
      (performance.now() - incoming.startedAt) / 1000,
      0.001
    )
    const measuredMbps = incoming.receivedBytes * 8 / elapsedSeconds / 1_000_000

    setDownloadMbps(measuredMbps)
    channel.send(
      JSON.stringify({
        type: "speed-test-upload-result",
        id: incoming.id,
        mbps: measuredMbps,
        complete: !incoming.returnSample,
      })
    )

    if (!incoming.returnSample) {
      stopSpeedTest()
      return
    }

    setSpeedTestDirection("upload")
    setSpeedTestWaiting(false)

    try {
      await sendSpeedTestSample(incoming.id, "speed-test-return-start")
      if (speedTestIdRef.current === incoming.id) {
        setSpeedTestDirection(null)
        setSpeedTestWaiting(true)
      }
    } catch (error) {
      console.error("Return speed test failed", error)
      sendSpeedTestError(incoming.id, "The return speed test failed")
      stopSpeedTest()
      toast.error("Speed test failed")
    }
  }

  function handleIncomingSpeedTestChunk(chunk: ArrayBuffer) {
    const incoming = incomingSpeedTestRef.current
    if (!incoming) return

    incoming.receivedBytes += chunk.byteLength
    if (incoming.receivedBytes >= incoming.size) {
      void finishIncomingSpeedTest()
    }
  }

  async function handleSpeedTestControl(data: SpeedTestControlMessage) {
    const type = typeof data.type === "string" ? data.type : ""
    const id = typeof data.id === "string" ? data.id : ""
    if (!id) return

    if (type === "speed-test-error") {
      if (speedTestIdRef.current !== id) return
      stopSpeedTest()
      toast.error(
        typeof data.message === "string" ? data.message : "Speed test failed"
      )
      return
    }

    if (type === "speed-test-upload-result") {
      if (speedTestIdRef.current !== id) return
      if (typeof data.mbps === "number" && Number.isFinite(data.mbps)) {
        setUploadMbps(Math.max(0, data.mbps))
      }
      if (data.complete === true) stopSpeedTest()
      return
    }

    if (type !== "speed-test-start" && type !== "speed-test-return-start") {
      return
    }

    if (
      typeof data.size !== "number" ||
      !Number.isFinite(data.size) ||
      data.size <= 0 ||
      data.size > 16 * 1024 * 1024
    ) {
      sendSpeedTestError(id, "The speed test sample was invalid")
      return
    }

    if (incomingRef.current || outgoingFileRef.current) {
      sendSpeedTestError(id, "Finish the active file transfer before testing")
      return
    }

    const activeTestId = speedTestIdRef.current
    if (activeTestId && activeTestId !== id) {
      sendSpeedTestError(id, "Another speed test is already running")
      return
    }

    if (type === "speed-test-start") {
      setUploadMbps(null)
      setDownloadMbps(null)
    }

    speedTestIdRef.current = id
    incomingSpeedTestRef.current = {
      id,
      size: data.size,
      receivedBytes: 0,
      startedAt: performance.now(),
      returnSample: type === "speed-test-start",
    }
    setSpeedTestRunning(true)
    setSpeedTestDirection("download")
    setSpeedTestWaiting(false)
  }

  const runSpeedTest = async () => {
    const channel = fileChannelRef.current
    if (!channel || channel.readyState !== "open") {
      toast.error("Connect the file channel before running a speed test")
      return
    }
    if (speedTestIdRef.current) return
    if (
      incomingRef.current ||
      outgoingFileRef.current ||
      messages.some(
        (item) =>
          item.transferStatus === "sending" || item.transferStatus === "receiving"
      )
    ) {
      toast.error("Finish the active file transfer before testing")
      return
    }

    const id = crypto.randomUUID()
    speedTestIdRef.current = id
    setUploadMbps(null)
    setDownloadMbps(null)
    setSpeedTestRunning(true)
    setSpeedTestDirection("upload")
    setSpeedTestWaiting(false)

    try {
      await sendSpeedTestSample(id, "speed-test-start")
      if (
        speedTestIdRef.current === id &&
        incomingSpeedTestRef.current === null
      ) {
        setSpeedTestDirection(null)
        setSpeedTestWaiting(true)
      }
    } catch (error) {
      console.error("Speed test failed", error)
      sendSpeedTestError(id, "The speed test failed")
      stopSpeedTest()
      toast.error("Speed test failed")
    }
  }

  const handleFileUpload = async (file: File, fileId: string) => {
    if (!fileChannel || fileChannel.readyState !== "open") {
      throw new Error("File channel is not open")
    }

    const negotiatedMaximum = pc?.sctp?.maxMessageSize
    const bufferSize =
      negotiatedMaximum && negotiatedMaximum > 0
        ? Math.min(SAFE_FILE_CHUNK_SIZE, negotiatedMaximum)
        : SAFE_FILE_CHUNK_SIZE
    let lastReportedBytes = 0

    fileChannel.send(
      JSON.stringify({
        type: "file-start",
        id: fileId,
        name: file.name,
        size: file.size,
        mime: file.type,
      })
    )

    for (let current = 0; current < file.size; current += bufferSize) {
      const chunk = file.slice(current, current + bufferSize)
      const buffer = await chunk.arrayBuffer()

      if (fileChannel.readyState !== "open") {
        throw new Error("File channel closed during transfer")
      }
      if (fileChannel.bufferedAmount >= MAX_BUFFERED_AMOUNT) {
        await waitForBuffer(fileChannel)
      }

      fileChannel.send(buffer)
      const transferredBytes = Math.min(current + buffer.byteLength, file.size)
      const shouldReportProgress =
        lastReportedBytes === 0 ||
        transferredBytes - lastReportedBytes >= PROGRESS_REPORT_INTERVAL ||
        transferredBytes >= file.size

      if (shouldReportProgress) {
        lastReportedBytes = transferredBytes
        setMessages((prev) =>
          prev.map((item) =>
            item.id === fileId ? { ...item, transferredBytes } : item
          )
        )
      }
    }

    await waitForBuffer(fileChannel)
    fileChannel.send(JSON.stringify({ type: "file-complete", id: fileId }))
  }

  const handleSendFile = async (file: File) => {
    if (!transferChannelOpen) {
      toast.error("The file channel is not ready yet")
      return
    }
    if (speedTestIdRef.current) {
      toast.error("Wait for the speed test to finish")
      return
    }

    const fileId = crypto.randomUUID()
    const previewUrl = URL.createObjectURL(file)

    setSendingFile(true)
    outgoingFileRef.current = true
    setMessages((prev) => [
      ...prev,
      {
        id: fileId,
        kind: file.type.startsWith("image/") ? "image" : "file",
        mine: true,
        ts: Date.now(),
        url: previewUrl,
        name: file.name,
        size: file.size,
        mime: file.type,
        transferredBytes: 0,
        transferStatus: "sending",
      },
    ])

    try {
      await handleFileUpload(file, fileId)
      setMessages((prev) =>
        prev.map((item) =>
          item.id === fileId
            ? {
              ...item,
              transferredBytes: file.size,
              transferStatus: "complete",
            }
            : item
        )
      )
      toast.success("File sent")
    } catch (error) {
      console.error("File transfer failed", error)
      if (fileChannel?.readyState === "open") {
        try {
          fileChannel.send(JSON.stringify({ type: "file-error", id: fileId }))
        } catch {
          console.warn("Could not notify peer about failed file transfer")
        }
      }
      setMessages((prev) =>
        prev.map((item) =>
          item.id === fileId ? { ...item, transferStatus: "failed" } : item
        )
      )
      toast.error("File transfer failed")
    } finally {
      outgoingFileRef.current = false
      setSendingFile(false)
    }
  }

  const activeCount = transfers.filter(
    (item) =>
      item.transferStatus === "sending" || item.transferStatus === "receiving"
  ).length

  const connectionLabel = directConnectionOpen
    ? "Direct link open"
    : !ws
      ? "No active room"
      : !pc
        ? "Room ready"
        : chatChannel || fileChannel
          ? "Opening channels…"
          : "Connecting…"

  const canChooseFile =
    transferChannelOpen && !sendingFile && !speedTestRunning
  const speedTestDisabled =
    !transferChannelOpen || sendingFile || activeCount > 0 || speedTestRunning

  return (
    <main className="min-h-dvh bg-[#F5F4F0] text-[#14171F]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .ptx-display { font-family: 'Space Grotesk', ui-sans-serif, system-ui; }
        .ptx-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
        .ptx-workspace, .ptx-workspace button, .ptx-workspace input { font-family: 'Inter', ui-sans-serif, system-ui; }
      `}</style>

      <div className="ptx-workspace">
        <header className="sticky top-0 z-30 border-b border-[#E4E1DA] bg-[#F5F4F0]/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
            <Link
              to="/"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[#4B5160] transition-colors hover:bg-[#EAE7DE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C]"
              aria-label="Back to home"
            >
              <ArrowLeft className="size-[18px]" />
            </Link>

            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-[#14171F]">
                <Radio className="size-3.5 text-[#F2A33C]" strokeWidth={2} />
              </div>
              <span className="ptx-display text-[15px] font-semibold">PeerToss</span>
            </div>

            <span className="ptx-mono ml-2 hidden rounded-md border border-[#E4E1DA] bg-white px-2 py-1 text-[11px] text-[#8A8776] sm:inline">
              ROOM {ws ? "ACTIVE" : "OFFLINE"}
            </span>


            <div className="flex items-center gap-2 rounded-full border border-[#E4E1DA] bg-white py-1 pl-1 pr-2.5 sm:pr-3">
              <span className="relative flex size-2">
                {directConnectionOpen && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#16947F] opacity-60" />
                )}
                <span
                  className={`relative inline-flex size-2 rounded-full ${directConnectionOpen
                    ? "bg-[#16947F]"
                    : ws
                      ? "bg-[#F2A33C]"
                      : "bg-[#8A8776]"
                    }`}
                />
              </span>
              <span className="hidden text-[13px] font-medium md:inline">
                {connectionLabel}
              </span>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6 sm:py-10">
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0">
          {/* <div className="mb-8"> */}
          {/*   <p className="ptx-mono text-[11px] uppercase tracking-[0.14em] text-[#8A8776]"> */}
          {/*     Transfer workspace */}
          {/*   </p> */}
          {/*   <h1 className="ptx-display mt-1.5 text-[28px] font-semibold leading-tight sm:text-[32px]"> */}
          {/*     One link, straight to your peer. */}
          {/*   </h1> */}
          {/*   <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-[#4B5160]"> */}
          {/*     Files move directly between these two devices. Nothing is stored */}
          {/*     in a permanent server library. */}
          {/*   </p> */}
          {/* </div> */}

          {ws && !directConnectionOpen && (
            <section className="mb-5 flex flex-col gap-4 rounded-2xl border border-[#E4E1DA] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <p className="ptx-display text-sm font-semibold">
                  Temporary handshake controls
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[#8A8776]">
                  {pc
                    ? `Peer state: ${status}. Send the offer from one device.`
                    : "Start WebRTC on both devices, then send the offer from one device."}
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void startWebrtc()}
                  disabled={pc !== null}
                  className="rounded-xl border border-[#E4E1DA] bg-white px-4 py-2.5 text-sm font-medium text-[#14171F] transition-colors hover:bg-[#F5F4F0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] disabled:cursor-default disabled:bg-[#F5F4F0] disabled:text-[#8A8776]"
                >
                  {pc ? "WebRTC started" : "Start WebRTC"}
                </button>
                <button
                  type="button"
                  onClick={() => void SendOffer()}
                  disabled={!pc || chatChannel !== null || fileChannel !== null}
                  className="rounded-xl bg-[#14171F] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#262B3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] disabled:cursor-not-allowed disabled:bg-[#C4C0B5]"
                >
                  Send Offer
                </button>
              </div>
            </section>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-5 " >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                disabled={!canChooseFile}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    void handleSendFile(file)
                  }
                  event.target.value = ""
                }}
              />

              <div
                role="button"
                tabIndex={canChooseFile ? 0 : -1}
                aria-disabled={!canChooseFile}
                onClick={() => {
                  if (canChooseFile) fileInputRef.current?.click()
                }}
                onKeyDown={(event) => {
                  if (
                    canChooseFile &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                onMouseOver={() => setIsMouseOver(true)}
                onMouseOut={() => setIsMouseOver(false)}
                onDragEnter={(event) => {
                  event.preventDefault()
                  if (canChooseFile) setDraggingFile(true)
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDraggingFile(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setDraggingFile(false)

                  if (!canChooseFile) {
                    toast.error("Connect to a peer before selecting a file")
                    return
                  }

                  const files = Array.from(event.dataTransfer.files)
                  if (!files.length) return
                  if (files.length > 1) toast("Send one file at a time")
                  void handleSendFile(files[0])
                }}
                className={`relative flex min-h-[320px] flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5F4F0] ${!canChooseFile
                  ? "cursor-not-allowed border-[#DEDAD1] bg-white/60"
                  : draggingFile
                    ? "cursor-copy border-[#F2A33C] bg-[#FBEAD2]/40"
                    : "cursor-pointer border-[#D8D4C9] bg-white"
                  } ${canChooseFile && isMouseOver && !draggingFile
                    ? "!border-[#7CB88F] !bg-[#EEF6F0] -translate-y-1 shadow-lg shadow-[#7CB88F]/20"
                    : ""
                  }`}
              >

                {[
                  "left-4 top-4 border-l-2 border-t-2",
                  "right-4 top-4 border-r-2 border-t-2",
                  "bottom-4 left-4 border-b-2 border-l-2",
                  "bottom-4 right-4 border-b-2 border-r-2",
                ].map((position) => (
                  <span
                    key={position}
                    className={`pointer-events-none absolute size-4 rounded-[3px] border-[#D8D4C9] ${position}`}
                  />
                ))}

                <div
                  className={`flex size-14 items-center justify-center rounded-full transition-colors ${draggingFile
                    ? "bg-[#F2A33C] text-white"
                    : canChooseFile
                      ? "bg-[#F5F4F0] text-[#4B5160]"
                      : "bg-[#ECE9E1] text-[#AAA697]"
                    }`}
                >
                  {sendingFile ? (
                    <Loader2 className="size-6 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <Upload className="size-6" strokeWidth={1.75} />
                  )}
                </div>

                <p className="ptx-display mt-5 text-lg font-semibold">
                  {sendingFile
                    ? "Your file is on its way"
                    : draggingFile
                      ? "Release to add it"
                      : canChooseFile
                        ? "Drop a file to toss it over"
                        : "The launch pad is waiting"}
                </p>
                <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[#8A8776]">
                  {canChooseFile
                    ? "One file at a time — it waits for confirmation before leaving this device."
                    : "Open the direct file channel, then choose or drop a file here."}
                </p>

                <button
                  type="button"
                  disabled={!canChooseFile}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (canChooseFile) fileInputRef.current?.click()
                  }}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#14171F] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#262B3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#C4C0B5]"
                >
                  Browse files
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>
            </div>
            {/* signal section */}
            <aside className="hidden flex-col rounded-2xl border border-[#E4E1DA] bg-white p-5 md:flex">
              <SpeedMeter
                uploadMbps={uploadMbps}
                downloadMbps={downloadMbps}
                running={speedTestRunning}
                activeDirection={speedTestDirection}
                waitingForPeer={speedTestWaiting}
                disabled={speedTestDisabled}
                sampleSizeLabel={formatBytes(SPEED_TEST_SAMPLE_SIZE)}
                onRun={() => {
                  void runSpeedTest()
                }}
              />
            </aside>
          </div>
              <ManifestPanel
                transfers={transfers}
                activeCount={activeCount}
                mobileAction={
                  <button
                    type="button"
                    onClick={() => setMobileSpeedOpen(true)}
                    className="flex size-8 items-center justify-center rounded-full border border-[#E4E1DA] bg-white text-[#4B5160] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] md:hidden"
                    aria-label="Open speed test"
                  >
                    <Gauge className="size-4" strokeWidth={1.75} />
                  </button>
                }
              />
            </div>

            <MessageComponent
              messages={textMessages}
              draft={draft}
              connected={channelOpen}
              onDraftChange={setDraft}
              inputId="peer-message-draft-desktop"
              onSend={() => {
                void SendMessage()
              }}
              className="hidden md:flex xl:sticky xl:top-24"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileChatOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-[#14171F] text-[#F2A33C] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2A33C] focus-visible:ring-offset-2 md:hidden"
          aria-label="Open messages"
        >
          <MessageCircle className="size-5" strokeWidth={1.9} />
        </button>

        <Dialog open={mobileSpeedOpen} onOpenChange={setMobileSpeedOpen}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-0 md:hidden">
            <DialogTitle className="sr-only">Direct link speed</DialogTitle>
            <DialogDescription className="sr-only">
              Test throughput across the direct WebRTC connection.
            </DialogDescription>
            <aside className="flex flex-col bg-white p-5 pt-12">
              <SpeedMeter
                uploadMbps={uploadMbps}
                downloadMbps={downloadMbps}
                running={speedTestRunning}
                activeDirection={speedTestDirection}
                waitingForPeer={speedTestWaiting}
                disabled={speedTestDisabled}
                sampleSizeLabel={formatBytes(SPEED_TEST_SAMPLE_SIZE)}
                onRun={() => {
                  void runSpeedTest()
                }}
              />
            </aside>
          </DialogContent>
        </Dialog>

        <Dialog open={mobileChatOpen} onOpenChange={setMobileChatOpen}>
          <DialogContent className="w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 md:hidden">
            <DialogTitle className="sr-only">Messages</DialogTitle>
            <DialogDescription className="sr-only">
              Messages shared across the direct WebRTC connection.
            </DialogDescription>
            <MessageComponent
              messages={textMessages}
              draft={draft}
              connected={channelOpen}
              onDraftChange={setDraft}
              inputId="peer-message-draft-mobile"
              onSend={() => {
                void SendMessage()
              }}
              className="max-h-[calc(100dvh-2rem)] border-0"
            />
          </DialogContent>
        </Dialog>
      </div>

    </main>
  )
}

export default RtcPage
