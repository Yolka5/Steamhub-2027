import { createContext, useContext } from 'react'

// Opens Ctrl K from anywhere, optionally with text already typed (the Home search box).

export const PaletteContext = createContext<(text?: string) => void>(() => {})

export const useOpenPalette = () => useContext(PaletteContext)
