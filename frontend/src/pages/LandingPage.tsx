import { useState } from 'react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/layout/PublicHeader'
import PublicFooter from '../components/layout/PublicFooter'

// ─── Shared Visual Primitives ────────────────────────────────────────────────

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-500/25 bg-orange-500/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-orange shadow-[0_0_12px_rgba(249,115,22,0.12)]">
      <span className="h-1.5 w-1.5 rounded-full bg-orange animate-pulse" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

function SectionWrap({
  id,
  children,
  className = '',
}: {
  id?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`py-16 sm:py-20 lg:py-24 border-t border-line/60 scroll-mt-24 ${className}`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {children}
      </div>
    </section>
  )
}

function SectionHeader({
  pill,
  heading,
  highlight,
  subtext,
}: {
  pill: string
  heading: string
  highlight?: string
  subtext?: string
}) {
  const parts = highlight ? heading.split(highlight) : [heading]
  return (
    <div className="mb-12 sm:mb-16 flex flex-col items-center text-center">
      <Pill>{pill}</Pill>
      <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white max-w-2xl leading-tight">
        {parts[0]}
        {highlight && <span className="text-orange">{highlight}</span>}
        {parts[1]}
      </h2>
      {subtext && (
        <p className="mx-auto mt-4 max-w-xl text-base sm:text-lg text-muted leading-relaxed">
          {subtext}
        </p>
      )}
    </div>
  )
}

// ─── Button Styles ────────────────────────────────────────────────────────────

const btnPrimary =
  'inline-flex h-12 items-center justify-center rounded-xl px-7 text-sm font-semibold text-white bg-orange border border-transparent shadow-md shadow-orange-500/25 interactive-popup hover:brightness-110 active:border-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

const btnSecondary =
  'inline-flex h-12 items-center justify-center rounded-xl border border-line bg-[#151923] px-7 text-sm font-medium text-white shadow-xs interactive-popup hover:bg-[#1B2230] hover:border-orange/60 active:border-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

// ─── Hero Section ────────────────────────────────────────────────────────────

function Hero() {
  return (
    <div className="relative pt-10 sm:pt-14 pb-16 sm:pb-24 overflow-hidden">
      {/* Background glow radial */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(249, 115, 22, 0.16), transparent 70%), radial-gradient(ellipse 50% 30% at 50% 15%, rgba(96, 165, 250, 0.06), transparent 60%)',
        }}
        aria-hidden="true"
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-center text-center">
          {/* Pill */}
          <div className="animate-fade-up">
            <Pill>COORDINATED DISASTER RELIEF PLATFORM</Pill>
          </div>

          {/* Continuous falling and returning hero title */}
          <h1 className="animate-fade-up animate-fade-up-delay-1 text-4xl sm:text-5xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.14] mt-3 pb-2 select-none">
            <span className="inline-block">
              <span className="hero-word-fall-return" style={{ animationDelay: '0.00s' }}>Coordinate</span>{' '}
              <span className="hero-word-fall-return" style={{ animationDelay: '0.24s' }}>relief.</span>
            </span>{' '}
            <span className="inline-block text-orange">
              <span className="hero-word-fall-return" style={{ animationDelay: '0.48s' }}>Reach</span>{' '}
              <span className="hero-word-fall-return" style={{ animationDelay: '0.72s' }}>people</span>{' '}
              <span className="hero-word-fall-return" style={{ animationDelay: '0.96s' }}>faster.</span>
            </span>
          </h1>

          {/* Supporting Copy */}
          <p className="animate-fade-up animate-fade-up-delay-2 mx-auto mt-5 max-w-2xl text-base sm:text-lg text-muted leading-relaxed">
            Connect people in need, resource donors, verified NGOs, and authorized volunteers through one coordinated relief platform.
          </p>

          {/* Actions */}
          <div className="animate-fade-up animate-fade-up-delay-3 mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
            <Link to="/register?role=citizen" className={btnPrimary}>
              Request Emergency Relief
            </Link>
            <Link to="/register?role=donor" className={btnSecondary}>
              Offer Resources as Donor
            </Link>
          </div>

          {/* Supporting link */}
          <div className="animate-fade-up animate-fade-up-delay-4 mt-4">
            <Link
              to="/register?role=ngo"
              className="group inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-orange hover:bg-surface-raised/50 interactive-popup focus-visible:outline-none"
            >
              <span>Register your NGO</span>
              <span className="transition-transform duration-150 group-hover:translate-x-1" aria-hidden="true">→</span>
            </Link>
          </div>

          {/* Benefit Badges */}
          <div className="animate-fade-up animate-fade-up-delay-5 mt-10 flex flex-wrap items-center justify-center gap-4 sm:gap-8 border-t border-line/60 pt-6 text-xs sm:text-sm font-medium text-muted">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange/15 text-orange text-xs font-bold">✓</span>
              <span>10km proximity coordination</span>
            </div>
            <span className="hidden sm:inline-block h-3.5 w-px bg-line/80" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-bold">✓</span>
              <span>Real-time resource allocation</span>
            </div>
            <span className="hidden sm:inline-block h-3.5 w-px bg-line/80" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold">✓</span>
              <span>Verified human oversight</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Section 1: How It Works ─────────────────────────────────────────────────

const STEPS = [
  {
    step: '01',
    title: 'People submit relief requests',
    desc: 'Individuals report urgent assistance needs with accurate location coordinates, affected people count, and urgency tier.',
  },
  {
    step: '02',
    title: 'Donors offer available resources',
    desc: 'Donors list supplies with quantities, conditions, and pickup coordinates to match local crisis demand.',
  },
  {
    step: '03',
    title: 'NGOs coordinate needs and resources',
    desc: 'Verified NGOs evaluate community reports, publish operational requirements, and allocate matched supplies.',
  },
  {
    step: '04',
    title: 'Approved volunteers carry out tasks',
    desc: 'Vetted volunteers accept assigned pickup and transit dispatches with designated handover checkpoints.',
  },
  {
    step: '05',
    title: 'Authorized NGO staff review delivery',
    desc: 'Delivery evidence is submitted and the responsible NGO independently confirms arrival, completing the audit cycle.',
  },
]

function HowItWorksSection() {
  return (
    <SectionWrap id="how-it-works">
      <SectionHeader
        pill="How It Works"
        heading="From urgent need to coordinated delivery."
        subtext="A transparent five-step workflow connecting community requests to confirmed on-the-ground assistance."
      />
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {STEPS.map((step) => (
          <div
            key={step.step}
            className="rounded-2xl border border-line bg-[#151923] p-5 shadow-xs transition-all duration-200 hover:border-orange-500/40 hover:shadow-[0_8px_24px_rgba(249,115,22,0.1)] flex flex-col justify-between"
          >
            <div>
              <span className="font-mono text-xl sm:text-2xl font-bold text-orange/70 block mb-2">{step.step}</span>
              <h3 className="text-sm sm:text-base font-semibold text-white leading-snug">{step.title}</h3>
              <p className="mt-2 text-xs text-muted leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </SectionWrap>
  )
}

// ─── Section 2: Roles ────────────────────────────────────────────────────────

const ROLES = [
  {
    role: 'Citizen',
    icon: '🏠',
    badge: 'Immediate Access',
    desc: 'Submit emergency relief requests, report on behalf of neighbors without internet, and follow real-time status updates.',
    actionLabel: 'Report Relief Need',
    to: '/register?role=citizen',
  },
  {
    role: 'Donor',
    icon: '📦',
    badge: 'Resource Contributor',
    desc: 'List emergency supplies with quantities, condition details, and pickup locations to support active relief operations.',
    actionLabel: 'Offer Resources',
    to: '/register?role=donor',
  },
  {
    role: 'NGO',
    icon: '🏢',
    badge: 'Coordination Agency',
    desc: 'Publish specific resource quotas, triage incoming citizen requests, allocate donor supplies, and oversee dispatches.',
    actionLabel: 'Register NGO',
    to: '/register?role=ngo',
  },
  {
    role: 'Volunteer',
    icon: '🚐',
    badge: 'NGO Affiliated',
    desc: 'Accept assigned supply pickups, navigate to delivery zones, and log proof of handover to shelters and coordinators.',
    actionLabel: 'Join as Volunteer',
    to: '/register?role=volunteer',
  },
]

function RolesSection() {
  return (
    <SectionWrap id="roles">
      <SectionHeader
        pill="Roles"
        heading="One platform. Coordinated relief roles."
        subtext="Tailored interfaces and strict role authorization for every participant in the disaster response network."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {ROLES.map((r) => (
          <div
            key={r.role}
            className="rounded-2xl border border-line bg-[#151923] p-6 shadow-xs transition-all duration-200 hover:border-orange-500/40 hover:shadow-[0_8px_24px_rgba(249,115,22,0.1)] flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-3xl" aria-hidden="true">{r.icon}</span>
                <span className="text-[11px] font-semibold text-orange bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
                  {r.badge}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-white">{r.role}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">{r.desc}</p>
            </div>
            <div className="mt-6 pt-4 border-t border-line/60">
              <Link
                to={r.to}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange hover:text-orange-400 transition-colors"
              >
                <span>{r.actionLabel}</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </SectionWrap>
  )
}

// ─── Section 3: Platform Capabilities ────────────────────────────────────────

const CAPABILITIES = [
  {
    icon: '📍',
    title: 'Location-aware coordination',
    desc: 'Geospatial mapping and proximity matching align donor resources with verified NGO demands within a 10km radius.',
  },
  {
    icon: '📦',
    title: 'Resource inventory tracking',
    desc: 'Donors register supplies with quantity, condition, and perishability data, preventing duplicates and shortages.',
  },
  {
    icon: '🔄',
    title: 'Transparent status lifecycle',
    desc: 'Requests move through verified state transitions (submitted → under review → verified → resolved) without ambiguity.',
  },
  {
    icon: '🚐',
    title: 'Volunteer task coordination',
    desc: 'Authorized NGO volunteers receive structured transit dispatches with clear pickup and drop-off coordinates.',
  },
  {
    icon: '🛡️',
    title: 'Delivery evidence & verification',
    desc: 'Independent sign-off by credentialed NGO staff confirms receipt of aid before status is marked resolved.',
  },
  {
    icon: '🔒',
    title: 'Strict role authorization',
    desc: 'Backend-enforced permissions ensure citizens, donors, NGOs, and volunteers only access appropriate operations.',
  },
]

function CapabilitiesSection() {
  return (
    <SectionWrap id="capabilities">
      <SectionHeader
        pill="Platform Capabilities"
        heading="Engineered for dependable crisis response."
        subtext="Practical, field-ready capabilities designed to coordinate relief logistically rather than through unverified marketing claims."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {CAPABILITIES.map((c) => (
          <div
            key={c.title}
            className="rounded-2xl border border-line bg-[#151923] p-6 shadow-xs transition-all duration-200 hover:border-orange-500/40 hover:shadow-[0_8px_24px_rgba(249,115,22,0.1)]"
          >
            <span className="text-2xl mb-3 block" aria-hidden="true">{c.icon}</span>
            <h3 className="text-base font-semibold text-white">{c.title}</h3>
            <p className="mt-2 text-sm text-muted leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>
    </SectionWrap>
  )
}

// ─── Section 4: For NGOs ─────────────────────────────────────────────────────

function NgoSection() {
  return (
    <SectionWrap id="for-ngos">
      <div className="rounded-3xl border border-line bg-gradient-to-b from-[#141926] to-[#0E121B] p-8 sm:p-12 shadow-md">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <Pill>FOR RELIEF AGENCIES</Pill>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Register your organisation for credential verification.
            </h2>
            <p className="text-sm sm:text-base text-muted leading-relaxed">
              ReliefGrid strictly distinguishes account registration from verified status. Newly registered NGOs submit organisation details and registration documents for administrator review before receiving access to publish operational requirements or manage volunteers.
            </p>
            <ul className="space-y-2 pt-2 text-xs sm:text-sm text-muted">
              <li className="flex items-center gap-2">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange/20 text-orange font-bold text-[10px]">✓</span>
                <span>Publish itemized resource requirements (needed by date and quantities)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange/20 text-orange font-bold text-[10px]">✓</span>
                <span>Review and validate incoming citizen emergency reports in your operating zone</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange/20 text-orange font-bold text-[10px]">✓</span>
                <span>Dispatch authorized volunteers and verify final delivery evidence</span>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-line bg-surface p-6 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-orange/15 text-orange text-2xl">
              🏢
            </div>
            <h3 className="text-base font-semibold text-white">NGO Onboarding</h3>
            <p className="text-xs text-muted leading-relaxed">
              Begin with basic account registration, then submit your credentials from the NGO console.
            </p>
            <Link to="/register?role=ngo" className={`${btnPrimary} w-full`}>
              Register your NGO
            </Link>
          </div>
        </div>
      </div>
    </SectionWrap>
  )
}

// ─── Section 5: FAQ ──────────────────────────────────────────────────────────

const FAQS = [
  {
    q: 'How can a citizen request emergency assistance?',
    a: 'Citizens register an account and submit a relief request specifying the title, situation details, category (food, water, shelter, medical, other), urgency level, and precise GPS or manual coordinates.',
  },
  {
    q: 'How do resource donors offer supplies?',
    a: 'Donors register and create donation listings indicating the item category, quantity, unit, condition, and pickup location coordinates. Listings become immediately available for NGO requirement matching within 10km.',
  },
  {
    q: 'How does NGO verification work?',
    a: 'Registered NGOs submit official registration documentation through their console. Platform administrators independently examine credentials before granting authorization to publish requirements or dispatch volunteers.',
  },
  {
    q: 'How are volunteers authorized and assigned tasks?',
    a: 'Volunteers register on the platform and become affiliated with verified NGOs. Tasks are assigned by NGO coordinators with clear pickup points and delivery checkpoints, rather than self-dispatched.',
  },
  {
    q: 'What does delivery-status confirmation mean?',
    a: 'A request is not marked resolved simply because supplies were matched or picked up. Delivery evidence must be submitted and confirmed by the responsible NGO coordinator.',
  },
  {
    q: 'Does submitting a request guarantee assistance?',
    a: 'No. ReliefGrid facilitates prioritization, communication, and geospatial matching, but physical delivery depends on real-world donor inventory, NGO capacity, and safe transit conditions in the disaster zone.',
  },
]

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  function toggle(index: number) {
    setOpenIndex((cur) => (cur === index ? null : index))
  }

  return (
    <SectionWrap id="faq">
      <SectionHeader
        pill="FAQ"
        heading="Frequently asked questions."
        subtext="Clear, transparent information about how ReliefGrid operates."
      />
      <div className="mx-auto max-w-3xl space-y-3">
        {FAQS.map((faq, i) => {
          const isOpen = openIndex === i
          return (
            <div
              key={faq.q}
              className="rounded-2xl border border-line bg-[#151923] overflow-hidden transition-all duration-200 hover:border-orange-500/30"
            >
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between p-5 text-left text-sm sm:text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span>{faq.q}</span>
                <span className={`ml-4 text-orange text-lg transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true">
                  ▾
                </span>
              </button>
              {isOpen && (
                <div className="px-5 pb-5 text-xs sm:text-sm text-muted leading-relaxed border-t border-line/40 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </SectionWrap>
  )
}

// ─── Section 6: Final Call To Action ─────────────────────────────────────────

function FinalCtaSection() {
  return (
    <SectionWrap className="border-b border-line/60">
      <div className="relative rounded-3xl border border-orange-500/25 bg-gradient-to-b from-[#141926] to-[#0D111B] p-8 sm:p-14 text-center shadow-[0_0_40px_rgba(249,115,22,0.1)] overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(circle at 50% 120%, rgba(249, 115, 22, 0.18), transparent 70%)',
          }}
          aria-hidden="true"
        />
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight max-w-2xl mx-auto leading-tight">
          Coordinate relief where it matters.
        </h2>
        <p className="mt-4 text-sm sm:text-base text-muted max-w-xl mx-auto leading-relaxed">
          Request emergency assistance, list available donor resources, or coordinate relief operations through verified relief agencies.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/register?role=citizen" className={btnPrimary}>
            Request Emergency Relief
          </Link>
          <Link to="/register?role=donor" className={btnSecondary}>
            Offer Resources as Donor
          </Link>
        </div>
      </div>
    </SectionWrap>
  )
}

// ─── Main Landing Page Component ─────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-[#090B11] text-content selection:bg-orange/20 selection:text-orange">
      {/* Subtle dark grid texture */}
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_90%_70%_at_50%_25%,#000_50%,transparent_100%)]"
        aria-hidden="true"
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <PublicHeader />

        <main id="main-content" className="flex-1">
          <Hero />
          <HowItWorksSection />
          <RolesSection />
          <CapabilitiesSection />
          <NgoSection />
          <FaqSection />
          <FinalCtaSection />
        </main>

        <PublicFooter />
      </div>
    </div>
  )
}
