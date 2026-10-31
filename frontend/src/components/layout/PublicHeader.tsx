import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ReliefGridLogo from '../ui/ReliefGridLogo'

const NAV_LINKS = [
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Roles', href: '#roles' },
  { label: 'Capabilities', href: '#capabilities' },
  { label: 'For NGOs', href: '#for-ngos' },
  { label: 'FAQ', href: '#faq' },
]

function scrollTo(id: string) {
  const el = document.getElementById(id.replace('#', ''))
  if (el) {
    const yOffset = -85
    const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset
    window.scrollTo({ top: y, behavior: 'smooth' })
  }
}

export default function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  useEffect(() => {
    setMobileOpen(false)
  }, [location])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    function onOutside(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setMobileOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onOutside)
    }
  }, [mobileOpen])

  return (
    <header className="sticky top-3 sm:top-4 z-50 w-full px-3 sm:px-6 header-entrance">
      <div
        className={`header-glowing-border mx-auto max-w-6xl rounded-2xl backdrop-blur-md transition-all duration-300 ${
          scrolled ? 'bg-[#0B0F17]/98 shadow-[0_12px_36px_rgba(0,0,0,0.7)]' : 'bg-[#0B0F17]/92'
        }`}
      >
        <div className="flex h-16 sm:h-17 items-center justify-between px-4 sm:px-6">
          {/* Logo with continuous breathing glow */}
          <ReliefGridLogo size="lg" linkTo="/" />

          {/* Centered desktop nav */}
          <nav className="hidden items-center gap-1.5 lg:flex" aria-label="Main navigation">
            {NAV_LINKS.map((link) => (
              <button
                key={link.href}
                type="button"
                onClick={() => scrollTo(link.href)}
                className="rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-content hover:border-orange/40 interactive-popup focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Desktop actions */}
          <div className="hidden items-center gap-3 sm:flex">
            <Link
              to="/login"
              className="rounded-lg border border-line/70 bg-surface-raised/60 px-3.5 py-1.5 text-sm font-medium text-muted transition-colors hover:text-content hover:border-orange/60 interactive-popup focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Sign in
            </Link>
            <Link
              to="/register?role=citizen"
              className="rounded-xl border border-orange/40 px-4.5 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/25 transition-all duration-200 hover:brightness-110 interactive-popup focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              style={{ background: 'var(--color-orange)' }}
            >
              Get Emergency Help
            </Link>
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-2 sm:hidden">
            <button
              type="button"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-lg border border-transparent p-2 text-muted transition-colors hover:bg-surface-raised hover:text-content hover:border-orange/50 interactive-popup focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {mobileOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile drawer inside floating container */}
        {mobileOpen && (
          <div
            id="mobile-nav"
            ref={drawerRef}
            className="border-t border-line/60 px-5 py-4 sm:hidden animate-fade-up"
          >
            <nav className="grid gap-1" aria-label="Mobile navigation">
              {NAV_LINKS.map((link) => (
                <button
                  key={link.href}
                  type="button"
                  onClick={() => { scrollTo(link.href); setMobileOpen(false) }}
                  className="rounded-lg px-3 py-2 text-left text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {link.label}
                </button>
              ))}
            </nav>
            <div className="mt-4 grid gap-2 pt-2 border-t border-line/40">
              <Link
                to="/login"
                className="rounded-lg border border-line px-4 py-2 text-center text-sm font-medium text-content transition-colors hover:bg-surface-raised focus-visible:outline-none"
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
              <Link
                to="/register?role=citizen"
                className="rounded-lg px-4 py-2 text-center text-sm font-semibold text-white transition-all duration-[180ms] hover:opacity-90 active:scale-[0.98] focus-visible:outline-none"
                style={{ background: 'var(--color-orange)' }}
                onClick={() => setMobileOpen(false)}
              >
                Get Emergency Help
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
