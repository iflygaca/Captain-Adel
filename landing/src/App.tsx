import { Routes, Route } from 'react-router'
import { Analytics } from '@vercel/analytics/react'
import Home from './pages/Home'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ar" element={<Home />} />
        <Route path="/ar/" element={<Home />} />
      </Routes>
      <Analytics />
    </>
  )
}
