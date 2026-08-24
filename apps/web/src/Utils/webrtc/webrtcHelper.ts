// Minimal WebRTC setup. Signaling (exchanging offer/answer/ICE over the ws)
// is handled separately — see the TODOs below.

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
}

export async function createPeer(): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection(ICE_CONFIG)
  const channel = pc.createDataChannel("file")


  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  console.log("offer:", offer)
  console.log("channel:", channel)
  console.log("instance", pc)
  return pc
}

export function createFileChannel(pc: RTCPeerConnection): RTCDataChannel {
  const channel = pc.createDataChannel("file")

  channel.onopen = () => console.log("data channel open")
  channel.onclose = () => console.log("data channel closed")
  channel.onmessage = (e) => console.log("received:", e.data)

  return channel
}

// The receiving side gets the channel through this event instead of createDataChannel
export function onIncomingChannel(
  pc: RTCPeerConnection,
  cb: (channel: RTCDataChannel) => void
) {
  pc.ondatachannel = (e) => cb(e.channel)
}

// --- exchange helpers (call these from your ws message handler) ---

export async function createOffer(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  return offer
}

export async function acceptOffer(
  pc: RTCPeerConnection,
  offer: RTCSessionDescription
): Promise<RTCSessionDescriptionInit> {
  await pc.setRemoteDescription(offer)
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  return answer
}

export async function acceptAnswer(
  pc: RTCPeerConnection,
  answer: RTCSessionDescription
) {
  await pc.setRemoteDescription(answer)
}

export async function addIceCandidate(pc: RTCPeerConnection, candidate: RTCIceCandidateInit) {
  await pc.addIceCandidate(candidate)
}
