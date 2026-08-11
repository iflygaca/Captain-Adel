import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import './i18n'
import { isAr } from './i18n'
import App from './App.tsx'

document.title = isAr
  ? 'كابتن عادل (Captain Adel) — مدرّب الطيران الذكي لأنظمة GACAR السعودية'
  : 'Captain Adel (كابتن عادل) — AI Flight Instructor for Saudi GACAR'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
