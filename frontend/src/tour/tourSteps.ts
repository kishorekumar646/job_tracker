// Author: Kishore Kumar
export interface TourStep {
  target: string
  title: string
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

export type PageId = 'dashboard' | 'analyze' | 'regression' | 'history' | 'verdicts' | 'admin' | 'admin-history' | 'admin-feedback' | 'admin-rules' | 'admin-announce' | 'health'

export const PAGE_TOURS: Record<PageId, TourStep[]> = {
  health: [
    {
      target: 'tour-status-bar',
      title: 'System Status',
      content: 'The indicator dot shows the overall health at a glance — green means all services are up, red means one or more are down. Click Refresh to re-run the health check against the backend at any time.',
      placement: 'bottom',
    },
    {
      target: 'tour-services',
      title: 'Service Cards',
      content: 'Each card shows one backend dependency. ODH/Elasticsearch is the failure log source. Jira Injector cross-references known issues. RabbitMQ handles async job queuing. InspectorWeb provides execution data — it requires a VPN connection, so an Offline status here usually means you\'re not on VPN.',
      placement: 'bottom',
    },
    {
      target: 'tour-about',
      title: 'About This Project',
      content: 'A quick overview of the Inspector AI RCA System — what it does, its key capabilities, the tech stack it runs on, and what this Health page is actually monitoring.',
      placement: 'top',
    },
    {
      target: 'tour-api-message',
      title: 'API Status Message',
      content: 'The raw status message returned by the backend health endpoint. Lists any services the backend itself considers unavailable, which can be more specific than the card-level Online/Offline indicator.',
      placement: 'top',
    },
  ],
  dashboard: [
    {
      target: 'tour-date-filter',
      title: 'Date Range Filter',
      content: 'Narrow the dashboard to any date range. All charts, stats, and recent verdicts update instantly. Use "Clear" to return to the full history.',
      placement: 'bottom',
    },
    {
      target: 'tour-stats',
      title: 'Summary Statistics',
      content: 'At a glance — total analyses run, total verdicts issued, unique platforms seen, and how many failures were linked to a known Jira issue.',
      placement: 'bottom',
    },
    {
      target: 'tour-charts',
      title: 'Failure Breakdown Charts',
      content: 'Three charts: Failure Categories (donut) shows root-cause breakdown, Platform Distribution (bar) shows which platforms fail most, and Verdict Trend (line) tracks daily failure volume over time.',
      placement: 'top',
    },
    {
      target: 'tour-regression',
      title: 'Regression',
      content: 'Runs started from the Regression tab in the selected range. Failed Runs finished with at least one failed test; Aborted Runs were stopped before finishing (for example the run config\'s time limit) and may keep partial results; the pass rate counts passed vs failed tests across all runs. Below: runs per day, what is running now, your schedules (next starts, and any that stopped or hit an error) and how many finished runs are analysed, with their top failure categories. Hover the ⓘ next to a card title for details. You see your own runs; admins can switch between My runs and Everyone.',
      placement: 'top',
    },
    {
      target: 'tour-service-health',
      title: 'Service Health (Live)',
      content: 'Shows the real-time status of all backend dependencies — ODH/Elasticsearch, Jira Injector, RabbitMQ, and InspectorWeb. This section auto-refreshes every 60 seconds in the background and stays in sync with the Health page and the header alert bell — no manual refresh needed.',
      placement: 'top',
    },
    {
      target: 'tour-recent',
      title: 'Recent Verdicts',
      content: 'The latest analysis verdicts across all runs — category badge, platform, confidence score, and explanation. Click any row to jump to the full job results.',
      placement: 'top',
    },
    {
      target: 'tour-notifications',
      title: 'Notification Inbox',
      content: 'The bell icon shows how many unread notifications you have. You receive a notification when an admin views your job history or your analysis report. Admins can also broadcast announcements to all users. Click the bell to open your inbox — click any item to see full details beside it.',
      placement: 'bottom',
    },
  ],

  analyze: [
    {
      target: 'tour-mode',
      title: 'Analysis Mode',
      content: 'Single Run (Sync) streams results immediately for one specific test execution — you can watch verdicts arrive in real time. Batch Analysis (Async) analyses many runs started from the Regression tab in the background — runs analysed before reuse their stored verdicts — and the results land in Job History.',
      placement: 'bottom',
    },
    {
      target: 'tour-form',
      title: 'Analysis Form',
      content: 'For Single Run: paste the InspectorWeb Execution Run UUID. For Batch: pick a time window, who started the runs, and optionally a run name or schedule — the list below shows exactly which runs will be analysed, and you can untick any of them.',
      placement: 'right',
    },
    {
      target: 'tour-submit',
      title: 'Run Analysis',
      content: 'Click Analyze to start. The system fetches failure data from ODH/Elasticsearch, applies the RCA rule engine, and emits one verdict per failing test case. You can stop it at any time with the Stop button.',
      placement: 'top',
    },
    {
      target: 'tour-terminal',
      title: 'Live Log Terminal',
      content: 'Streams each step of the analysis in real time — fetching data, matching rules, and emitting verdicts. Green lines are successes, yellow are warnings, red are errors. Scroll up to review earlier output.',
      placement: 'bottom',
    },
  ],

  regression: [
    {
      target: 'tour-reg-new',
      title: 'Create a Run Config',
      content: 'Opens a step-by-step wizard: About (name and labels), What to run (test cases or Xray JQL), Where (STB boxes or OTT devices, locked-for group), Options (Mocha hooks, metadata) and an Overview. Save it, or Save & Execute to start a run straight away.',
      placement: 'bottom',
    },
    {
      target: 'tour-reg-filters',
      title: 'Find a Run Config',
      content: 'Only your own run configs are listed. Filter by name, the full UUID or a label; the pages and total are just below.',
      placement: 'bottom',
    },
    {
      target: 'tour-reg-row-actions',
      title: 'Run Config Actions',
      content: 'Download the JSON, show this config\'s executions in the runs panel, execute it once, view the raw details, duplicate it, edit it or delete it. Hover any icon to see what it does.',
      placement: 'left',
    },
    {
      target: 'tour-reg-schedules',
      title: 'Schedules',
      content: 'Start your run configs automatically — on a cron timetable, continuously, or once — with optional "only when" (days, time windows, max per day) and "stop when" conditions. Schedules are run by this app; cron times use the lab\'s time zone.',
      placement: 'bottom',
    },
    {
      target: 'tour-reg-runs',
      title: 'Runs',
      content: 'Your runs started from this app, with live status (admins can switch between My runs and Everyone). Tick finished runs and click "Batch Analyze" to analyse them together; runs analysed before reuse their stored verdicts.',
      placement: 'bottom',
    },
    {
      target: 'tour-reg-run-card',
      title: 'A Run',
      content: 'Expand a run to see each test case and device, live logs, report links and failed tags. Stop it while it runs (the person who started it, or an admin), Analyze failures once it ends, or delete a finished run from the list. Runs a schedule started carry a Scheduled badge.',
      placement: 'left',
    },
  ],

  verdicts: [
    {
      target: 'tour-job-header',
      title: 'Job Status',
      content: 'Shows the Job ID and its current status — DONE, FAILED, RUNNING, or STOPPED. Running jobs auto-refresh every 3 s so you see verdicts arrive in real time without reloading the page.',
      placement: 'bottom',
    },
    {
      target: 'tour-verdict-stats',
      title: 'Run Summary',
      content: 'Total verdicts produced, average confidence across all matches, the number of distinct failure categories, and how many unique platforms were involved in this job.',
      placement: 'bottom',
    },
    {
      target: 'tour-verdict-charts',
      title: 'Breakdown Charts',
      content: 'Category Breakdown (donut) shows which root-cause categories the rule engine matched. Platform Breakdown (bar) shows which test platforms had the most failures in this run.',
      placement: 'top',
    },
    {
      target: 'tour-verdict-list',
      title: 'Verdict List & Filters',
      content: 'Filter verdicts by category or platform — counts update in the pills as you filter. Each row shows the matched rule, explanation, confidence bar, and (when available) a Jira ticket or InspectorWeb report link. Hover over an explanation or failed reason to reveal a copy button — click it to copy the full text. Use the thumbs-up / thumbs-down on any verdict to mark it correct or wrong — your feedback adjusts rule confidence over time.',
      placement: 'top',
    },
  ],

  history: [
    {
      target: 'tour-stats',
      title: 'Summary Stats',
      content: 'Total analyses, completed jobs, failed jobs, and how many rows match the current filters. The "Showing" count updates as you filter.',
      placement: 'bottom',
    },
    {
      target: 'tour-filters',
      title: 'Filter Bar',
      content: 'Search by Run or Job UUID (debounced), filter by date range, restrict to a specific job status (DONE / FAILED / RUNNING / STOPPED), or switch between Sync and Async jobs. Use "Clear" to reset all filters at once.',
      placement: 'bottom',
    },
    {
      target: 'tour-table',
      title: 'Job History Table',
      content: 'Every analysis job with its status, mode, ID, and created-at timestamp. Click "Created At" to toggle ASC (oldest first) / DESC (newest first) — the page number resets to 1 automatically. Click any row to expand it and see full verdict details including category, confidence, and screenshots. Hover over an explanation or failed reason to reveal a copy button — click it to copy the full text.',
      placement: 'top',
    },
    {
      target: 'tour-actions',
      title: 'Row Actions',
      content: 'View Results opens the full verdict page. Re-run prefills the Analyze form with the same run UUID so you can run it again. Delete permanently removes the record. Running jobs show a Stop button that cancels the background job.',
      placement: 'left',
    },
  ],

  'admin-history': [
    {
      target: 'tour-admin-hist-user-select',
      title: 'Select a User',
      content: 'Type a name or email to search across all registered accounts. Once selected, the full job history for that user loads automatically.',
      placement: 'bottom',
    },
    {
      target: 'tour-admin-hist-stats',
      title: 'History Stats',
      content: 'Total analyses run, completed jobs, failed jobs, and how many match the current filters — all scoped to the selected user.',
      placement: 'bottom',
    },
    {
      target: 'tour-admin-hist-filters',
      title: 'History Filters',
      content: 'Narrow down by Run / Job UUID, date range, job status, or mode (Sync / Async). Click "Created At" to toggle oldest-first or newest-first.',
      placement: 'bottom',
    },
    {
      target: 'tour-admin-hist-table',
      title: 'Job History Table',
      content: 'Every analysis run for this user. Click a row to expand full verdict details including category, confidence, and screenshots. DONE jobs show a View Results button. Hover over an explanation or failed reason to reveal a copy button — click it to copy the full text.',
      placement: 'top',
    },
  ],

  'admin-rules': [
    {
      target: 'tour-rules-description',
      title: 'How Confidence Works',
      content: 'Each rule has a static confidence baked in at authoring time. Once a rule collects 10 or more thumbs-up/down marks from verdict feedback, the system auto-adjusts its effective confidence. Use Override to pin an exact value regardless of feedback.',
      placement: 'bottom',
    },
    {
      target: 'tour-rules-table',
      title: 'Rules Table',
      content: 'One row per RCA rule. Hits = total times matched. The thumbs columns count confirmed and disputed verdicts from user feedback. Static is the authored score, Effective is what the engine actually uses (feedback-adjusted or overridden). Enter 0–100 in the Override field and click Set to force a value; click Reset to revert to feedback-computed or static.',
      placement: 'top',
    },
  ],

  'admin-feedback': [
    {
      target: 'tour-admin-fb-stats',
      title: 'Feedback Stats',
      content: 'Total responses received, the overall average star rating, and quick counts for the best (5★) and worst (1★) scores across all users.',
      placement: 'bottom',
    },
    {
      target: 'tour-admin-fb-distribution',
      title: 'Rating Distribution',
      content: 'Visual breakdown of how responses are spread across all five star levels. Bar width is proportional to share of total responses.',
      placement: 'bottom',
    },
    {
      target: 'tour-admin-fb-filters',
      title: 'Feedback Filters',
      content: 'Search by user email or full name to find a specific person\'s feedback. Use the rating pills to filter by star level — both filters work together.',
      placement: 'bottom',
    },
    {
      target: 'tour-admin-fb-table',
      title: 'Feedback Table',
      content: 'Every submitted feedback entry with user details, comment, star rating, and submission time. Click "Submitted At" to sort oldest or newest first.',
      placement: 'top',
    },
  ],

  'admin-announce': [
    {
      target: 'tour-announce-compose',
      title: 'Compose an Announcement',
      content: 'Write a short title and a full message body. The title appears as the notification header in each user\'s inbox; the message body shows when they open the detail panel. Both fields are required before you can send.',
      placement: 'right',
    },
    {
      target: 'tour-announce-history',
      title: 'Sent History',
      content: 'Every broadcast you\'ve sent, newest first. Each row shows the title, a preview of the body, the sent timestamp, and a live read/unread count. Click any row to expand it — you\'ll see exactly which users have read it (green check) and who hasn\'t seen it yet (amber clock).',
      placement: 'top',
    },
  ],

  admin: [
    {
      target: 'tour-admin-about',
      title: 'About This Page',
      content: 'A quick-reference panel showing what each admin tab does — Users, Job History, Feedback, Rules, and Announce — so you always know where to look without having to switch tabs to find out.',
      placement: 'bottom',
    },
    {
      target: 'tour-add-user',
      title: 'Add New User',
      content: 'Create a new @infosys.com account here. You choose the email and role; the system generates a TOTP secret and returns a QR code URL to share with the new user. They scan it with Google Authenticator or Authy before their first login.',
      placement: 'bottom',
    },
    {
      target: 'tour-tabs',
      title: 'Admin Tabs',
      content: 'Five tabs: Users manages all accounts. Job History lets you inspect any user\'s full analysis history. Feedback shows all star ratings and comments. Rules shows the RCA rule engine stats and lets you override confidence scores. Announce lets you broadcast a message to all active users instantly.',
      placement: 'bottom',
    },
    {
      target: 'tour-user-filters',
      title: 'User Filters & Search',
      content: 'Search by email or full name, filter by role (Admin / User), or by account status (Active / Inactive). Results narrow instantly. Click the "User" (email) or "Created At" column headers to sort the list.',
      placement: 'bottom',
    },
    {
      target: 'tour-user-table',
      title: 'User Table',
      content: 'Every registered user with their role badge, tags, active status, and created-at timestamp. New self-registered accounts show “Pending approval” (with a warning if they look like a duplicate) — approve them with the ✓ button, or reject with the bin. Tags (e.g. Regression) give access to features — click a tag to add or remove it; new accounts start with no tags, so turn on Regression when you approve someone who needs it. Click the pencil icon on a name to edit it inline — press Enter to save or Escape to cancel.',
      placement: 'top',
    },
    {
      target: 'tour-user-actions',
      title: 'User Actions',
      content: 'Shield icon: promote or demote admin role. Person icon: activate or deactivate the account. Refresh icon: reset TOTP — the user must re-scan their QR code. Trash icon: permanently delete the account. All actions require a confirmation step.',
      placement: 'left',
    },
  ],
}
