import { toast } from "react-hot-toast"

import type { ChatItem } from "@/components/rtc/types"
import {
  createFolderArchive,
  LARGE_TRANSFER_WARNING_BYTES,
  MAX_TRANSFER_BYTES,
  MAX_TRANSFER_LABEL,
  type FolderSourceFile,
} from "@/Utils/folderArchive"

import { ICE_CONFIG } from "@/Utils/webrtc/webrtcHelper"
import useUserStore, { type AppWebSocket } from "@/UserStore"
import {
  cancelLargeTransferConfirmation,
  requestLargeTransferConfirmation,
} from "@/global/rtc/largeTransferConfirmation"
import useRtcStore, { resetRtcStore } from "@/global/rtc/rtcStore"

const SAFE_FILE_CHUNK_SIZE = 16 * 1024
const MAX_BUFFERED_AMOUNT = 1024 * 1024
const BUFFERED_AMOUNT_LOW_THRESHOLD = 256 * 1024
const PROGRESS_REPORT_INTERVAL = 256 * 1024
export const RTC_SPEED_TEST_SAMPLE_SIZE = 4 * 1024 * 1024
const SPEED_TEST_CHUNK_SIZE = 16 * 1024
const CALL_CONTROL_PROTOCOL = "peertoss-call-v1"
const SESSION_CONTROL_PROTOCOL = "peertoss-session-v1"
const PEER_DISCONNECT_GRACE_MS = 8_000
const SIGNALING_ERROR_TOAST_THROTTLE_MS = 5_000
const SIGNALING_ERROR_TOAST_ID = "rtc-signaling-error"
const INITIAL_OFFER_DELAY_MS = 1_500
const ICE_RESTART_DELAY_MS = 1_000
const MAX_ICE_RESTART_ATTEMPTS = 2
const LARGE_FOLDER_FILE_WARNING_COUNT = 5_000


type IncomingTransfer = {
  fileId: string
  name: string
  size: number
  mime: string
  folderArchive: boolean
  fileCount?: number
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
  folderArchive?: unknown
  fileCount?: unknown
}

type FileTransferMetadata = {
  folderArchive?: boolean
  fileCount?: number
}

type CallControlType =
  | "call-request"
  | "call-accepted"
  | "call-rejected"
  | "call-cancelled"
  | "call-ended"

type CallControlMessage = {
  protocol?: unknown
  type?: unknown
  callId?: unknown
  reason?: unknown
}

type SessionControlMessage = {
  protocol?: unknown
  type?: unknown
}

type SignalingErrorData = {
  message?: unknown
  msg?: unknown
  error?: unknown
  phase?: unknown
}

type RemoteStreamListener = (stream: MediaStream | null) => void

export type LocalVideoSource = "camera" | "screen"
export type RtcNegotiationRole = "creator" | "participant"

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
  private localStream: MediaStream | null = null
  private localVideoSource: LocalVideoSource | null = null
  private remoteStream: MediaStream | null = null
  private remoteStreamListeners = new Set<RemoteStreamListener>()
  private pendingRemoteIceCandidates: RTCIceCandidateInit[] = []
  private signalingMessageQueue: Promise<void> = Promise.resolve()
  private polite = true
  private makingOffer = false
  private ignoreOffer = false
  private isSettingRemoteAnswerPending = false
  private negotiationPending = false
  private initialOfferTimer: ReturnType<typeof setTimeout> | null = null
  private iceRestartTimer: ReturnType<typeof setTimeout> | null = null
  private iceRestartAttempts = 0
  private peerDisconnectTimer: ReturnType<typeof setTimeout> | null = null
  private peerDisconnectHandled = false
  private lastSignalingErrorToastAt = 0

  setNegotiationRole(role: RtcNegotiationRole) {
    this.polite = role === "participant"
  }

  attachSocket(socket: AppWebSocket | null) {
    if (this.ws === socket) return

    this.clearInitialOfferTimer()
    this.clearIceRestartTimer()
    this.detachSocket()
    this.ws = socket
    this.pendingRemoteIceCandidates = []
    this.signalingMessageQueue = Promise.resolve()
    this.makingOffer = false
    this.ignoreOffer = false
    this.isSettingRemoteAnswerPending = false
    this.negotiationPending = false
    this.iceRestartAttempts = 0
    if (socket) this.lastSignalingErrorToastAt = 0

    socket?.addEventListener("message", this.handleSocketMessage)
    socket?.addEventListener("close", this.handleSocketClose)
    socket?.addEventListener("error", this.handleSocketError)
  }

  detachSocket(socket?: AppWebSocket | null) {
    if (!this.ws || (socket !== undefined && this.ws !== socket)) return

    this.ws.removeEventListener("message", this.handleSocketMessage)
    this.ws.removeEventListener("close", this.handleSocketClose)
    this.ws.removeEventListener("error", this.handleSocketError)
    this.ws = null
  }

  startPeer() {
    if (this.pc && this.pc.connectionState !== "closed") return this.pc

    if (this.pc) this.detachPeer(this.pc)
    this.clearPeerDisconnectTimer()
    this.clearIceRestartTimer()
    this.peerDisconnectHandled = false
    this.pendingRemoteIceCandidates = []
    this.makingOffer = false
    this.ignoreOffer = false
    this.isSettingRemoteAnswerPending = false
    this.negotiationPending = false
    this.iceRestartAttempts = 0

    const peer = new RTCPeerConnection(ICE_CONFIG)
    this.pc = peer

    peer.addEventListener("icecandidate", this.handleIceCandidate)
    peer.addEventListener(
      "iceconnectionstatechange",
      this.handleIceConnectionStateChange
    )
    peer.addEventListener(
      "connectionstatechange",
      this.handleConnectionStateChange
    )
    peer.addEventListener("datachannel", this.handleDataChannel)
    peer.addEventListener("track", this.handleTrack)

    useRtcStore.setState({
      peerCreated: true,
      status: "peer created",
    })

    return peer
  }

  scheduleInitialOffer(socket: AppWebSocket) {
    this.setNegotiationRole("creator")
    this.attachSocket(socket)
    const peer = this.startPeer()

    this.clearInitialOfferTimer()
    useRtcStore.setState({ status: "connecting" })

    this.initialOfferTimer = setTimeout(() => {
      this.initialOfferTimer = null
      if (
        this.ws !== socket ||
        this.pc !== peer ||
        socket.readyState !== WebSocket.OPEN
      ) {
        return
      }
      void this.sendOffer()
    }, INITIAL_OFFER_DELAY_MS)
  }

  setLocalStream(
    stream: MediaStream,
    videoSource: LocalVideoSource | null = "camera"
  ) {
    this.localStream = stream
    this.localVideoSource = stream.getVideoTracks().length > 0
      ? videoSource
      : null
  }

  getLocalStream() {
    return this.localStream
  }

  getLocalVideoSource() {
    return this.localVideoSource
  }

  async replaceLocalStream(
    nextStream: MediaStream,
    videoSource: LocalVideoSource | null
  ) {
    const previousStream = this.localStream
    if (previousStream === nextStream) {
      this.localVideoSource = nextStream.getVideoTracks().length > 0
        ? videoSource
        : null
      return this.isLocalStreamPublished()
    }

    const pc = this.pc
    const previousTracks = new Set(previousStream?.getTracks() ?? [])
    const nextTracks = nextStream.getTracks()
    const retainedStream = previousStream ?? nextStream
    const publishedSenders = pc
      ? pc.getSenders()
        .filter(
          (sender) => sender.track && previousTracks.has(sender.track)
        )

      : []
    const wasPublished = publishedSenders.length > 0
    let negotiationRequired = false

    if (pc && wasPublished) {
      const unmatchedTracks = [...nextTracks]

      for (const sender of publishedSenders) {
        const previousTrack = sender.track
        if (!previousTrack) continue

        const replacementIndex = unmatchedTracks.findIndex(
          (track) => track.kind === previousTrack.kind
        )
        const replacementTrack = replacementIndex >= 0
          ? unmatchedTracks.splice(replacementIndex, 1)[0]
          : null

        if (replacementTrack !== previousTrack) {
          await sender.replaceTrack(replacementTrack)
        }
      }

      for (const track of unmatchedTracks) {
        const dormantTransceiver = pc.getTransceivers().find(
          (transceiver) =>
            transceiver.sender.track === null &&
            transceiver.receiver.track.readyState === "live" &&
            transceiver.receiver.track.kind === track.kind
        )

        if (dormantTransceiver) {
          await dormantTransceiver.sender.replaceTrack(track)
        } else {
          pc.addTrack(track, retainedStream)
          negotiationRequired = true
        }
      }
    }

    if (previousStream) {
      for (const track of previousTracks) {
        if (!nextTracks.includes(track)) previousStream.removeTrack(track)
      }
      for (const track of nextTracks) {
        if (!previousTracks.has(track)) previousStream.addTrack(track)
      }
    }

    this.localStream = retainedStream
    this.localVideoSource = retainedStream.getVideoTracks().length > 0
      ? videoSource
      : null

    const retainedTracks = new Set(nextTracks)
    for (const track of previousTracks) {
      if (!retainedTracks.has(track)) track.stop()
    }

    if (negotiationRequired) await this.createAndSendOffer()
    return wasPublished
  }

  isLocalStreamPublished() {
    const pc = this.pc
    const stream = this.localStream
    if (!pc || !stream) return false

    const localTracks = new Set(stream.getTracks())
    return pc
      .getSenders()
      .some((sender) => sender.track && localTracks.has(sender.track))
  }

  async publishLocalStream() {
    const pc = this.pc
    const stream = this.localStream
    if (!pc) throw new Error("The peer connection has not been created")
    if (!stream) throw new Error("Start the camera or screen before sending media")

    let trackAdded = false
    for (const track of stream.getTracks()) {
      const alreadyAdded = pc
        .getSenders()
        .some((sender) => sender.track === track)
      if (alreadyAdded) continue

      pc.addTrack(track, stream)
      trackAdded = true
    }

    if (trackAdded) await this.createAndSendOffer()
  }

  async unpublishLocalStream() {
    const pc = this.pc
    const stream = this.localStream
    if (!pc || !stream) return

    const localTracks = new Set(stream.getTracks())
    let trackRemoved = false

    for (const sender of pc.getSenders()) {
      if (!sender.track || !localTracks.has(sender.track)) continue
      pc.removeTrack(sender)
      trackRemoved = true
    }

    if (trackRemoved) await this.createAndSendOffer()
  }

  async stopLocalStream({ renegotiate = true }: { renegotiate?: boolean } = {}) {
    const stream = this.localStream
    if (!stream) return

    const pc = this.pc
    const localTracks = new Set(stream.getTracks())
    let trackRemoved = false

    if (pc) {
      for (const sender of pc.getSenders()) {
        if (!sender.track || !localTracks.has(sender.track)) continue
        pc.removeTrack(sender)
        trackRemoved = true
      }
    }

    for (const track of localTracks) track.stop()
    this.localStream = null
    this.localVideoSource = null

    if (trackRemoved && renegotiate) await this.createAndSendOffer()
  }

  subscribeRemoteStream(listener: RemoteStreamListener) {
    this.remoteStreamListeners.add(listener)
    listener(this.remoteStream)

    return () => {
      this.remoteStreamListeners.delete(listener)
    }
  }

  private handleTrack = (event: RTCTrackEvent) => {
    const eventStream = event.streams[0]

    if (eventStream) {
      this.remoteStream = eventStream
    } else {
      const stream = this.remoteStream ?? new MediaStream()
      if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track)
      this.remoteStream = stream
    }

    this.notifyRemoteStreamListeners()
  }

  private notifyRemoteStreamListeners() {
    for (const listener of this.remoteStreamListeners) {
      listener(this.remoteStream)
    }
  }

  private clearRemoteStream() {
    if (!this.remoteStream) return
    this.remoteStream = null
    this.notifyRemoteStreamListeners()
  }

  async sendOffer() {
    const pc = this.pc
    if (!pc) {
      this.reportSignalingError(
        new Error("The peer connection has not been created"),
        "create-offer"
      )
      return
    }

    if (!this.chatChannel) {
      this.attachChatChannel(pc.createDataChannel("chat"))
    }
    if (!this.fileChannel) {
      this.attachFileChannel(pc.createDataChannel("file"))
    }

    try {
      await this.createAndSendOffer()
    } catch {
      // createAndSendOffer already reports signaling failures.
    }
  }

  private async createAndSendOffer() {
    const pc = this.pc
    const ws = this.ws
    if (!pc || !ws || ws.readyState !== WebSocket.OPEN) {
      const error = new Error("WebRTC signaling is not ready")
      this.reportSignalingError(error, "create-offer")
      throw error
    }

    if (this.makingOffer || pc.signalingState !== "stable") {
      this.negotiationPending = true
      return
    }

    this.makingOffer = true
    try {
      const offer = await pc.createOffer()
      if (
        this.pc !== pc ||
        this.ws !== ws ||
        ws.readyState !== WebSocket.OPEN
      ) {
        return
      }
      if (pc.signalingState !== "stable") {
        this.negotiationPending = true
        return
      }
      await pc.setLocalDescription(offer)

      const payload = {
        event: "create-offer",
        data: pc.localDescription,
      }
      console.log("sending offer:", payload)
      ws.send(JSON.stringify(payload))
    } catch (error) {
      if (
        this.pc === pc &&
        this.ws === ws &&
        this.polite &&
        pc.signalingState !== "stable"
      ) {
        this.negotiationPending = true
        return
      }
      this.reportSignalingError(error, "create-offer")
      throw error
    } finally {
      this.makingOffer = false
      this.flushPendingNegotiation()
    }
  }

  private flushPendingNegotiation() {
    const pc = this.pc
    if (
      !this.negotiationPending ||
      this.makingOffer ||
      !pc ||
      pc.signalingState !== "stable"
    ) {
      return
    }

    this.negotiationPending = false
    void this.createAndSendOffer().catch(() => {
      // createAndSendOffer reports actionable signaling failures.
    })
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

  requestVideoCall() {
    const state = useRtcStore.getState()
    if (state.callStatus !== "idle") {
      toast.error("A video call is already in progress")
      return false
    }

    const callId = crypto.randomUUID()
    if (!this.sendCallControl("call-request", callId)) return false

    useRtcStore.setState({ callStatus: "outgoing", callId })
    return true
  }

  acceptVideoCall() {
    const { callId, callStatus } = useRtcStore.getState()
    if (callStatus !== "incoming" || !callId) return false
    if (!this.sendCallControl("call-accepted", callId)) return false

    useRtcStore.setState({ callStatus: "active" })
    toast.success("Video call accepted")
    return true
  }

  rejectVideoCall() {
    const { callId, callStatus } = useRtcStore.getState()
    if (callStatus !== "incoming" || !callId) return false

    this.sendCallControl("call-rejected", callId)
    useRtcStore.setState({ callStatus: "idle", callId: null })
    return true
  }

  cancelVideoCall() {
    const { callId, callStatus } = useRtcStore.getState()
    if (callStatus !== "outgoing" || !callId) return false

    this.sendCallControl("call-cancelled", callId)
    useRtcStore.setState({ callStatus: "idle", callId: null })
    return true
  }

  async endVideoCall() {
    const { callId, callStatus } = useRtcStore.getState()
    if (callStatus === "active" && callId) {
      this.sendCallControl("call-ended", callId)
    }

    try {
      await this.stopLocalStream()
    } finally {
      useRtcStore.setState({ callStatus: "idle", callId: null })
    }
  }

  private sendCallControl(
    type: CallControlType,
    callId: string,
    reason?: string
  ) {
    const channel = this.chatChannel
    if (!channel || channel.readyState !== "open") {
      toast.error("Connect to the peer before starting a video call")
      return false
    }

    try {
      channel.send(
        JSON.stringify({
          protocol: CALL_CONTROL_PROTOCOL,
          type,
          callId,
          ...(reason ? { reason } : {}),
        })
      )
      return true
    } catch (error) {
      console.error("Could not send video call control message", error)
      toast.error("The video call request could not be sent")
      return false
    }
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

  private beginFileTransfer() {
    const channel = this.fileChannel
    if (!channel || channel.readyState !== "open") {
      toast.error("The file channel is not ready yet")
      return null
    }
    if (this.speedTestId) {
      toast.error("Wait for the speed test to finish")
      return null
    }
    if (this.outgoingFile) {
      toast.error("Finish the active file transfer first")
      return null
    }

    this.outgoingFile = true
    useRtcStore.setState({ sendingFile: true })
    return channel
  }

  private finishFileTransfer() {
    this.outgoingFile = false
    useRtcStore.setState({ sendingFile: false })
  }

  async sendFile(file: File) {
    if (file.size > MAX_TRANSFER_BYTES) {
      toast.error(
        `Files larger than ${MAX_TRANSFER_LABEL} are not supported.`
      )
      return
    }
    if (file.size > LARGE_TRANSFER_WARNING_BYTES) {
      const confirmed = await requestLargeTransferConfirmation({
        kind: "file",
        name: file.name,
        size: file.size,
      })
      if (!confirmed) return
    }

    const channel = this.beginFileTransfer()
    if (!channel) return

    try {
      await this.transferFile(file, channel)
    } finally {
      this.finishFileTransfer()
    }
  }

  async sendFolder(
    files: Array<File | FolderSourceFile>,
    ignoredEntryCount = 0,
    ignoreGenerated = true
  ) {
    if (files.length === 0) {
      toast.error("Choose a folder with at least one file")
      return
    }

    const folderBytes = files.reduce(
      (total, source) =>
        total + (source instanceof File ? source.size : source.file.size),
      0
    )
    if (folderBytes > MAX_TRANSFER_BYTES) {
      toast.error(
        `Folders larger than ${MAX_TRANSFER_LABEL} are not supported.`
      )
      return
    }
    if (
      folderBytes > LARGE_TRANSFER_WARNING_BYTES ||
      files.length > LARGE_FOLDER_FILE_WARNING_COUNT
    ) {
      const confirmed = await requestLargeTransferConfirmation({
        kind: "folder",
        fileCount: files.length,
        size: folderBytes,
      })
      if (!confirmed) return
    }

    const channel = this.beginFileTransfer()
    if (!channel) return

    const preparingToast = toast.loading(`Zipping ${files.length} files…`)
    try {
      const archive = await createFolderArchive(files, { ignoreGenerated })
      toast.dismiss(preparingToast)
      const ignoredCount = ignoredEntryCount + archive.ignoredCount
      if (ignoredCount > 0) {
        toast(`Skipped ${ignoredCount} generated or cache ${ignoredCount === 1 ? "entry" : "entries"}`)
      }
      await this.transferFile(archive.file, channel, {
        folderArchive: true,
        fileCount: archive.fileCount,
      })
    } catch (error) {
      console.error("Folder preparation failed", error)
      toast.dismiss(preparingToast)
      toast.error(
        error instanceof Error ? error.message : "Could not prepare the folder"
      )
    } finally {
      this.finishFileTransfer()
    }
  }

  private async transferFile(
    file: File,
    channel: RTCDataChannel,
    metadata: FileTransferMetadata = {}
  ) {
    const fileId = crypto.randomUUID()
    const previewUrl = URL.createObjectURL(file)
    this.objectUrls.add(previewUrl)

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
        folderArchive: metadata.folderArchive,
        fileCount: metadata.fileCount,
        transferredBytes: 0,
        transferStatus: "sending",
      },
    ])

    try {
      await this.uploadFile(file, fileId, metadata)
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
      toast.success(metadata.folderArchive ? "Folder sent" : "File sent")
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
    }
  }

  endSession({
    closeSocket = true,
    notifyPeer = true,
  }: { closeSocket?: boolean; notifyPeer?: boolean } = {}) {
    const socket = this.ws
    const peer = this.pc
    const chatChannel = this.chatChannel
    const fileChannel = this.fileChannel

    if (notifyPeer) this.sendPeerLeaving()
    cancelLargeTransferConfirmation()
    this.clearInitialOfferTimer()
    this.clearIceRestartTimer()
    this.clearPeerDisconnectTimer()
    this.peerDisconnectHandled = true

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
    this.pendingRemoteIceCandidates = []
    this.signalingMessageQueue = Promise.resolve()
    this.polite = true
    this.makingOffer = false
    this.ignoreOffer = false
    this.isSettingRemoteAnswerPending = false
    this.negotiationPending = false
    this.iceRestartAttempts = 0

    this.localStream?.getTracks().forEach((track) => track.stop())
    this.localStream = null
    this.localVideoSource = null
    this.clearRemoteStream()

    for (const url of this.objectUrls) URL.revokeObjectURL(url)
    this.objectUrls.clear()
    resetRtcStore()
  }

  private sendPeerLeaving() {
    const channel = this.chatChannel
    if (!channel || channel.readyState !== "open") return

    try {
      channel.send(
        JSON.stringify({
          protocol: SESSION_CONTROL_PROTOCOL,
          type: "peer-leaving",
        })
      )
    } catch (error) {
      console.warn("Could not notify the peer before leaving", error)
    }
  }

  private clearPeerDisconnectTimer() {
    if (this.peerDisconnectTimer === null) return
    clearTimeout(this.peerDisconnectTimer)
    this.peerDisconnectTimer = null
  }

  private clearInitialOfferTimer() {
    if (this.initialOfferTimer === null) return
    clearTimeout(this.initialOfferTimer)
    this.initialOfferTimer = null
  }

  private clearIceRestartTimer() {
    if (this.iceRestartTimer === null) return
    clearTimeout(this.iceRestartTimer)
    this.iceRestartTimer = null
  }

  private scheduleIceRestart() {
    if (this.peerDisconnectHandled || this.iceRestartTimer !== null) return

    const pc = this.pc
    const ws = this.ws
    if (
      !pc ||
      !ws ||
      ws.readyState !== WebSocket.OPEN ||
      this.iceRestartAttempts >= MAX_ICE_RESTART_ATTEMPTS
    ) {
      this.handlePeerDisconnected(
        "The local peer connection could not be restored"
      )
      return
    }

    this.iceRestartAttempts += 1
    useRtcStore.setState({ status: "reconnecting" })
    console.warn(
      `ICE failed; retrying (${this.iceRestartAttempts}/${MAX_ICE_RESTART_ATTEMPTS})`
    )

    this.iceRestartTimer = setTimeout(() => {
      this.iceRestartTimer = null
      if (
        this.pc !== pc ||
        this.ws !== ws ||
        ws.readyState !== WebSocket.OPEN ||
        pc.connectionState === "closed"
      ) {
        return
      }

      pc.restartIce()
      void this.sendOffer()
    }, ICE_RESTART_DELAY_MS)
  }

  private schedulePeerDisconnect() {
    if (this.peerDisconnectHandled || this.peerDisconnectTimer !== null) return

    this.peerDisconnectTimer = setTimeout(() => {
      this.peerDisconnectTimer = null

      const connectionState = this.pc?.connectionState
      const iceConnectionState = this.pc?.iceConnectionState
      const { chatReady, fileReady } = useRtcStore.getState()
      if (
        connectionState === "disconnected" ||
        connectionState === "failed" ||
        iceConnectionState === "disconnected" ||
        iceConnectionState === "failed" ||
        !chatReady ||
        !fileReady
      ) {
        this.handlePeerDisconnected()
      }
    }, PEER_DISCONNECT_GRACE_MS)
  }

  private handleTransportFailure() {
    if (this.peerDisconnectHandled) return

    useRtcStore.setState({ status: "reconnecting" })
    if (this.polite) {
      this.schedulePeerDisconnect()
    } else {
      this.scheduleIceRestart()
    }
  }

  private handlePeerDisconnected(
    message: string | null = "The other device left the room"
  ) {
    if (this.peerDisconnectHandled) return

    this.peerDisconnectHandled = true
    const socket = this.ws
    this.endSession({ notifyPeer: false })

    const userStore = useUserStore.getState()
    if (!socket || userStore.ws === socket) userStore.setWs(null)

    useRtcStore.setState({
      status: "disconnected",
      peerDisconnectedDialogOpen: true,
      peerDisconnectedMessage:
        message ?? "The room connection has ended.",
    })
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
    peer.removeEventListener("track", this.handleTrack)
    this.clearRemoteStream()
    if (this.pc === peer) this.pc = null
  }

  private handleSocketMessage = (event: MessageEvent) => {
    if (typeof event.data !== "string") return

    let message: { event?: unknown; data?: unknown }
    try {
      message = JSON.parse(event.data) as { event?: unknown; data?: unknown }
    } catch {
      return
    }

    const socket = event.currentTarget as AppWebSocket | null
    if (!socket) return

    this.signalingMessageQueue = this.signalingMessageQueue
      .then(() => this.processSocketMessage(socket, message))
      .catch((error) => {
        console.error("Could not process queued WebRTC signaling", error)
      })
  }

  private async processSocketMessage(
    socket: AppWebSocket,
    message: { event?: unknown; data?: unknown }
  ) {
    if (this.ws !== socket) return

    if (message.event === "error") {
      const errorMessage = this.getSignalingErrorMessage(
        message.data,
        "The WebRTC handshake failed"
      )
      const errorPhase =
        message.data && typeof message.data === "object" &&
          typeof (message.data as SignalingErrorData).phase === "string"
          ? (message.data as SignalingErrorData).phase as string
          : "remote-signaling"
      console.error("Signaling server error:", message.data)
      this.handleSignalingFailure(errorMessage, errorPhase)
      return
    }

    if (message.event === "user-left") {
      if (this.pc?.connectionState === "connected") return
      this.handlePeerDisconnected()
      return
    }

    if (!this.pc && message.event === "recieve-offer") this.startPeer()
    if (!this.pc) return
    const pc = this.pc
    try {
      if (message.event === "recieve-offer") {
        console.log("got offer:", message.data)
        const description = message.data as RTCSessionDescriptionInit
        const readyForOffer =
          !this.makingOffer &&
          (pc.signalingState === "stable" ||
            this.isSettingRemoteAnswerPending)
        const offerCollision = description.type === "offer" && !readyForOffer

        this.ignoreOffer = !this.polite && offerCollision
        if (this.ignoreOffer) return

        if (offerCollision && pc.signalingState !== "stable") {
          await pc.setLocalDescription({ type: "rollback" })
        }
        await pc.setRemoteDescription(description)
        if (this.ws !== socket || this.pc !== pc) return
        await this.flushPendingRemoteIceCandidates(pc)
        await this.sendAnswer(socket, pc)
        this.flushPendingNegotiation()
      } else if (message.event === "recieve-answer") {
        console.log("got answer:", message.data)
        this.ignoreOffer = false
        this.isSettingRemoteAnswerPending = true
        try {
          await pc.setRemoteDescription(
            message.data as RTCSessionDescriptionInit
          )
        } finally {
          this.isSettingRemoteAnswerPending = false
        }
        if (this.ws !== socket || this.pc !== pc) return
        await this.flushPendingRemoteIceCandidates(pc)
        this.flushPendingNegotiation()
      } else if (message.event === "ack-ice-candidate") {
        console.log("got remote ICE:", message.data)
        const candidate = message.data as RTCIceCandidateInit
        if (pc.remoteDescription) {
          await this.addRemoteIceCandidate(pc, candidate)
        } else if (!this.ignoreOffer) {
          this.pendingRemoteIceCandidates.push(candidate)
        }
      }
    } catch (error) {
      if (this.ws !== socket || this.pc !== pc) return
      console.error("WebRTC signaling message failed", error)
      this.reportSignalingError(
        error,
        typeof message.event === "string" ? message.event : "unknown"
      )
    }
  }

  private async flushPendingRemoteIceCandidates(pc: RTCPeerConnection) {
    const candidates = this.pendingRemoteIceCandidates.splice(0)
    for (const candidate of candidates) {
      await this.addRemoteIceCandidate(pc, candidate)
    }
  }

  private async addRemoteIceCandidate(
    pc: RTCPeerConnection,
    candidate: RTCIceCandidateInit
  ) {
    try {
      await pc.addIceCandidate(candidate)
    } catch (error) {
      if (!this.ignoreOffer) {
        console.warn("Ignored an unusable remote ICE candidate", error)
      }
    }
  }

  private getSignalingErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) return error.message
    if (typeof error === "string" && error.trim()) return error

    if (error && typeof error === "object") {
      const data = error as SignalingErrorData
      for (const value of [data.message, data.msg, data.error]) {
        if (typeof value === "string" && value.trim()) return value
      }
    }

    return fallback
  }

  private showSignalingErrorToast(errorMessage: string) {
    const now = Date.now()
    if (
      now - this.lastSignalingErrorToastAt <
      SIGNALING_ERROR_TOAST_THROTTLE_MS
    ) {
      return
    }

    this.lastSignalingErrorToastAt = now
    toast.error(errorMessage, { id: SIGNALING_ERROR_TOAST_ID })
  }

  private handleSignalingFailure(errorMessage: string, phase: string) {
    useRtcStore.setState({ status: "signaling error" })
    this.showSignalingErrorToast(`${errorMessage} · ${phase}`)
  }

  private reportSignalingError(error: unknown, phase: string) {
    const errorMessage = this.getSignalingErrorMessage(
      error,
      "The WebRTC handshake failed"
    )
    console.error(`WebRTC signaling failed during ${phase}:`, error)

    this.handleSignalingFailure(errorMessage, phase)
  }

  private handleSocketClose = (event: CloseEvent) => {
    const socket = event.currentTarget as AppWebSocket | null
    if (socket && this.ws !== socket) return

    const rateLimited =
      event.code === 1008 && event.reason.includes("rate limit")
    if (rateLimited) {
      toast.error("Too many signaling messages. Reconnect and try again.")
    }

    if (this.pc?.connectionState === "connected") {
      this.detachSocket(socket)
      const userStore = useUserStore.getState()
      if (!socket || userStore.ws === socket) userStore.setWs(null)
      useRtcStore.setState({ status: "connected" })
      return
    }

    this.handlePeerDisconnected(
      rateLimited
        ? null
        : "The room connection closed"
    )
  }

  private handleSocketError = () => {
    if (this.pc?.connectionState === "connected") return
    useRtcStore.setState({ status: "signaling error" })
  }

  private sendAnswer = async (
    socket: AppWebSocket,
    pc: RTCPeerConnection
  ) => {
    if (
      this.pc !== pc ||
      this.ws !== socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      throw new Error("WebRTC signaling is not ready")
    }

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    if (
      this.pc !== pc ||
      this.ws !== socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return
    }
    socket.send(
      JSON.stringify({
        event: "create-answer",
        data: pc.localDescription,
      })
    )
    console.log("answer sent")
  }

  private sendIceCandidate(
    peer: RTCPeerConnection,
    ice: RTCIceCandidate
  ) {
    const ws = this.ws
    if (
      this.pc !== peer ||
      !ws ||
      ws.readyState !== WebSocket.OPEN
    ) {
      return
    }

    try {
      const payload = {
        event: "send-ice-candidate",
        data: ice,
      }
      console.log("sending Ice-Candidate")
      ws.send(JSON.stringify(payload))
    } catch (error) {
      this.reportSignalingError(error, "send-ice-candidate")
    }
  }

  private handleIceCandidate = (event: RTCPeerConnectionIceEvent) => {
    const peer = event.currentTarget as RTCPeerConnection | null
    if (event.candidate && peer) this.sendIceCandidate(peer, event.candidate)
  }

  private handleIceConnectionStateChange = () => {
    const pc = this.pc
    if (!pc) return

    console.log("ice state:", pc.iceConnectionState)
    if (
      pc.iceConnectionState === "connected" ||
      pc.iceConnectionState === "completed"
    ) {
      this.clearPeerDisconnectTimer()
      this.clearIceRestartTimer()
      this.iceRestartAttempts = 0
    } else if (pc.iceConnectionState === "disconnected") {
      this.handleTransportFailure()
    } else if (pc.iceConnectionState === "failed") {
      this.handleTransportFailure()
    } else if (pc.iceConnectionState === "closed") {
      this.handlePeerDisconnected()
    }
  }

  private handleConnectionStateChange = () => {
    const pc = this.pc
    if (!pc) return

    const connectionState = pc.connectionState
    console.log("pc state:", connectionState)
    useRtcStore.setState({ status: connectionState })

    if (connectionState === "connected") {
      this.clearPeerDisconnectTimer()
      this.clearIceRestartTimer()
      this.iceRestartAttempts = 0
    } else if (connectionState === "disconnected") {
      this.handleTransportFailure()
    } else if (connectionState === "failed") {
      this.handleTransportFailure()
    } else if (connectionState === "closed") {
      this.handlePeerDisconnected()
    }
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
    if (
      typeof event.data === "string" &&
      (this.handleSessionControlMessage(event.data) ||
        this.handleCallControlMessage(event.data))
    ) {
      return
    }

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

  private handleSessionControlMessage(rawMessage: string) {
    let message: SessionControlMessage
    try {
      message = JSON.parse(rawMessage) as SessionControlMessage
    } catch {
      return false
    }

    if (message.protocol !== SESSION_CONTROL_PROTOCOL) return false
    if (message.type === "peer-leaving") this.handlePeerDisconnected()
    return true
  }

  private handleCallControlMessage(rawMessage: string) {
    let message: CallControlMessage
    try {
      message = JSON.parse(rawMessage) as CallControlMessage
    } catch {
      return false
    }

    if (message.protocol !== CALL_CONTROL_PROTOCOL) return false
    if (typeof message.type !== "string" || typeof message.callId !== "string") {
      return true
    }

    const state = useRtcStore.getState()
    const callId = message.callId

    if (message.type === "call-request") {
      if (state.callStatus === "idle") {
        useRtcStore.setState({ callStatus: "incoming", callId })
        toast("Incoming video call", { icon: "📹" })
      } else if (state.callId !== callId) {
        this.sendCallControl("call-rejected", callId, "busy")
      }
      return true
    }

    if (state.callId !== callId) return true

    if (message.type === "call-accepted" && state.callStatus === "outgoing") {
      useRtcStore.setState({ callStatus: "active" })
      toast.success("Peer accepted the video call")
      return true
    }

    if (message.type === "call-rejected" && state.callStatus === "outgoing") {
      useRtcStore.setState({ callStatus: "idle", callId: null })
      toast.error(
        message.reason === "busy"
          ? "Peer is already in another call"
          : "Peer declined the video call"
      )
      return true
    }

    if (message.type === "call-cancelled" && state.callStatus === "incoming") {
      useRtcStore.setState({ callStatus: "idle", callId: null })
      toast("Peer cancelled the video call")
      return true
    }

    if (message.type === "call-ended" && state.callStatus === "active") {
      useRtcStore.setState({ callStatus: "idle", callId: null })
      void this.stopLocalStream({ renegotiate: false })
      toast("Peer ended the video call")
      return true
    }

    return true
  }

  private handleChatClose = (event: Event) => {
    console.log("chat channel is closed")
    const channel = event.currentTarget as RTCDataChannel | null
    if (!channel || this.chatChannel !== channel) return

    this.detachChatChannel(channel)
    useRtcStore.setState({ chatChannelPresent: false, chatReady: false })
    this.handleTransportFailure()
  }

  private handleChatError = (event: Event) => {
    console.warn("chat channel failed")
    this.handleChatClose(event)
  }

  private handleFileOpen = () => {
    console.log("file channel is open")
    useRtcStore.setState({ fileReady: true })
  }

  private handleFileMessage = (event: MessageEvent) => {
    console.log("file data:", event.data)
    this.onFileChannelMessage(event)
  }

  private handleFileClose = (event: Event) => {
    console.log("file channel is closed")
    const channel = event.currentTarget as RTCDataChannel | null
    if (!channel || this.fileChannel !== channel) return

    this.detachFileChannel(channel)
    this.outgoingFile = false
    useRtcStore.setState({
      fileChannelPresent: false,
      fileReady: false,
      sendingFile: false,
    })
    this.handleTransportFailure()
  }

  private handleFileError = (event: Event) => {
    console.warn("file channel failed")
    this.handleFileClose(event)
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
        const fileId = typeof data.id === "string" ? data.id : undefined
        const incoming = this.incomingTransfer
        if (
          incoming &&
          (!fileId || incoming.fileId === fileId) &&
          incoming.receivedBytes !== incoming.size
        ) {
          this.failIncomingTransfer(fileId)
          toast.error("The received file was incomplete.")
        } else {
          this.completeIncomingTransfer(fileId)
        }
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

      const fileId =
        typeof data.id === "string" ? data.id : crypto.randomUUID()
      if (
        !Number.isFinite(data.size) ||
        data.size < 0 ||
        data.size > MAX_TRANSFER_BYTES
      ) {
        if (this.fileChannel?.readyState === "open") {
          this.fileChannel.send(JSON.stringify({ type: "file-error", id: fileId }))
        }
        toast.error(
          data.size > MAX_TRANSFER_BYTES
            ? `The peer tried to send a file larger than the ${MAX_TRANSFER_LABEL} limit.`
            : "The peer sent invalid file information.",
          { id: "incoming-file-safety-limit" }
        )
        return
      }

      if (this.speedTestId) {
        this.fileChannel?.send(
          JSON.stringify({ type: "file-error", id: data.id })
        )
        return
      }

      const mime =
        typeof data.mime === "string" && data.mime
          ? data.mime
          : "application/octet-stream"
      const folderArchive = data.folderArchive === true
      const fileCount =
        typeof data.fileCount === "number" && data.fileCount >= 0
          ? data.fileCount
          : undefined

      this.incomingTransfer = {
        fileId,
        name: data.name,
        size: data.size,
        mime,
        folderArchive,
        fileCount,
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
          folderArchive,
          fileCount,
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

    const nextReceivedBytes = received.receivedBytes + event.data.byteLength
    if (
      nextReceivedBytes > received.size ||
      nextReceivedBytes > MAX_TRANSFER_BYTES
    ) {
      if (this.fileChannel?.readyState === "open") {
        this.fileChannel.send(
          JSON.stringify({ type: "file-error", id: received.fileId })
        )
      }
      this.failIncomingTransfer(received.fileId)
      toast.error("The incoming file exceeded its announced size.")
      return
    }

    received.chunks.push(event.data)
    received.receivedBytes = nextReceivedBytes

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

    for (let sentBytes = 0; sentBytes < RTC_SPEED_TEST_SAMPLE_SIZE;) {
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

  private async uploadFile(
    file: File,
    fileId: string,
    metadata: FileTransferMetadata = {}
  ) {
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
        folderArchive: metadata.folderArchive,
        fileCount: metadata.fileCount,
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
