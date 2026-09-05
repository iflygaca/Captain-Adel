import { Routes, Route } from 'react-router'
import { Analytics } from '@vercel/analytics/react'
import Home from './pages/Home'
import Accessibility from './pages/Accessibility'
import Chat from './pages/Chat'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ar" element={<Home />} />
        <Route path="/ar/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/ar/chat" element={<Chat />} />
        <Route path="/accessibility" element={<Accessibility />} />
        <Route path="/ar/accessibility" element={<Accessibility />} />
      </Routes>
      <Analytics />
    </>
  )
}
