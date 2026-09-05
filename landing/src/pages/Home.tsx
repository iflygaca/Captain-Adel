import { useRevealAll, useScrollSpy, useParallax, useMagnetic, useLenis, useScrollFx, useScrollSkew } from '../hooks/useReveal'
import Header from '../sections/Header'
import Loader from '../sections/Loader'
import Hero from '../sections/Hero'
import Ticker from '../sections/Ticker'
import Cinematic from '../sections/Cinematic'
import Doctrine from '../sections/Doctrine'
import MeetCaptain from '../sections/MeetCaptain'
import Gallery from '../sections/Gallery'
import Brain from '../sections/Brain'
import Models from '../sections/Models'
import FaqSection from '../sections/FaqSection'
import GacarQa from '../sections/GacarQa'
import ApiSection from '../sections/ApiSection'
import Footer from '../sections/Footer'
import StickyCta from '../sections/StickyCta'

export default function Home() {
  useRevealAll()
  useLenis()
  useScrollSpy(['doctrine', 'captain', 'brain', 'models', 'faq', 'qa', 'api'])
  useParallax()
  useMagnetic()
  useScrollFx()
  useScrollSkew()
  return (
    <div className="grain min-h-screen" style={{ backgroundColor: 'var(--color-void)', color: 'var(--color-text-primary)' }}>
      <Loader />
      <Header />
      <main className="skewy">
        <Hero />
        <Ticker />
        <Cinematic />
        <Doctrine />
        <MeetCaptain />
        <Gallery />
        <Brain />
        <Models />
        <FaqSection />
        <GacarQa />
        <ApiSection />
        <Footer />
      </main>
      <StickyCta />
    </div>
  )
}
