import { create } from "zustand"

import type { ChatItem, SpeedDirection } from "@/components/rtc/types"

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
  }
}

const useRtcStore = create<RtcState>(() => createInitialState())

export function resetRtcStore() {
  useRtcStore.setState(createInitialState(), true)
}

export default useRtcStore
