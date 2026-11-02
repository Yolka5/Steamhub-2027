import { useState } from 'react'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Icon } from './Icon'
import { useToast } from './ui'

/**
 * Add and remove the places stock can live. Removing a place only takes it off this list;
 * pieces already stored there keep their location text.
 */
export function LocationsEditor() {
  const { locations, reload } = useStore()
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    const n = name.trim()
    if (!n || locations.includes(n)) return
    setBusy(true)
    const { error } = await supabase.from('locations').insert({ name: n, sort: locations.length + 1 })
    setBusy(false)
    if (error) return toast(error.message)
    setName('')
    await reload()
  }

  const remove = async (n: string) => {
    const { error } = await supabase.from('locations').delete().eq('name', n)
    if (error) return toast(error.message)
    await reload()
    toast(`${n} removed`)
  }

  return (
    <div className="places">
      <ul className="places__list">
        {locations.map((l) => (
          <li key={l} className="chip places__chip">
            {l}
            <button type="button" className="places__x" aria-label={`Remove ${l}`} onClick={() => remove(l)}>
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="inline-form">
        <input
          className="field"
          placeholder="New place, like Rack C"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button type="button" className="q-btn" disabled={busy || !name.trim()} onClick={add}>
          Add
        </button>
      </div>
    </div>
  )
}
