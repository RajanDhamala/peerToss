export const CHAT_REACTIONS = [
  { id: "hello", label: "Hello" },
  { id: "thumbs-up", label: "Thumbs up" },
  { id: "thanks", label: "Thank you" },
  { id: "celebrate", label: "Celebrate" },
  { id: "waiting", label: "One second" },
] as const

export type ChatReaction = (typeof CHAT_REACTIONS)[number]

export const STARTER_MESSAGES = [
  "Hey 👋",
  "Ready to receive?",
  "Sending files now.",
] as const

export const CHAT_EMOJI = [
  ["👋", "Wave"],
  ["😊", "Smile"],
  ["😂", "Laugh"],
  ["🥳", "Celebrate"],
  ["😎", "Cool"],
  ["🤔", "Thinking"],
  ["👍", "Thumbs up"],
  ["🙌", "Hooray"],
  ["👏", "Applause"],
  ["🙏", "Thank you"],
  ["❤️", "Heart"],
  ["💚", "Green heart"],
  ["🎉", "Party"],
  ["✨", "Sparkles"],
  ["🔥", "Fire"],
  ["🚀", "Rocket"],
  ["✅", "Done"],
  ["👀", "Looking"],
  ["📁", "Folder"],
  ["📎", "Attachment"],
  ["💻", "Laptop"],
  ["📱", "Phone"],
  ["☕", "Coffee"],
  ["⏳", "Waiting"],
] as const

// Reactions use the existing text channel. Older clients get a readable label;
// updated clients render only bundled, allowlisted assets, never a remote URL.
export function encodeChatReaction(reaction: ChatReaction, caption = "") {
  const text = caption.trim()
  return `[PeerToss GIF: ${reaction.id}]${text ? `\n${text}` : ""}`
}

export function decodeChatReaction(text: string) {
  const match = /^\[PeerToss GIF: ([a-z-]+)\](?:\n([\s\S]*))?$/.exec(text)
  if (!match) return null
  const reaction = CHAT_REACTIONS.find((item) => item.id === match[1])
  return reaction ? { reaction, caption: match[2] ?? "" } : null
}

export function reactionAsset(reaction: ChatReaction, animated = false) {
  return `/chat-reactions/${reaction.id}.${animated ? "gif" : "png"}`
}
