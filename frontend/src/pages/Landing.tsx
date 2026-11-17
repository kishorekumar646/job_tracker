// Author: Kishore Kumar
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown, ArrowRight, ArrowUpRight, BarChart3, Bell, Briefcase, CalendarDays,
  Check, ChevronDown, CircleDot, FileText, Fingerprint, Layers3, LayoutDashboard,
  LockKeyhole, Mail, Menu, Search, ShieldCheck, Smartphone, Sparkles, X,
} from 'lucide-react'
import { DEVELOPER_LINKS, Logo } from '../components/layout'
import { AppInstall } from '../components/ui/AppInstall'
import { useAuthStore } from '../store/authStore'
import './Landing.css'

const NAVIGATION = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'security', label: 'Security' },
  { id: 'plans', label: 'Plans' },
  { id: 'questions', label: 'Questions' },
]

const FEATURES = [
  { icon: Layers3, number: '01', title: 'Everything in its right place.', text: 'Roles, stages, interviews and offers. A considered home for every moving part of your job search.', className: 'landing-feature-wide' },
  { icon: Search, number: '02', title: 'Find your kind of opportunity.', text: 'Import live listings and compare resume-based match scores. Spend your attention where it belongs.' },
  { icon: FileText, number: '03', title: 'Make your experience count.', text: 'Upload your resume, review extracted skills and shape the preferences behind your matches.' },
  { icon: BarChart3, number: '04', title: 'See the bigger picture.', text: 'Turn application activity into a clear view of your momentum. Know what is moving, and what needs a nudge.' },
  { icon: Smartphone, number: '05', title: 'A workspace that goes with you.', text: 'A compact mobile experience, with web-app installation where supported. The same account, wherever you work.' },
]

const WORKFLOW = [
  { icon: FileText, title: 'Set your direction.', text: 'Activate your account, add your resume and choose the roles and locations that matter to you.' },
  { icon: Search, title: 'Curate your shortlist.', text: 'Import opportunities, explore your matches and save the ones worth a closer look.' },
  { icon: CalendarDays, title: 'Make your next move.', text: 'Apply on the original website, update your tracker and prepare for the conversations ahead.' },
]

const DEMO_JOBS = [
  { initials: 'ES', title: 'Frontend engineer', company: 'Example Studio', stage: 'Interview', tone: 'mint' },
  { initials: 'SW', title: 'Product designer', company: 'Sample Works', stage: 'Applied', tone: 'gold' },
  { initials: 'DC', title: 'Data analyst', company: 'Demo Collective', stage: 'To apply', tone: 'violet' },
]

const FAQS = [
  { q: 'What does JobPilot actually do?', a: 'JobPilot brings resume-based job matching, application tracking, interview details, notes and offers into one workspace. It helps organize your search; you stay in control of the decisions.' },
  { q: 'Does auto-apply submit applications on other websites?', a: 'No. Auto-apply currently creates matching entries in your JobPilot tracker. Connections save platform profile links, not passwords. Complete the real application on the original employer or job-board website.' },
  { q: 'How do I get started?', a: 'Sign up with a Gmail address, add JobPilot to your authenticator app and enter its 6-digit code. Then add your resume and preferences. Verify your email in Profile before connecting accounts or using auto-apply.' },
  { q: 'Can I use JobPilot on my phone?', a: 'Yes. The workspace adapts to mobile screens and can be installed as a web app where supported. Optional passkeys can use Face ID, fingerprint or your device PIN. Your device chooses the verification method.' },
  { q: 'Do I have to install it, and can I remove it?', a: 'Installation is optional: the website works without it. JobPilot installs through your browser, without an APK download. Remove it using your device app settings or browser app menu. Uninstalling does not delete your account or server-held data; contact the developer for account or data requests. Review the privacy and device-access details beside Install App before installing.' },
  { q: 'Is there a free plan?', a: 'Yes. Start with the free plan and its included limits. Your Plans page shows the current Pro price, access duration and usage limits before you decide to upgrade. Pro payments use UPI with server-side verification.' },
  { q: 'How fresh are the job listings?', a: 'Visible pages refresh saved data every 30 seconds. Fetch live jobs imports new external listings; eligible scheduled auto-apply runs can also import jobs. Background schedules depend on server availability and can pause on sleeping free hosting.' },
]

function WorkspacePreview() {
  const [view, setView] = useState<'pipeline' | 'activity'>('pipeline')
  return (
    <div className="landing-preview-wrap">
      <div className="landing-preview-halo" aria-hidden="true" />
      <div className="landing-preview">
        <div className="landing-preview-chrome">
          <div className="landing-window-dots" aria-hidden="true"><i /><i /><i /></div>
          <span><LockKeyhole size={10} aria-hidden="true" />Your career workspace</span>
          <span className="landing-demo-label">Demo</span>
        </div>
        <div className="landing-preview-body">
          <div className="landing-preview-heading">
            <div><p className="landing-micro">A LITTLE MORE CLARITY</p><h2>Your next chapter.</h2></div>
            <div className="landing-preview-avatar" aria-hidden="true">You</div>
          </div>
          <div className="landing-demo-stats">
            <div><span>Saved roles</span><strong>12<span>+</span></strong></div>
            <div><span>Conversations</span><strong>03</strong></div>
            <div><span>Next steps</span><strong>02</strong></div>
          </div>
          <div className="landing-preview-toolbar">
            <div className="landing-preview-switch" role="group" aria-label="Workspace preview view">
              <button type="button" aria-pressed={view === 'pipeline'} onClick={() => setView('pipeline')}><Layers3 size={12} />Pipeline</button>
              <button type="button" aria-pressed={view === 'activity'} onClick={() => setView('activity')}><BarChart3 size={12} />Activity</button>
            </div>
            <span className="landing-micro">ILLUSTRATIVE DATA</span>
          </div>
          <div className="landing-preview-content" key={view}>
            {view === 'pipeline' ? (
              <div className="landing-demo-jobs">
                {DEMO_JOBS.map((job) => (
                  <div className="landing-demo-job" key={job.title}>
                    <span className={`landing-company-mark landing-tone-${job.tone}`}>{job.initials}</span>
                    <div><strong>{job.title}</strong><span>{job.company}</span></div>
                    <span className={`landing-stage landing-tone-${job.tone}`}>{job.stage}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="landing-demo-activity">
                <div><span>Application activity</span><span className="landing-tone-mint">An example week</span></div>
                <svg viewBox="0 0 360 128" role="img" aria-label="Illustrative application activity chart">
                  <defs><linearGradient id="landing-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ade6ce" stopOpacity=".22" /><stop offset="100%" stopColor="#ade6ce" stopOpacity="0" /></linearGradient></defs>
                  {[24, 64, 104].map((y) => <path key={y} d={`M0 ${y}H360`} stroke="white" strokeOpacity=".06" />)}
                  <path d="M0 105C25 105 27 72 60 76S100 103 123 67S163 77 190 44S229 57 253 30S298 54 323 19S345 25 360 8V128H0Z" fill="url(#landing-chart-fill)" />
                  <path className="landing-chart-line" pathLength="1" d="M0 105C25 105 27 72 60 76S100 103 123 67S163 77 190 44S229 57 253 30S298 54 323 19S345 25 360 8" fill="none" stroke="#ade6ce" strokeWidth="2.5" />
                </svg>
                <div className="landing-chart-days">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => <span key={i}>{day}</span>)}</div>
              </div>
            )}
          </div>
          <div className="landing-preview-bottom"><span className="landing-status-dot" />Less scattered. More intentional.<ArrowUpRight size={13} aria-hidden="true" /></div>
        </div>
      </div>
      <div className="landing-float-note landing-float-note-top" aria-hidden="true"><span className="landing-note-icon"><Sparkles size={15} /></span><div><strong>Focus on the right fit.</strong><span>Resume-led matching</span></div></div>
      <div className="landing-float-note landing-float-note-bottom" aria-hidden="true"><span className="landing-note-icon"><CalendarDays size={15} /></span><div><strong>Your next move, in view.</strong><span>Interviews, notes & offers</span></div><Check size={14} /></div>
      <p className="landing-preview-caption">An illustrative workspace. Not live jobs or account results.</p>
    </div>
  )
}

export default function Landing() {
  const user = useAuthStore((s) => s.user)
  const destination = user ? '/dashboard' : '/signup'
  const [menuOpen, setMenuOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLElement>(null)

  useEffect(() => {
    const element = root.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.08 })
    element.setAttribute('data-reveal-ready', '')
    element.querySelectorAll('[data-reveal]').forEach((item) => observer.observe(item))
    return () => { observer.disconnect(); element.removeAttribute('data-reveal-ready') }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        header.current?.querySelector<HTMLButtonElement>('.landing-menu-button')?.focus()
      }
    }
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer) }
  }, [menuOpen])

  return (
    <div className="landing" ref={root}>
      <header className="landing-header" ref={header}>
        <nav className="landing-nav landing-container" aria-label="Public navigation">
          <Link to="/" aria-label="JobPilot home" className="landing-brand"><Logo light /></Link>
          <div className="landing-desktop-links">{NAVIGATION.map((item) => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}</div>
          <div className="landing-nav-actions">
            {!user && <Link to="/login" className="landing-login">Log in</Link>}
            <Link to={destination} className="landing-button landing-button-small">{user ? 'Dashboard' : 'Sign up'}<ArrowUpRight size={13} aria-hidden="true" /></Link>
            <button type="button" className="landing-menu-button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="landing-mobile-nav" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </nav>
        {menuOpen && <nav id="landing-mobile-nav" className="landing-mobile-nav" aria-label="Mobile navigation">{NAVIGATION.map((item) => <a key={item.id} href={`#${item.id}`} onClick={() => setMenuOpen(false)}>{item.label}<ArrowUpRight size={14} aria-hidden="true" /></a>)}{!user && <Link to="/login" onClick={() => setMenuOpen(false)}>Log in<ArrowRight size={14} /></Link>}</nav>}
      </header>

      <main>
        <AppInstall variant="banner" />
        <section className="landing-hero landing-container" aria-labelledby="landing-title">
          <div className="landing-hero-orb landing-hero-orb-one" aria-hidden="true" /><div className="landing-hero-orb landing-hero-orb-two" aria-hidden="true" />
          <div className="landing-hero-copy">
            <p className="landing-eyebrow"><span className="landing-status-dot" />FOR THE CAREER YOU HAVE IN MIND</p>
            <h1 id="landing-title">Your next chapter.<br /><em>Exceptionally<br className="landing-desktop-break" /> organized.</em></h1>
            <p className="landing-hero-description">Ambition deserves a little clarity. Bring your opportunities, applications and next moves into one beautifully focused workspace.</p>
            <div className="landing-hero-actions"><Link to={destination} className="landing-button">{user ? 'Open your workspace' : 'Start your next chapter'}<ArrowUpRight size={17} aria-hidden="true" /></Link><a href="#workspace" className="landing-text-link"><span className="landing-play-mark"><ArrowDown size={14} /></span>Explore the workspace</a></div>
            <p className="landing-hero-assurance"><Check size={13} aria-hidden="true" />Start free<span />No card required<span />Built for your pace</p>
          </div>
          <div className="landing-hero-product"><WorkspacePreview /></div>
          <div className="landing-hero-footnote"><span>LESS TAB CHAOS. MORE POSSIBILITY.</span><a href="#features" aria-label="Explore features"><ArrowDown size={16} /></a><span>YOUR CAREER. YOUR DIRECTION.</span></div>
        </section>

        <div className="landing-capability-strip"><div className="landing-container"><span>A MORE CONSIDERED WAY TO SEARCH</span><p><Briefcase size={15} />Applications</p><p><Search size={15} />Resume-based matching</p><p><CalendarDays size={15} />Interviews & offers</p><p><Smartphone size={15} />Mobile-ready</p></div></div>

        <section id="features" className="landing-section landing-container">
          <div className="landing-section-heading" data-reveal><p className="landing-eyebrow">01 / THE DETAILS MAKE THE DIFFERENCE</p><h2>Less to juggle.<br /><em>More room to move.</em></h2><p>A purposeful set of tools for the part of your career that comes next. Nothing noisy. Nothing scattered.</p></div>
          <div className="landing-feature-grid">
            {FEATURES.map(({ icon: Icon, number, title, text, className = '' }) => (
              <article key={number} className={`landing-feature-card ${className}`} data-reveal>
                <div className="landing-feature-top"><span className="landing-feature-icon"><Icon size={21} aria-hidden="true" /></span><span>{number}</span></div>
                <h3>{title}</h3><p>{text}</p>
                {number === '01' && <div className="landing-stage-flow" aria-label="Track stages from To apply to Offer">{['To apply', 'Applied', 'Interview', 'Offer'].map((stage, i) => <span key={stage}><i className={`landing-flow-dot landing-flow-dot-${i}`} />{stage}{i < 3 && <ArrowRight size={12} aria-hidden="true" />}</span>)}</div>}
                {number === '04' && <div className="landing-mini-bars" aria-hidden="true">{[32, 54, 41, 70, 56, 83, 96, 78, 100].map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}</div>}
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="landing-workflow-section">
          <div className="landing-container landing-section">
            <div className="landing-section-heading landing-heading-centered" data-reveal><p className="landing-eyebrow">02 / FROM INTENTION TO ACTION</p><h2>A good next step<br /><em>starts with a clear view.</em></h2><p>Make the search your own. Keep the important things close. Move forward with intention.</p></div>
            <div className="landing-workflow-grid">{WORKFLOW.map(({ icon: Icon, title, text }, index) => <article key={title} data-reveal><div className="landing-workflow-line"><span>0{index + 1}</span><Icon size={18} aria-hidden="true" /></div><h3>{title}</h3><p>{text}</p></article>)}</div>
            <p className="landing-honesty-note" data-reveal><CircleDot size={16} aria-hidden="true" /><span>Clarity, not overpromises. Auto-apply creates matching entries in your tracker. You complete the real application on the original website.</span></p>
          </div>
        </section>

        <section id="workspace" className="landing-section landing-container">
          <div className="landing-workspace-heading" data-reveal><div className="landing-section-heading"><p className="landing-eyebrow">03 / A HOME FOR YOUR AMBITION</p><h2>Every opportunity.<br /><em>A place. A next step.</em></h2></div><p>From the first interesting role to the offer worth celebrating. Keep the whole story in view.</p></div>
          <div className="landing-board" data-reveal>
            <div className="landing-board-header"><div><LayoutDashboard size={17} aria-hidden="true" /><strong>My career workspace</strong></div><span className="landing-demo-label">Illustrative preview</span></div>
            <div className="landing-board-columns">{[
              { label: 'To apply', tone: 'violet', title: 'Data analyst', company: 'Demo Collective', note: 'Review the original listing', icon: FileText },
              { label: 'Applied', tone: 'gold', title: 'Product designer', company: 'Sample Works', note: 'Add a follow-up note', icon: Bell },
              { label: 'Interview', tone: 'mint', title: 'Frontend engineer', company: 'Example Studio', note: 'Prepare for the conversation', icon: CalendarDays },
            ].map(({ label, tone, title, company, note, icon: Icon }) => <div className="landing-board-column" key={label}><div className="landing-column-title"><span className={`landing-flow-dot landing-tone-${tone}`} />{label}<span>01</span></div><div className="landing-board-card"><span className={`landing-board-card-mark landing-tone-${tone}`}><Briefcase size={19} aria-hidden="true" /></span><h3>{title}</h3><p>{company}</p><div><Icon size={13} aria-hidden="true" />{note}</div></div><div className="landing-board-placeholder" aria-hidden="true"><i /><i /></div></div>)}</div>
            <div className="landing-board-footer"><span>Sample roles and data, shown for illustration only.</span><span><LockKeyhole size={12} aria-hidden="true" />Your actual workspace requires sign-in</span></div>
          </div>
        </section>

        <section id="security" className="landing-security-section">
          <div className="landing-container landing-security-grid">
            <div className="landing-security-art" aria-hidden="true" data-reveal><div className="landing-security-orbit" /><div className="landing-security-orbit landing-security-orbit-inner" /><div className="landing-security-core"><Fingerprint size={58} strokeWidth={1} /></div><span className="landing-security-label"><LockKeyhole size={12} />Your next chapter. Your access.</span></div>
            <div className="landing-section-heading" data-reveal><p className="landing-eyebrow">04 / CONFIDENCE COMES STANDARD</p><h2>Personal by nature.<br /><em>Protected by design.</em></h2><p>Your career search is personal. Your account should feel that way, too.</p><ul className="landing-security-list"><li><ShieldCheck size={19} /><div><h3>An authenticator, not another password.</h3><p>Activate with a 6-digit authenticator code. Verify your email before enabling connected-account features.</p></div></li><li><Fingerprint size={19} /><div><h3>Access that feels natural.</h3><p>Add an optional passkey for Face ID, fingerprint or device PIN on supported devices. Biometric data never reaches JobPilot.</p></div></li><li><LockKeyhole size={19} /><div><h3>Your platforms stay yours.</h3><p>Save profile links without handing over your job-board passwords. Keep your authenticator as a fallback.</p></div></li></ul></div>
          </div>
        </section>

        <section id="plans" className="landing-section landing-container">
          <div className="landing-section-heading landing-heading-centered" data-reveal><p className="landing-eyebrow">05 / ROOM TO FIND YOUR RHYTHM</p><h2>Start with focus.<br /><em>Grow at your pace.</em></h2><p>No card needed to begin. Your workspace shows current pricing, duration and usage limits before any upgrade.</p></div>
          <div className="landing-plans">
            <article className="landing-plan" data-reveal><p className="landing-micro">A THOUGHTFUL START</p><h3>Free</h3><p>A clear home for your next move.</p><ul>{['Application tracking and stages', 'Resume profile and job preferences', 'Live job discovery and matching', 'Included auto-apply tracker usage', 'Mobile-friendly workspace'].map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul><Link to={destination} className="landing-button landing-button-outline">{user ? 'Open your workspace' : 'Begin for free'}<ArrowUpRight size={16} /></Link></article>
            <article className="landing-plan landing-plan-pro" data-reveal><span className="landing-plan-badge"><Sparkles size={12} />FOR A MORE ACTIVE SEARCH</span><p className="landing-micro">MORE SPACE TO MOVE</p><h3>Pro<span>At your pace.</span></h3><p>More eligible usage when you need it.</p><ul>{['Everything in your free workspace', 'Higher auto-apply tracker allowance', 'Time-limited Pro access', 'UPI checkout with bank-credit verification', 'Plan expiry and downloadable paid invoices'].map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul><Link to={user ? '/billing' : '/signup'} className="landing-button">{user ? 'View your plan options' : 'Create an account to explore'}<ArrowUpRight size={16} /></Link></article>
          </div>
          <p className="landing-plan-note">Auto-apply adds tracker entries, not external submissions. Background schedules depend on server availability.</p>
        </section>

        <section id="questions" className="landing-section landing-container landing-faq-section">
          <div className="landing-section-heading" data-reveal><p className="landing-eyebrow">06 / A FEW THINGS WORTH KNOWING</p><h2>Good questions.<br /><em>Honest answers.</em></h2><p>There is enough uncertainty in a job search. Your tools should not add to it.</p><a className="landing-text-link" href="mailto:kishorekumar131646@gmail.com?subject=JobPilot%20enquiry">Have another question?<ArrowUpRight size={15} /></a></div>
          <div className="landing-faq-list" data-reveal>{FAQS.map(({ q, a }) => <details key={q}><summary>{q}<ChevronDown size={16} aria-hidden="true" /></summary><p>{a}</p></details>)}</div>
        </section>

        <section className="landing-final-section landing-container">
          <div className="landing-final-cta" data-reveal><span className="landing-final-orbit" aria-hidden="true" /><p className="landing-eyebrow">THE NEXT CHAPTER IS YOURS.</p><h2>Make room<br /><em>for what comes next.</em></h2><p>A calmer search. A clearer direction. A workspace built around your next move.</p><Link to={destination} className="landing-button">{user ? 'Back to your dashboard' : 'Find your focus. Start free.'}<ArrowUpRight size={17} /></Link><span className="landing-final-assurance">No card required. Just a little ambition.</span></div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-grid">
            <div className="landing-footer-brand"><Link to="/" aria-label="JobPilot home"><Logo light /></Link><p>A considered space for<br />your next career chapter.</p><span>Built by Kishore Kumar.</span></div>
            <nav aria-label="Footer product links"><h2>THE WORKSPACE</h2>{NAVIGATION.slice(0, 3).map((item) => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}<Link to={destination}>{user ? 'Dashboard' : 'Get started'}</Link></nav>
            <nav aria-label="Footer information links"><h2>GOOD TO KNOW</h2>{NAVIGATION.slice(3).map((item) => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}<a href="mailto:kishorekumar131646@gmail.com?subject=JobPilot%20enquiry">Contact developer<ArrowUpRight size={12} /></a></nav>
            <nav aria-label="Developer links"><h2>MEET THE MAKER</h2>{DEVELOPER_LINKS.map(({ label, href, icon: Icon }) => <a key={label} href={href} target="_blank" rel="noopener noreferrer"><Icon size={14} aria-hidden="true" />{label}<ArrowUpRight size={11} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>)}</nav>
          </div>
          <div className="landing-footer-bottom"><span>© {new Date().getFullYear()} JobPilot. Thoughtfully built.</span><a href="mailto:kishorekumar131646@gmail.com?subject=JobPilot%20enquiry"><Mail size={12} aria-hidden="true" />Let&apos;s make the next move a good one.</a><a href="#landing-title" aria-label="Back to top">BACK TO TOP<ArrowUpRight size={12} /></a></div>
        </div>
      </footer>
    </div>
  )
}
