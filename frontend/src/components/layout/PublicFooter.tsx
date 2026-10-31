import { Link } from 'react-router-dom'
import ReliefGridLogo from '../ui/ReliefGridLogo'

const CURRENT_YEAR = new Date().getFullYear()

const QUICK_LINKS = [
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Roles', href: '#roles' },
  { label: 'Capabilities', href: '#capabilities' },
  { label: 'For NGOs', href: '#for-ngos' },
  { label: 'FAQ', href: '#faq' },
]

const GET_INVOLVED_LINKS = [
  { label: 'Offer Resources', to: '/register?role=donor' },
  { label: 'Register your NGO', to: '/register?role=ngo' },
  { label: 'Volunteer', to: '/register?role=volunteer' },
  { label: 'Sign in', to: '/login' },
]

function scrollTo(id: string) {
  const el = document.getElementById(id.replace('#', ''))
  if (el) {
    const yOffset = -85
    const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset
    window.scrollTo({ top: y, behavior: 'smooth' })
  }
}

function LinkedInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.65 1.65 0 1 0 0-3.3 1.65 1.65 0 0 0 0 3.3m1.39 9.74v-8.37H5.07v8.37z" />
    </svg>
  )
}

export default function PublicFooter() {
  return (
    <footer className="border-t border-line/70 bg-[#07090E] text-content transition-colors">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Column 1 — Brand */}
          <div className="space-y-3">
            <ReliefGridLogo size="md" linkTo="/" />
            <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-xs">
              Coordinating emergency relief requests, available donor resources, verified NGOs, and authorized volunteers.
            </p>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange">
              <span className="h-1.5 w-1.5 rounded-full bg-orange animate-pulse" />
              Human-in-the-loop oversight
            </div>
          </div>

          {/* Column 2 — Quick Links */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Quick Links</p>
            <ul className="space-y-2">
              {QUICK_LINKS.map((link) => (
                <li key={link.label}>
                  <button
                    type="button"
                    onClick={() => scrollTo(link.href)}
                    className="text-xs sm:text-sm text-muted transition-colors hover:text-orange focus-visible:outline-none focus-visible:underline"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 — Get Involved */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Get Involved</p>
            <ul className="space-y-2">
              {GET_INVOLVED_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-xs sm:text-sm text-muted transition-colors hover:text-orange focus-visible:outline-none focus-visible:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4 — Contact & Creator */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Contact & Creator</p>
            <div className="space-y-2.5 text-xs sm:text-sm text-muted">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted/70 block mb-0.5">Support Phone</span>
                <a
                  href="tel:9881265414"
                  className="font-mono text-content hover:text-orange transition-colors"
                >
                  9881265414
                </a>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted/70 block mb-0.5">Support Email</span>
                <a
                  href="mailto:pranavkarpe@dietms.org"
                  className="text-content hover:text-orange transition-colors break-all"
                >
                  pranavkarpe@dietms.org
                </a>
              </div>
              <div className="pt-1">
                <a
                  href="https://www.linkedin.com/in/pranav-karpe-46b14528b/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-xs font-semibold text-content transition-all hover:border-orange-500/40 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <LinkedInIcon />
                  <span>Built by Pranav Karpe</span>
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom divider row */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-line/60 pt-5 sm:flex-row text-xs text-muted">
          <p>
            &copy; {CURRENT_YEAR} ReliefGrid. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-muted/80">
            <span>Dark theme platform</span>
            <span>·</span>
            <span>10km proximity coordination</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
