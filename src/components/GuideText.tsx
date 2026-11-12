import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

// Short tags for the guide's words (content/guide.tsx): a link into the app, a key, typed text, bold.

export const A = ({ to, children }: { to: string; children: ReactNode }) => <Link to={to}>{children}</Link>
export const K = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>
export const C = ({ children }: { children: ReactNode }) => <code>{children}</code>
export const B = ({ children }: { children: ReactNode }) => <b>{children}</b>
