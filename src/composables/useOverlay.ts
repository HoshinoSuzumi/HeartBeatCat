import { reactive } from "vue"

interface OverlayState {
  type: "session" | null
  sessionId: string | null
}

const state = reactive<OverlayState>({
  type: null,
  sessionId: null,
})

export function useOverlay() {
  function openSession(id: string) {
    state.type = "session"
    state.sessionId = id
  }

  function close() {
    state.type = null
    state.sessionId = null
  }

  return { state, openSession, close }
}
