import { useNavigate } from "react-router"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import useRtcStore from "@/global/rtc/rtcStore"

type LandingRoomAction = "join" | "create"

export function PeerDisconnectedDialog() {
  const navigate = useNavigate()
  const open = useRtcStore((state) => state.peerDisconnectedDialogOpen)
  const message = useRtcStore((state) => state.peerDisconnectedMessage)

  const closeDialog = () => {
    useRtcStore.setState({
      peerDisconnectedDialogOpen: false,
      peerDisconnectedMessage: null,
    })
  }

  const continueOnLanding = (roomAction: LandingRoomAction) => {
    closeDialog()
    navigate("/", {
      replace: true,
      state: { roomAction },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeDialog()
      }}
    >
      <DialogContent className="rounded-2xl border border-black/10 bg-white p-7 text-[#171717] shadow-2xl sm:max-w-md dark:border-black/10 dark:bg-white dark:text-[#171717] [&>button]:text-[#525252] [&>button:hover]:bg-black/5">
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-semibold tracking-tight text-[#171717]">
            Peer disconnected
          </DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed text-[#737373]">
            {message ?? "The other device left this temporary room."} Choose
            how you would like to reconnect.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => continueOnLanding("join")}
            className="border-black/10 bg-white text-[#171717] hover:bg-black/5 hover:text-[#171717]"
          >
            Join a room
          </Button>
          <Button
            type="button"
            onClick={() => continueOnLanding("create")}
            className="bg-[#171717] text-white hover:bg-black hover:text-white"
          >
            Create new room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
