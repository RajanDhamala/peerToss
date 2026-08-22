
import { create } from "zustand";

interface User {
  id: string;
  name: string;
  email: string;
}

export interface AppWebSocket extends WebSocket {
  id?: string;
}

interface UserStore {
  currentUser: User | null;
  ws: AppWebSocket | null;
  setCurrentUser: (user: User) => void;
  clearCurrentUser: () => void;
  setWs: (ws: AppWebSocket | null) => void;
}

const useUserStore = create<UserStore>((set) => ({
  currentUser: null,
  ws: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  clearCurrentUser: () => set({ currentUser: null }),
  setWs: (ws) => set({ ws }),
}));

export default useUserStore;
