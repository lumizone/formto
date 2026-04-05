import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { submissionsApi } from "@/lib/api"

const UnreadContext = createContext({
  unreadCount: 0,
  refresh: () => {},
  decrement: () => {},
  reset: () => {},
})

export function UnreadProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const res = await submissionsApi.getStats()
      setUnreadCount(res.data?.unreadCount ?? 0)
    } catch {
      // silently ignore — user may not be authenticated yet
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refresh()
    }, 0)
    const interval = setInterval(refresh, 60_000) // poll every minute
    return () => {
      window.clearTimeout(timeoutId)
      clearInterval(interval)
    }
  }, [refresh])

  const decrement = useCallback((by = 1) => {
    setUnreadCount((prev) => Math.max(0, prev - by))
  }, [])

  const reset = useCallback(() => setUnreadCount(0), [])

  return (
    <UnreadContext.Provider value={{ unreadCount, refresh, decrement, reset }}>
      {children}
    </UnreadContext.Provider>
  )
}

export const useUnread = () => useContext(UnreadContext)
