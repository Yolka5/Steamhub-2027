import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/tokens.css'
import './styles/controls.css'
import './styles/app.css'
import './styles/calc.css'
import './styles/handbook.css'
import './styles/tools.css'
import './styles/motion.css'
import './styles/mfg.css'
import './styles/proto.css'
import App from './App'
import { AuthProvider } from './lib/auth'
import { NotificationsProvider } from './lib/notifications'
import { StoreProvider } from './lib/store'
import { initPointerGlow } from './lib/motion'

initPointerGlow()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <StoreProvider>
          <NotificationsProvider>
            <App />
          </NotificationsProvider>
        </StoreProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
