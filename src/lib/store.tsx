import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { Material, Piece } from './stock'

// The whole stock list is small (hundreds of rows), so it is loaded once and searched in the
// browser. That keeps search instant. Realtime keeps it in sync with everyone else's changes.

interface Store {
  pieces: Piece[]
  materials: Material[]
  locations: string[]
  densities: Map<string, number>
  loading: boolean
  error: string | null
  byId: (id: string) => Piece | undefined
  upsertLocal: (p: Piece) => void
  reload: () => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [pieces, setPieces] = useState<Piece[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [p, m, l] = await Promise.all([
      supabase.from('pieces').select('*').order('id'),
      supabase.from('materials').select('name, density').order('sort'),
      supabase.from('locations').select('name').order('sort'),
    ])
    const err = p.error ?? m.error ?? l.error
    if (err) setError(err.message)
    else {
      setPieces(p.data as Piece[])
      setMaterials(m.data as Material[])
      setLocations((l.data ?? []).map((r) => r.name as string))
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    const channel = supabase
      .channel('pieces')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pieces' }, (msg) => {
        setPieces((list) => {
          if (msg.eventType === 'DELETE') return list.filter((x) => x.id !== (msg.old as Piece).id)
          const row = msg.new as Piece
          const i = list.findIndex((x) => x.id === row.id)
          if (i === -1) return [...list, row].sort((x, y) => x.id.localeCompare(y.id))
          const next = list.slice()
          next[i] = row
          return next
        })
      })
      .subscribe()
    const onFocus = () => reload()
    window.addEventListener('focus', onFocus)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('focus', onFocus)
    }
  }, [reload])

  const value = useMemo<Store>(() => {
    const map = new Map(pieces.map((p) => [p.id, p]))
    return {
      pieces,
      materials,
      locations,
      densities: new Map(materials.map((m) => [m.name, Number(m.density)])),
      loading,
      error,
      byId: (id) => map.get(id),
      upsertLocal: (row) =>
        setPieces((list) => {
          const i = list.findIndex((x) => x.id === row.id)
          if (i === -1) return [...list, row].sort((x, y) => x.id.localeCompare(y.id))
          const next = list.slice()
          next[i] = row
          return next
        }),
      reload,
    }
  }, [pieces, materials, locations, loading, error, reload])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore outside StoreProvider')
  return ctx
}
