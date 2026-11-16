// Author: Kishore Kumar
import type { SettingsTab } from '../store/settingsStore'

interface GuideStep { target: string; title: string; text: string }
interface PageGuide {
  title: string
  summary: string
  href: string
  settings?: SettingsTab
  admin?: boolean
  steps: GuideStep[]
}

export const PAGE_GUIDES: Record<string, PageGuide> = {
  '/dashboard': {
    title: 'Dashboard', summary: 'Read your pipeline totals and application activity.', href: '/dashboard',
    steps: [
      { target: 'page-header', title: 'Your search at a glance', text: 'Start here to review your application totals and pipeline. Date filters change the reporting period, not the underlying records.' },
      { target: 'workspace', title: 'Follow your momentum', text: 'Use Applications over time to see your activity as a chart. Open Applications to update a stage or record your next interview; saved changes refresh your dashboard.' },
    ],
  },
  '/jobs': {
    title: 'Find jobs', summary: 'Import listings, narrow your search and compare matches.', href: '/jobs',
    steps: [
      { target: 'page-header', title: 'Build a relevant shortlist', text: 'Search and filter the saved catalogue by role, location, source and match. Your resume skills and preferences influence match scores.' },
      { target: 'workspace', title: 'Fresh listings, deliberate applications', text: 'Fetch live jobs imports new external listings. The regular page refresh only reloads saved data. Open the original listing to apply, then add or update its tracker entry.' },
    ],
  },
  '/applications': {
    title: 'Applications', summary: 'Manage stages, interview details, notes and offers.', href: '/applications',
    steps: [
      { target: 'page-header', title: 'Keep every application in view', text: 'Search your applications and filter by stage or source. Tracker entries can be added manually or created by an eligible auto-apply run.' },
      { target: 'workspace', title: 'Keep the record accurate', text: 'Update stages, notes, interview dates and offer details as your search progresses. Deleting an entry removes it from this tracker and its totals; it does not withdraw an external application.' },
    ],
  },
  '/auto-apply': {
    title: 'Auto-apply', summary: 'Understand eligibility, usage limits and run history.', href: '/auto-apply',
    steps: [
      { target: 'page-header', title: 'Review your readiness', text: 'Verify your email, add resume skills, set preferences and connect a platform profile before running. Your plan determines the available usage limit.' },
      { target: 'workspace', title: 'Know what a run does', text: 'A run finds matching jobs and creates entries in your tracker. It does not submit external application forms. Review the run history, then visit the original postings to complete real applications. Schedules require an available server.' },
    ],
  },
  '/connections': {
    title: 'Connections', summary: 'Manage your job-platform profile links.', href: '/connections',
    steps: [
      { target: 'page-header', title: 'Connect your profiles', text: 'After verifying your email, save the handle or profile URL for the platforms you use. JobPilot does not request or store their passwords.' },
      { target: 'workspace', title: 'Stay in control', text: 'Edit a profile link when it changes or disconnect a platform you no longer use. These links support your tracker setup; they are not permission to submit forms on other websites.' },
    ],
  },
  '/billing': {
    title: 'Plans & UPI payments', summary: 'Check limits, pay from your phone and follow verification.', href: '/billing',
    steps: [
      { target: 'page-header', title: 'Choose the access you need', text: 'Review your current plan, usage, Pro price and duration here. Upgrading or extending opens an order with an exact payment amount and an expiry timer.' },
      { target: 'workspace', title: 'Pay, return and wait for confirmation', text: 'On a phone, choose an installed UPI app. On desktop, scan the QR using your phone. Keep the exact amount, return to JobPilot and wait for server verification. Opening a payment app is not payment confirmation. Paid orders provide invoices.' },
    ],
  },
  'settings:profile': {
    title: 'Profile', summary: 'Manage your photo, resume, skills and personal details.', href: '/dashboard', settings: 'profile',
    steps: [
      { target: 'settings-content', title: 'Make your profile useful', text: 'Upload a photo and resume, then review your extracted skills, location and experience. Save profile edits here. Open Security for email verification, session details and device sign-in.' },
    ],
  },
  'settings:security': {
    title: 'Security', summary: 'Verify your email and manage sessions and device passkeys.', href: '/dashboard', settings: 'security',
    steps: [
      { target: 'settings-content', title: 'Review your account protection', text: 'Verify your email to unlock connected-account features. Review the live access-token countdown and refresh-session expiry, and refresh your session when needed. TOTP remains available for sign-in and account recovery is handled by an administrator.' },
      { target: 'passkeys', title: 'Protect access to your account', text: 'Session details show your expiry. Enroll a passkey with a current authenticator code to make device sign-in the default in this browser. Your device may use Face ID, fingerprint or PIN. Keep TOTP as your fallback; removing a passkey also requires a current code.' },
    ],
  },
  'settings:preferences': {
    title: 'Preferences', summary: 'Set target roles, locations and matching preferences.', href: '/dashboard', settings: 'preferences',
    steps: [
      { target: 'settings-content', title: 'Tell JobPilot what fits', text: 'Choose preferred titles, locations, job types, salary and remote-work preferences. Save your changes so matching and future imports use the updated criteria.' },
      { target: 'settings-content', title: 'Control matching and updates', text: 'Set the minimum match score and auto-apply preferences, subject to your plan. Announcement preferences control broadcast messages; account and payment updates still matter.' },
    ],
  },
  'settings:shortcuts': {
    title: 'Keyboard shortcuts', summary: 'Learn navigation and settings shortcuts for your device.', href: '/dashboard', settings: 'shortcuts',
    steps: [{ target: 'settings-content', title: 'Move around with your keyboard', text: 'The keys shown here match your operating system. Navigation shortcuts use Command on Apple devices and Ctrl elsewhere. Letter shortcuts are ignored while you type in a field. Escape closes settings; when a guide is open, it closes the guide first.' }],
  },
  'admin:users': {
    title: 'Admin: users', summary: 'Manage roles, Pro access and account recovery.', href: '/admin?tab=users', admin: true,
    steps: [
      { target: 'admin-tabs', title: 'Account administration', text: 'Use Users to inspect accounts and manage roles, activation status and Pro access. Announcements, Orders and Feedback each have a separate tab and guide.' },
      { target: 'admin-content', title: 'Handle sensitive changes carefully', text: 'Granting Pro does not require a payment. Resetting an authenticator revokes device passkeys and pending enrollment; share the replacement QR securely. Deleting an account removes its saved data, including feedback.' },
    ],
  },
  'admin:announce': {
    title: 'Admin: announcements', summary: 'Compose broadcasts and inspect recipient read status.', href: '/admin?tab=announce', admin: true,
    steps: [
      { target: 'admin-content', title: 'Send a useful broadcast', text: 'Write a concise title and message, review the inbox preview and send to eligible active users. Users can opt out of broadcasts in Preferences.' },
      { target: 'admin-content', title: 'Understand delivery and reads', text: 'Open sent history to inspect recipients, read counts and opt-outs. A delivered message is not necessarily read. Deleting a broadcast also removes it from recipient inboxes.' },
    ],
  },
  'admin:payments': {
    title: 'Admin: orders', summary: 'Review orders and reconcile verified bank credits.', href: '/admin?tab=payments', admin: true,
    steps: [
      { target: 'admin-content', title: 'Investigate payment status', text: 'Filter orders and inspect their amount, expiry and status. Bank alert logs help explain why a payment was matched or left unmatched.' },
      { target: 'admin-content', title: 'Reconcile with evidence', text: 'Use statement upload or manual approval only after checking a genuine bank credit. A screenshot, opened UPI app or user claim alone is not proof of payment.' },
    ],
  },
  'admin:feedback': {
    title: 'Admin: feedback', summary: 'Read ratings and comments and mark items reviewed.', href: '/admin?tab=feedback', admin: true,
    steps: [
      { target: 'admin-content', title: 'Listen to your users', text: 'Feedback includes the signed-in user, star rating, optional comment and page path. Filter New or Reviewed to focus on what needs attention.' },
      { target: 'admin-content', title: 'Keep the review queue current', text: 'Mark an item reviewed after reading it, or mark it new to revisit it. Pagination and automatic refresh keep the list manageable without hiding older submissions.' },
    ],
  },
  '/onboarding': {
    title: 'Account setup', summary: 'Add a resume, preferences and platform profiles.', href: '/onboarding',
    steps: [{ target: 'onboarding-content', title: 'Set up at your own pace', text: 'Upload a resume, review preferences and add platform profile links. You may skip setup and return through Settings. Verify your email before connecting accounts. Connections and auto-apply do not submit applications externally.' }],
  },
  '/guide': {
    title: 'Guide library', summary: 'Find help for a specific page, without repeated walkthroughs.', href: '/guide',
    steps: [{ target: 'workspace', title: 'The right help for the current page', text: 'Each card opens a different page or settings tab. Use its Guide button for focused instructions. The automatic guide appears on the first two workspace visits per account; manual guides remain available afterward. Share feedback from the navigation menu whenever you need to.' }],
  },
}
