import { create } from "zustand"

import type { ChatItem, SpeedDirection } from "@/components/rtc/types"

export type CallStatus = "idle" | "outgoing" | "incoming" | "active"

export type RtcState = {
  status: string
  peerCreated: boolean
  chatChannelPresent: boolean
  fileChannelPresent: boolean
  chatReady: boolean
  fileReady: boolean
  messages: ChatItem[]
  sendingFile: boolean
  uploadMbps: number | null
  downloadMbps: number | null
  speedTestRunning: boolean
  speedTestDirection: SpeedDirection | null
  speedTestWaiting: boolean
  callStatus: CallStatus
  callId: string | null
}

function createInitialState(): RtcState {
  return {
    status: "idle",
    peerCreated: false,
    chatChannelPresent: false,
    fileChannelPresent: false,
    chatReady: false,
    fileReady: false,
    messages: [],
    sendingFile: false,
    uploadMbps: null,
    downloadMbps: null,
    speedTestRunning: false,
    speedTestDirection: null,
    speedTestWaiting: false,
    callStatus: "idle",
    callId: null,
  }
}

const useRtcStore = create<RtcState>(() => createInitialState())

export function resetRtcStore() {
  useRtcStore.setState(createInitialState(), true)
}

export default useRtcStore
