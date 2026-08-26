import { toast } from "react-hot-toast"

import type { ChatItem } from "@/components/rtc/types"
import type { AppWebSocket } from "@/UserStore"
import useRtcStore, { resetRtcStore } from "@/global/rtc/rtcStore"

const SAFE_FILE_CHUNK_SIZE = 16 * 1024
const MAX_BUFFERED_AMOUNT = 1024 * 1024
const BUFFERED_AMOUNT_LOW_THRESHOLD = 256 * 1024
const PROGRESS_REPORT_INTERVAL = 256 * 1024
export const RTC_SPEED_TEST_SAMPLE_SIZE = 4 * 1024 * 1024
const SPEED_TEST_CHUNK_SIZE = 16 * 1024

const ICE_CONFIG: RTCConfiguration = {
  // Keep the current local-network behavior. Add STUN/TURN here when required.
  iceServers: [],
}

type IncomingTransfer = {
  fileId: string
  name: string
  size: number
  mime: string
  receivedBytes: number
  lastReportedBytes: number
  chunks: ArrayBuffer[]
  sender?: string
}

type IncomingSpeedTest = {
  id: string
  size: number
  receivedBytes: number
  startedAt: number
  returnSample: boolean
  sender?: string
}

type SpeedTestControlMessage = {
  type?: unknown
  id?: unknown
  size?: unknown
  mbps?: unknown
  complete?: unknown
  sender?: unknown
  message?: unknown
}

type FileControlMessage = SpeedTestControlMessage & {
  name?: unknown
  mime?: unknown
}

class RtcSessionController {
  private ws: AppWebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private chatChannel: RTCDataChannel | null = null
  private fileChannel: RTCDataChannel | null = null
  private incomingTransfer: IncomingTransfer | null = null
  private outgoingFile = false
  private incomingSpeedTest: IncomingSpeedTest | null = null
  private speedTestId: string | null = null
  private objectUrls = new Set<string>()

  attachSocket(socket: AppWebSocket | null) {
    if (this.ws === socket) return

    this.detachSocket()
    this.ws = socket

    socket?.addEventListener("message", this.handleSocketMessage)
    socket?.addEventListener("close", this.handleSocketClose)
    socket?.addEventListener("error", this.handleSocketError)
  }

  detachSocket(socket?: AppWebSocket | null) {
    if (!this.ws || (socket && this.ws !== socket)) return

    this.ws.removeEventListener("message", this.handleSocketMessage)
    this.ws.removeEventListener("close", this.handleSocketClose)
    this.ws.removeEventListener("error", this.handleSocketError)
    this.ws = null
  }

  startPeer() {
    if (this.pc && this.pc.connectionState !== "closed") return this.pc

    if (this.pc) this.detachPeer(this.pc)

    const peer = new RTCPeerConnection(ICE_CONFIG)
    this.pc = peer

    peer.addEventListener("icecandidate", this.handleIceCandidate)
    peer.addEventListener(
      "iceconnectionstatechange",
      this.handleIceConnectionStateChange
    )
    peer.addEventListener("connectionstatechange", this.handleConnectionStateChange)
    peer.addEventListener("datachannel", this.handleDataChannel)

    useRtcStore.setState({
      peerCreated: true,
      status: "peer created",
    })

    return peer
  }

  async sendOffer() {
    const pc = this.pc
    const ws = this.ws
    if (!pc || !ws || this.chatChannel || this.fileChannel) return

    this.attachChatChannel(pc.createDataChannel("chat"))
    this.attachFileChannel(pc.createDataChannel("file"))

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    const payload = {
      event: "create-offer",
      data: offer,
    }
    console.log("sending offer:", payload)
    ws.send(JSON.stringify(payload))
  }

  sendMessage(rawMessage: string) {
    const channel = this.chatChannel
    if (!channel || channel.readyState !== "open") {
      toast.error("channel not open")
      return false
    }

    const message = rawMessage.trim()
    if (!message) return false

    this.updateMessages((messages) => [
      ...messages,
      {
        id: crypto.randomUUID(),
        kind: "text",
        mine: true,
        ts: Date.now(),
        text: message,
      },
    ])

    console.log("about to send:", message)
    console.log("channel:", channel.id, channel.readyState)
    channel.send(message)
    console.log("send() completed")
    return true
  }

  async runSpeedTest() {
    const channel = this.fileChannel
    const state = useRtcStore.getState()

    if (!channel || channel.readyState !== "open") {
      toast.error("Connect the file channel before running a speed test")
      return
    }
    if (this.speedTestId) return
    if (
      this.incomingTransfer ||
      this.outgoingFile ||
      state.messages.some(
        (item) =>
          item.transferStatus === "sending" ||
          item.transferStatus === "receiving"
      )
    ) {
      toast.error("Finish the active file transfer before testing")
      return
    }

    const id = crypto.randomUUID()
    this.speedTestId = id
    useRtcStore.setState({
      uploadMbps: null,
      downloadMbps: null,
      speedTestRunning: true,
      speedTestDirection: "upload",
      speedTestWaiting: false,
    })

    try {
      await this.sendSpeedTestSample(id, "speed-test-start")
      if (this.speedTestId === id && this.incomingSpeedTest === null) {
        useRtcStore.setState({
          speedTestDirection: null,
          speedTestWaiting: true,
        })
      }
    } catch (error) {
      console.error("Speed test failed", error)
      this.sendSpeedTestError(id, "The speed test failed")
      this.stopSpeedTest()
      toast.error("Speed test failed")
    }
  }

  async sendFile(file: File) {
    const channel = this.fileChannel
    if (!channel || channel.readyState !== "open") {
      toast.error("The file channel is not ready yet")
      return
    }
    if (this.speedTestId) {
      toast.error("Wait for the speed test to finish")
      return
    }

    const fileId = crypto.randomUUID()
    const previewUrl = URL.createObjectURL(file)
    this.objectUrls.add(previewUrl)

    this.outgoingFile = true
    useRtcStore.setState({ sendingFile: true })
    this.updateMessages((messages) => [
      ...messages,
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
      await this.uploadFile(file, fileId)
      this.updateMessages((messages) =>
        messages.map((item) =>
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
      if (channel.readyState === "open") {
        try {
          channel.send(JSON.stringify({ type: "file-error", id: fileId }))
        } catch {
          console.warn("Could not notify peer about failed file transfer")
        }
      }
      this.updateMessages((messages) =>
        messages.map((item) =>
          item.id === fileId ? { ...item, transferStatus: "failed" } : item
        )
      )
      toast.error("File transfer failed")
    } finally {
      this.outgoingFile = false
      useRtcStore.setState({ sendingFile: false })
    }
  }

  endSession({ closeSocket = true }: { closeSocket?: boolean } = {}) {
    const socket = this.ws
    const peer = this.pc
    const chatChannel = this.chatChannel
    const fileChannel = this.fileChannel

    this.detachSocket()
    this.detachChatChannel(chatChannel)
    this.detachFileChannel(fileChannel)
    if (peer) this.detachPeer(peer)

    if (chatChannel && chatChannel.readyState !== "closed") chatChannel.close()
    if (fileChannel && fileChannel.readyState !== "closed") fileChannel.close()
    if (peer && peer.connectionState !== "closed") peer.close()
    if (closeSocket && socket && socket.readyState < WebSocket.CLOSING) {
      socket.close()
    }

    this.pc = null
    this.chatChannel = null
    this.fileChannel = null
    this.incomingTransfer = null
    this.outgoingFile = false
    this.incomingSpeedTest = null
    this.speedTestId = null

    for (const url of this.objectUrls) URL.revokeObjectURL(url)
    this.objectUrls.clear()
    resetRtcStore()
  }

  private updateMessages(updater: (messages: ChatItem[]) => ChatItem[]) {
    useRtcStore.setState((state) => ({ messages: updater(state.messages) }))
  }

  private attachChatChannel(channel: RTCDataChannel) {
    if (this.chatChannel === channel) return

    this.detachChatChannel(this.chatChannel)
    this.chatChannel = channel
    channel.addEventListener("open", this.handleChatOpen)
    channel.addEventListener("message", this.handleChatMessage)
    channel.addEventListener("close", this.handleChatClose)
    channel.addEventListener("error", this.handleChatError)

    useRtcStore.setState({
      chatChannelPresent: true,
      chatReady: channel.readyState === "open",
    })
  }

  private detachChatChannel(channel: RTCDataChannel | null) {
    if (!channel) return

    channel.removeEventListener("open", this.handleChatOpen)
    channel.removeEventListener("message", this.handleChatMessage)
    channel.removeEventListener("close", this.handleChatClose)
    channel.removeEventListener("error", this.handleChatError)
    if (this.chatChannel === channel) this.chatChannel = null
  }

  private attachFileChannel(channel: RTCDataChannel) {
    if (this.fileChannel === channel) return

    this.detachFileChannel(this.fileChannel)
    this.fileChannel = channel
    channel.binaryType = "arraybuffer"
    channel.addEventListener("open", this.handleFileOpen)
    channel.addEventListener("message", this.handleFileMessage)
    channel.addEventListener("close", this.handleFileClose)
    channel.addEventListener("error", this.handleFileError)

    useRtcStore.setState({
      fileChannelPresent: true,
      fileReady: channel.readyState === "open",
    })
  }

  private detachFileChannel(channel: RTCDataChannel | null) {
    if (!channel) return

    channel.removeEventListener("open", this.handleFileOpen)
    channel.removeEventListener("message", this.handleFileMessage)
    channel.removeEventListener("close", this.handleFileClose)
    channel.removeEventListener("error", this.handleFileError)
    if (this.fileChannel === channel) this.fileChannel = null
  }

  private detachPeer(peer: RTCPeerConnection) {
    peer.removeEventListener("icecandidate", this.handleIceCandidate)
    peer.removeEventListener(
      "iceconnectionstatechange",
      this.handleIceConnectionStateChange
    )
    peer.removeEventListener(
      "connectionstatechange",
      this.handleConnectionStateChange
    )
    peer.removeEventListener("datachannel", this.handleDataChannel)
    if (this.pc === peer) this.pc = null
  }

  private handleSocketMessage = async (event: MessageEvent) => {
    if (typeof event.data !== "string") return

    let message: { event?: unknown; data?: unknown }
    try {
      message = JSON.parse(event.data) as { event?: unknown; data?: unknown }
    } catch {
      return
    }

    if (message.event === "user-left") {
      useRtcStore.setState({
        status: "disconnected",
        chatReady: false,
        fileReady: false,
      })
      this.failIncomingTransfer()
      this.stopSpeedTest()
      toast.error("The other device left the room")
      return
    }

    if (!this.pc) return
    const pc = this.pc
    try {
      if (message.event === "recieve-offer") {
        console.log("got offer:", message.data)
        await pc.setRemoteDescription(
          message.data as RTCSessionDescriptionInit
        )
        await this.sendAnswer()
      } else if (message.event === "recieve-answer") {
        console.log("got answer:", message.data)
        await pc.setRemoteDescription(
          message.data as RTCSessionDescriptionInit
        )
      } else if (message.event === "ack-ice-candidate") {
        console.log("got remote ICE:", message.data)
        await pc.addIceCandidate(message.data as RTCIceCandidateInit)
      }
    } catch (error) {
      console.error("WebRTC signaling message failed", error)
    }
  }

  private handleSocketClose = () => {
    if (this.pc?.connectionState === "connected") return
    useRtcStore.setState({ status: "signaling closed" })
  }

  private handleSocketError = () => {
    if (this.pc?.connectionState === "connected") return
    useRtcStore.setState({ status: "signaling error" })
  }

  private sendAnswer = async () => {
    const pc = this.pc
    const ws = this.ws
    if (!pc || !ws) return

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    ws.send(
      JSON.stringify({
        event: "create-answer",
        data: answer,
      })
    )
    console.log("answer sent")
  }

  private sendIceCandidate = async (ice: RTCIceCandidate) => {
    const ws = this.ws
    if (!ws || !this.pc) return

    const payload = {
      event: "send-ice-candiate",
      data: ice,
    }
    console.log("sending Ice-Candidate")
    ws.send(JSON.stringify(payload))
  }

  private handleIceCandidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) void this.sendIceCandidate(event.candidate)
  }

  private handleIceConnectionStateChange = () => {
    if (this.pc) console.log("ice state:", this.pc.iceConnectionState)
  }

  private handleConnectionStateChange = () => {
    if (!this.pc) return
    console.log("pc state:", this.pc.connectionState)
    useRtcStore.setState({ status: this.pc.connectionState })
  }

  private handleDataChannel = (event: RTCDataChannelEvent) => {
    if (event.channel.label === "chat") {
      this.attachChatChannel(event.channel)
    } else if (event.channel.label === "file") {
      this.attachFileChannel(event.channel)
    }
  }

  private handleChatOpen = () => {
    console.log("chat channel is open")
    useRtcStore.setState({ chatReady: true })
  }

  private handleChatMessage = (event: MessageEvent) => {
    console.log("MESSAGE RECEIVED:", event.data)
    this.updateMessages((messages) => [
      ...messages,
      {
        id: crypto.randomUUID(),
        kind: "text",
        mine: false,
        ts: Date.now(),
        text: String(event.data),
      },
    ])
  }

  private handleChatClose = () => {
    console.log("chat channel is closed")
    useRtcStore.setState({ chatReady: false })
    toast.error("chat channel closed")
  }

  private handleChatError = () => {
    useRtcStore.setState({ chatReady: false })
  }

  private handleFileOpen = () => {
    console.log("file channel is open")
    useRtcStore.setState({ fileReady: true })
  }

  private handleFileMessage = (event: MessageEvent) => {
    console.log("file data:", event.data)
    this.onFileChannelMessage(event)
  }

  private handleFileClose = () => {
    console.log("file channel is closed")
    useRtcStore.setState({ fileReady: false })
    this.failIncomingTransfer()
    this.stopSpeedTest()
  }

  private handleFileError = () => {
    useRtcStore.setState({ fileReady: false })
    this.failIncomingTransfer()
    this.stopSpeedTest()
  }

  private onFileChannelMessage(event: MessageEvent) {
    if (typeof event.data === "string") {
      let data: FileControlMessage
      try {
        data = JSON.parse(event.data) as FileControlMessage
      } catch {
        console.warn("Ignored invalid file metadata")
        return
      }

      if (typeof data.type === "string" && data.type.startsWith("speed-test-")) {
        void this.handleSpeedTestControl(data)
        return
      }

      if (data.type === "file-complete") {
        this.completeIncomingTransfer(
          typeof data.id === "string" ? data.id : undefined
        )
        return
      }

      if (data.type === "file-error") {
        this.failIncomingTransfer(
          typeof data.id === "string" ? data.id : undefined
        )
        return
      }

      if (data.type && data.type !== "file-start") return
      if (typeof data.name !== "string" || typeof data.size !== "number") return

      if (this.speedTestId) {
        this.fileChannel?.send(
          JSON.stringify({ type: "file-error", id: data.id })
        )
        return
      }

      const fileId =
        typeof data.id === "string" ? data.id : crypto.randomUUID()
      const mime =
        typeof data.mime === "string" && data.mime
          ? data.mime
          : "application/octet-stream"

      this.incomingTransfer = {
        fileId,
        name: data.name,
        size: data.size,
        mime,
        receivedBytes: 0,
        lastReportedBytes: 0,
        chunks: [],
      }
      this.updateMessages((messages) => [
        ...messages,
        {
          id: fileId,
          kind: mime.startsWith("image/") ? "image" : "file",
          mine: false,
          ts: Date.now(),
          name: data.name as string,
          size: data.size as number,
          mime,
          transferredBytes: 0,
          transferStatus: "receiving",
        },
      ])
      return
    }

    if (!(event.data instanceof ArrayBuffer)) return

    if (this.incomingSpeedTest) {
      this.handleIncomingSpeedTestChunk(event.data)
      return
    }

    const received = this.incomingTransfer
    if (!received) return

    received.chunks.push(event.data)
    received.receivedBytes += event.data.byteLength

    const shouldReportProgress =
      received.lastReportedBytes === 0 ||
      received.receivedBytes - received.lastReportedBytes >=
        PROGRESS_REPORT_INTERVAL ||
      received.receivedBytes >= received.size

    if (shouldReportProgress) {
      received.lastReportedBytes = received.receivedBytes
      this.updateMessages((messages) =>
        messages.map((item) =>
          item.id === received.fileId
            ? {
                ...item,
                transferredBytes: Math.min(
                  received.receivedBytes,
                  received.size
                ),
              }
            : item
        )
      )
    }

    if (received.receivedBytes >= received.size) {
      this.completeIncomingTransfer(received.fileId)
    }
  }

  private completeIncomingTransfer(fileId?: string) {
    const received = this.incomingTransfer
    if (!received || (fileId && received.fileId !== fileId)) return

    this.incomingTransfer = null
    const newFile = new File(received.chunks, received.name, {
      type: received.mime,
    })
    const url = URL.createObjectURL(newFile)
    this.objectUrls.add(url)

    this.updateMessages((messages) =>
      messages.map((item) =>
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

  private failIncomingTransfer(fileId?: string) {
    const activeTransfer = this.incomingTransfer
    const failedFileId = fileId ?? activeTransfer?.fileId
    if (!failedFileId) return

    if (!fileId || activeTransfer?.fileId === fileId) {
      this.incomingTransfer = null
    }
    this.updateMessages((messages) =>
      messages.map((item) =>
        item.id === failedFileId && item.transferStatus !== "complete"
          ? { ...item, transferStatus: "failed" }
          : item
      )
    )
  }

  private waitForBuffer(channel: RTCDataChannel) {
    return new Promise<void>((resolve, reject) => {
      channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD

      if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) {
        resolve()
        return
      }

      const cleanup = () => {
        channel.removeEventListener(
          "bufferedamountlow",
          handleBufferedAmountLow
        )
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

  private async sendSpeedTestSample(
    id: string,
    type: "speed-test-start" | "speed-test-return-start"
  ) {
    const channel = this.fileChannel
    if (!channel || channel.readyState !== "open") {
      throw new Error("File channel is not open")
    }

    const negotiatedMaximum = this.pc?.sctp?.maxMessageSize
    const chunkSize =
      negotiatedMaximum && negotiatedMaximum > 0
        ? Math.min(SPEED_TEST_CHUNK_SIZE, negotiatedMaximum)
        : SPEED_TEST_CHUNK_SIZE
    const fullChunk = new ArrayBuffer(chunkSize)

    channel.send(
      JSON.stringify({
        type,
        id,
        size: RTC_SPEED_TEST_SAMPLE_SIZE,
      })
    )

    for (let sentBytes = 0; sentBytes < RTC_SPEED_TEST_SAMPLE_SIZE; ) {
      if (channel.readyState !== "open") {
        throw new Error("File channel closed during speed test")
      }
      if (channel.bufferedAmount >= MAX_BUFFERED_AMOUNT) {
        await this.waitForBuffer(channel)
      }

      const remainingBytes = RTC_SPEED_TEST_SAMPLE_SIZE - sentBytes
      const payload =
        remainingBytes >= chunkSize
          ? fullChunk
          : fullChunk.slice(0, remainingBytes)
      channel.send(payload)
      sentBytes += payload.byteLength
    }

    await this.waitForBuffer(channel)
  }

  private sendSpeedTestError(id: string, message: string) {
    const channel = this.fileChannel
    if (channel?.readyState !== "open") return

    channel.send(JSON.stringify({ type: "speed-test-error", id, message }))
  }

  private async finishIncomingSpeedTest() {
    const incoming = this.incomingSpeedTest
    const channel = this.fileChannel
    if (!incoming || !channel || channel.readyState !== "open") return

    this.incomingSpeedTest = null
    const elapsedSeconds = Math.max(
      (performance.now() - incoming.startedAt) / 1000,
      0.001
    )
    const measuredMbps =
      (incoming.receivedBytes * 8) / elapsedSeconds / 1_000_000

    useRtcStore.setState({ downloadMbps: measuredMbps })
    channel.send(
      JSON.stringify({
        type: "speed-test-upload-result",
        id: incoming.id,
        mbps: measuredMbps,
        complete: !incoming.returnSample,
      })
    )

    if (!incoming.returnSample) {
      this.stopSpeedTest()
      return
    }

    useRtcStore.setState({
      speedTestDirection: "upload",
      speedTestWaiting: false,
    })

    try {
      await this.sendSpeedTestSample(incoming.id, "speed-test-return-start")
      if (this.speedTestId === incoming.id) {
        useRtcStore.setState({
          speedTestDirection: null,
          speedTestWaiting: true,
        })
      }
    } catch (error) {
      console.error("Return speed test failed", error)
      this.sendSpeedTestError(incoming.id, "The return speed test failed")
      this.stopSpeedTest()
      toast.error("Speed test failed")
    }
  }

  private handleIncomingSpeedTestChunk(chunk: ArrayBuffer) {
    const incoming = this.incomingSpeedTest
    if (!incoming) return

    incoming.receivedBytes += chunk.byteLength
    if (incoming.receivedBytes >= incoming.size) {
      void this.finishIncomingSpeedTest()
    }
  }

  private async handleSpeedTestControl(data: SpeedTestControlMessage) {
    const type = typeof data.type === "string" ? data.type : ""
    const id = typeof data.id === "string" ? data.id : ""
    if (!id) return

    if (type === "speed-test-error") {
      if (this.speedTestId !== id) return
      this.stopSpeedTest()
      toast.error(
        typeof data.message === "string" ? data.message : "Speed test failed"
      )
      return
    }

    if (type === "speed-test-upload-result") {
      if (this.speedTestId !== id) return
      if (typeof data.mbps === "number" && Number.isFinite(data.mbps)) {
        useRtcStore.setState({ uploadMbps: Math.max(0, data.mbps) })
      }
      if (data.complete === true) this.stopSpeedTest()
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
      this.sendSpeedTestError(id, "The speed test sample was invalid")
      return
    }

    if (this.incomingTransfer || this.outgoingFile) {
      this.sendSpeedTestError(
        id,
        "Finish the active file transfer before testing"
      )
      return
    }

    if (this.speedTestId && this.speedTestId !== id) {
      this.sendSpeedTestError(id, "Another speed test is already running")
      return
    }

    if (type === "speed-test-start") {
      useRtcStore.setState({ uploadMbps: null, downloadMbps: null })
    }

    this.speedTestId = id
    this.incomingSpeedTest = {
      id,
      size: data.size,
      receivedBytes: 0,
      startedAt: performance.now(),
      returnSample: type === "speed-test-start",
    }
    useRtcStore.setState({
      speedTestRunning: true,
      speedTestDirection: "download",
      speedTestWaiting: false,
    })
  }

  private stopSpeedTest() {
    this.speedTestId = null
    this.incomingSpeedTest = null
    useRtcStore.setState({
      speedTestRunning: false,
      speedTestDirection: null,
      speedTestWaiting: false,
    })
  }

  private async uploadFile(file: File, fileId: string) {
    const channel = this.fileChannel
    if (!channel || channel.readyState !== "open") {
      throw new Error("File channel is not open")
    }

    const negotiatedMaximum = this.pc?.sctp?.maxMessageSize
    const bufferSize =
      negotiatedMaximum && negotiatedMaximum > 0
        ? Math.min(SAFE_FILE_CHUNK_SIZE, negotiatedMaximum)
        : SAFE_FILE_CHUNK_SIZE
    let lastReportedBytes = 0

    channel.send(
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

      if (channel.readyState !== "open") {
        throw new Error("File channel closed during transfer")
      }
      if (channel.bufferedAmount >= MAX_BUFFERED_AMOUNT) {
        await this.waitForBuffer(channel)
      }

      channel.send(buffer)
      const transferredBytes = Math.min(
        current + buffer.byteLength,
        file.size
      )
      const shouldReportProgress =
        lastReportedBytes === 0 ||
        transferredBytes - lastReportedBytes >= PROGRESS_REPORT_INTERVAL ||
        transferredBytes >= file.size

      if (shouldReportProgress) {
        lastReportedBytes = transferredBytes
        this.updateMessages((messages) =>
          messages.map((item) =>
            item.id === fileId ? { ...item, transferredBytes } : item
          )
        )
      }
    }

    await this.waitForBuffer(channel)
    channel.send(JSON.stringify({ type: "file-complete", id: fileId }))
  }
}

export const rtcSession = new RtcSessionController()
