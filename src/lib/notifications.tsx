import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'

// The signed-in person's notifications, live. Shown as a count on the bell and as a list.

export interface Note {
  id: number
  kind: string
  text: string
  link: string | null
  read_at: string | null
  created_at: string
}

interface Notes {
  notes: Note[]
  unread: number
  markRead: (ids?: number[]) => Promise<void>
}

const Ctx = createContext<Notes>({ notes: [], unread: 0, markRead: async () => {} })

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth()
  const [notes, setNotes] = useState<Note[]>([])

  useEffect(() => {
    if (!userId) {
      setNotes([])
      return
    }
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => setNotes((data as Note[]) ?? []))
    const channel = supabase
      .channel(`notes-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (msg) =>
        setNotes((cur) => [msg.new as Note, ...cur]),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  const markRead = useCallback(
    async (ids?: number[]) => {
      const now = new Date().toISOString()
      const target = ids ?? notes.filter((n) => !n.read_at).map((n) => n.id)
      if (!target.length) return
      setNotes((cur) => cur.map((n) => (target.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)))
      await supabase.from('notifications').update({ read_at: now }).in('id', target)
    },
    [notes],
  )

  const value = useMemo(() => ({ notes, unread: notes.filter((n) => !n.read_at).length, markRead }), [notes, markRead])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useNotifications = () => useContext(Ctx)
