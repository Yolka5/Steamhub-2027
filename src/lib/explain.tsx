import { createContext, useContext, useState, type ReactNode } from 'react'

// "Explain" on the calculator: shows the workbook's note under every field. On by default,
// like the spreadsheet, and remembered per device.

const KEY = 'calc-explain'
const Ctx = createContext<{ on: boolean; set: (v: boolean) => void }>({ on: false, set: () => {} })

export function ExplainProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== '0'
    } catch {
      return true
    }
  })
  const set = (v: boolean) => {
    setOn(v)
    try {
      localStorage.setItem(KEY, v ? '1' : '0')
    } catch {
      /* ignore */
    }
  }
  return <Ctx.Provider value={{ on, set }}>{children}</Ctx.Provider>
}

export const useExplain = () => useContext(Ctx)
