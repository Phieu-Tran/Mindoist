# Changelog

Notable changes to Mindoist, grouped by date. This project doesn't cut versioned releases yet — entries are dated instead.

## 2026-08-03

### Added
- Expanded the Telegram assistant with confirmed task colors and existing tags, plus read-only task lists and statistics for relative periods or explicit dates using each account's time zone.
- Added persistent Admin health checks for AI providers, including working/failed/untested states, last check time, latency and safe HTTP diagnostics without exposing provider response bodies or API keys.

## 2026-08-01

### Fixed
- The public homepage now exposes the exact `Mindoist` product name as its document title, application metadata, and visible primary heading, plus its purpose, Google Calendar behavior, and policy links in server-delivered HTML for OAuth branding verification.

### Added
- Google Calendar sync can now be enabled per project. Only tasks and planned time from selected projects are exported; Mindoist-owned events are removed from Google when their task/project is explicitly deleted, while Google-origin events remain a read-only overlay in Mindoist and cannot be edited or deleted there.
- Mobile Countdown now matches the web presentation with a responsive two-column card grid, cached cover images with a readable scrim and graceful image fallback, and an image URL field in the create/edit form.
- Mobile Calendar now includes a Week view with a Monday-first seven-day strip, event density dots, weekly agenda groups, and week-by-week navigation across month and year boundaries.

## 2026-07-31

### Added
- The mobile app now reads the signed-in account's real data instead of hard-coded previews. Today, Inbox and Projects come from `GET /tasks` / `GET /projects`, tasks can be completed and reopened from the phone, and Quick Add creates real tasks using the shared `@mindoist/shared/nlparse` parser ("mua sữa ngày mai 9h p1"). Every screen now has explicit loading / error+retry / empty states and pull-to-refresh, and an expired token signs the session out instead of leaving every screen stuck.
- Mobile Calendar is a real calendar: a Monday-first month grid with per-day density dots, an Agenda view grouped by day, and a Day timeline placing time blocks and deadlines on an hour track. Data comes from `GET /calendar/projection` plus read-only Google events from `GET /calendar/providers/google/events`; not connecting Google shows a hint rather than an error.
- Android push notifications. New `DeviceToken` model and `POST`/`DELETE /push/devices` endpoints, plus an Expo Push transport (`apps/api/src/push/expo.ts`) that `sendPushToUser` fans out to alongside web push — so the existing reminder worker delivers to phones with no changes of its own. On the phone, More → Thông báo requests permission explicitly (never on cold start), registers the Expo push token, and drops it again on sign-out; tapping a notification opens the matching tab.
- Mobile test harness: `jest-expo` with 44 unit tests covering the API client, Today/Inbox selection and due labels, month-grid construction, and the push registration flow.
- `DELETE /auth/account` — in-app account deletion, which Google Play requires of any app that lets users create an account and which the API had no endpoint for at all. Confirmation is the account's own email typed back, not a password: accounts created through Google get a random password they have never seen. Every `User` relation cascades, so one delete takes tasks, projects, notes, device tokens and the rest with it.
- Mobile Task Detail: edit title, description, due date and time (native picker), priority, and project; complete/reopen; delete to Trash; view subtasks; add, tick and remove checklist items. Tapping a task in any list opens it.
- Mobile project management: create, rename, recolor and delete projects from the Projects tab, using the app-wide borderless-swatch color picker.
- Mobile Upcoming / Overdue / Completed / Trash views and task search, reachable from More; trashed tasks can be restored.
- Mobile Settings: Pomodoro durations, work hours per day, and a one-tap "use this device's time zone" — plus the account-deletion flow, gated behind typing the account email.
- Mobile Countdown, reachable from More: list, create, edit and delete, with target date and optional time (native picker), colour, a reminder offset matching what the worker already sends (none / same day / 1 / 3 / 7 days before), and the "show on Calendar" flag. Day counts and ordering are ported from the web list, so an already-passed countdown sorts after every upcoming one rather than ahead of them. Countdown notifications now open More instead of Calendar, which only shows the ones flagged `showInCalendar`.

### Fixed
- Push notifications were unreachable on an Android emulator — the main development target — because `isPushSupported()` refused whenever `Device.isDevice` was false. That flag is false on every emulator, but only an *iOS simulator* genuinely cannot receive remote notifications; an Android emulator with Google Play services registers with FCM like a handset. The check is now iOS-only.
- The "Bật thông báo" button never appeared on Android 13+: a `POST_NOTIFICATIONS` permission that has never been requested reports as `denied`, and the status mapping treated that as a permanent refusal, offering only "open system settings". It now distinguishes a real refusal (`denied` with `canAskAgain: false`) from one that has simply not been asked yet.
- Every mobile screen crashed with "Maximum update depth exceeded" as soon as it mounted: `useRefreshOnFocus` passed the refresh callback straight into `useFocusEffect`'s dependency array, so each refresh set state, which re-rendered, which produced a new callback identity, which re-ran the focus effect. The callback is now read through a ref with an empty dependency array. Related hardening in the same pass: the disabled branch of `useResource` returns the existing state object instead of allocating a fresh one, and the two render-phase ref assignments moved into effects (the React Compiler is enabled for this app).
- The mobile app failed to start at all in Expo Go on Android: `expo-notifications` throws the moment it is imported there (remote notifications were removed from Expo Go in SDK 53), which took down the root layout's module and left every screen with "Route ./_layout.tsx is missing the required default export". The module is now loaded lazily behind a guard (`src/notifications/expo-notifications.ts`), so Expo Go keeps working for everything except push — which needs a development build regardless.
- `android.googleServicesFile` pointed at a git-ignored file, so Expo logged "Could not parse Expo config" on every reload for anyone without a Firebase project. It is now added conditionally from `app.config.js` only when the file is actually present.

## 2026-07-30

### Fixed
- Editing a task (PATCH) failed with a CORS preflight error on the split-domain deploy (web and API on separate subdomains): `@fastify/cors` v11's default `methods` list is `GET,HEAD,POST` only (older versions defaulted to include PUT/PATCH/DELETE too), and the API's `cors` registration never overrode it. Same-origin deploys never hit this because same-origin requests skip CORS preflight entirely. Now explicitly allows `GET,HEAD,POST,PUT,PATCH,DELETE`.

## 2026-07-29

### Fixed
- `apps/web/Dockerfile` never learned about the new `@mindoist/design-tokens` workspace package that `apps/web` now depends on - it only `COPY`s `packages/shared`, so the isolated Docker build had no source for it at all (`pnpm --filter @mindoist/web build` failed) even though it built fine locally, where pnpm's existing workspace symlinks already had it. Added the missing `COPY`/build step for both the `deps` and `build` stages; verified with a real `docker build`, not just local `pnpm build`.

### Added
- EPIC R task/calendar architecture: explicit Deadline values, multiple planned `TimeBlock` entities, external calendar links, provider abstraction, idempotent sync v2, and additive Prisma migrations that preserve the legacy rollback path.
- A shared three-layer `@mindoist/design-tokens` package for web and mobile, with independent brand, status, priority, project, and provider color ownership.
- Task Detail v2 property registry and independent Deadline/Planned time editing, plus mobile Agenda/Day/3-day calendar surfaces.
- Tags are now actually usable: a "+" next to Tags in the sidebar creates one, and Task Detail has a tag picker (multi-select dropdown) to assign/remove tags on a task. The `/tags` API and sidebar tag list existed before this, but nothing in the UI could create a tag or attach one to a task.

### Fixed
- Expo Metro now watches the monorepo root and resolves pnpm workspace packages, so mobile Android/iOS bundles can import `@mindoist/design-tokens` at runtime instead of failing after a successful TypeScript check.
- Task autosave now updates without closing the inspector; stale initial fetches can no longer overwrite newer mutations, and partial mutation responses are normalized so missing `tagIds` cannot crash task rows after complete/reopen/Pomodoro actions.
- Reloading during an in-flight `/auth/me` request no longer signs the user out: persisted tokens are removed only after an explicit authentication rejection, not after an abort or transient network failure.
- Playwright runs block service workers for deterministic navigation/reload behavior, and calendar assertions target visible event content rather than hidden accessibility tooltips.
- `useTags` fetched on every mount with no auth gate at all (unlike every sibling data hook), including on the login screen with no token yet — the source of the "Missing token" 401 on `/tags` seen while debugging the split-domain deploy. Now gated behind `Boolean(user)` like `useNotes`/`useCountdowns`.
- Task responses (list, single, create, update) never included which tags a task had — the `taskTags` join table was written to (for recurring-task copies) but never read back into any response.

### Changed
- Task Detail now progressively discloses properties and autosaves through a dedicated callback; Deadline and Planned time remain separate concepts throughout DTO, API, local sync, and UI.
- Calendar now consumes a headless projection of TimeBlock, Deadline, and external-event kinds. Dropping backlog work creates a time block; dragging/resizing planned work no longer mutates its deadline.
- Calendar redesigned for a cleaner, Akiflow-inspired look, focused especially on Week view:
  - New custom toolbar (previous/next, Today, centered date range, Month/Week/Day segmented control) replacing FullCalendar's default one, for full control over spacing and the "selected view" treatment.
  - Week/Day timed events now render as their own card: time + title, an icon when the task has a note, adaptive 1-2 line title depending on how tall the slot is, and a bold left border in the task's priority/custom color.
  - Overlapping timed events now split into side-by-side columns automatically instead of visually stacking with an offset.
  - Week/Day auto-scrolls to roughly the current time (an hour of context above "now") when opened, instead of a fixed 8am.
  - The current-time line is now a thin red line with a round dot at its start (was primary-colored with the dot hidden).
  - Today's column header in Week/Day view now gets a filled pill badge, matching the existing month-view "today" treatment.
  - Extracted `CalendarHeader`, `CalendarToolbar`, and `CalendarEventCard` out of the monolithic `CalendarView` component.

### Fixed
- Timegrid hour/day-divider grid lines never actually rendered at any opacity - a pre-existing `border: none !important` reset on every table cell forced `border-style: none`, and every tuning pass only ever changed the border *color*, which has no visual effect without a style. Now sets the full border shorthand, and lands at a level that's genuinely visible as a line without reading as a heavy table border.
- A multi-day task (start date ≠ due date) rendered as multiple disconnected single-day pills instead of one continuous range bar, both on the Month view and the Week/Day "All day" row - every day-segment of the span was getting full corner rounding and its own colored left border. Now only the true start/end segments round their outer corners, so the bar reads as one continuous strip (matching TickTick's rendering, which prompted the comparison).
- Found investigating the above: month-view and all-day-row events had *no visible title text at all* - a custom `eventContent` callback (added for the Week/Day event-card redesign) returning `undefined` for those events doesn't fall back to FullCalendar's default rendering as assumed; it renders empty content. Now reproduces the default markup explicitly.

## 2026-07-28

### Added
- Rate limiting on registration and login (per-IP and per-email) to curb spam signups and credential-stuffing attempts.
- Accounts created via Google sign-in can now set a password from Settings > Account, so email/password login works afterward too.
- Summary now has a Week/Month view switch, backed by a full monthly calendar overview (previously week-only; renamed from "Weekly Review" to "Summary" to match).
- Delete a project from its workspace header (with an in-app confirm dialog) — the API supported it, but nothing in the UI ever called it before.
- Quick-complete checkbox next to the task title in Task Detail, instead of only the "Complete" button in the footer.
- Completed tasks now show dimmed (not hidden) on both Calendar and the Summary calendar overview, so a day's finished work stays visible.

### Fixed
- Calendar Week/Day view no longer overflows its card — the time grid stayed at natural height instead of scrolling inside its container.
- Minor accessibility polish: proper labels on the Notes list/editor and Countdown form.
- Google sign-in could get stuck on the login screen until a hard refresh — the PWA service worker was serving the cached app shell for the OAuth callback instead of letting it reach the API.
- Login/register email is now case-normalized, so "Foo@x.com" and "foo@x.com" can't create two separate accounts.
- Editing or completing a task from the Summary view didn't refresh Summary's own data, so the change wasn't visible there until a full page reload.
- The completed-task dimming above didn't actually show anything at first: Calendar was fetching tasks with a filter that excluded completed ones entirely, so there was nothing to dim.
- Project Kanban board: each column now scrolls independently instead of growing the whole page, and open tasks always sort above completed ones within a column.
- Calendar's "+more" popover (Month view) was transparent, so the day cell behind it bled through and text overlapped unreadably — it now has a proper opaque background.
- Calendar page's "Today" panel only matched a task's exact due date, so a multi-day task spanning today (start date before, due date after) never showed up there even though it's plotted as an in-progress bar on the calendar right next to it.
- A task with both a date range and a specific due time silently lost the time entirely - it always rendered as an all-day spanning bar. Now a due time always wins: the task shows as a timed event on its due date instead.

### Changed
- Calendar Week/Day time-grid rows are ~23% shorter (2.2rem → 1.7rem per 30 min), so more of the day is visible without scrolling.
- Calendar Week/Day event cards read more like solid Akiflow-style blocks: overlapping events no longer touch edges or wrap their time label into broken text, priority-colored events use a bolder tint than the month view's chips, and cards have noticeably more internal padding.
- A task's custom color now also shows as a bold left border in the task list (previously only a soft background tint), so the color reads more clearly at a glance.
- Fixed a root-cause bug behind the border-color issues above: `index.css`'s global `*, *::before, *::after { border-color: var(--border) }` reset lived outside any `@layer` block, so — per the CSS cascade layers spec — it always beat Tailwind's own utility classes (which live inside Tailwind's `utilities` layer) regardless of specificity. Every `border-l-[...]` color anywhere in the app was silently overridden by the flat default gray until this reset moved into `@layer base`.
- Fixed: the Calendar page's Today/Backlog panel's priority-colored border used a class built via string interpolation (`` border-l-[var(--color-p${priority})] ``); Tailwind's build-time scanner can't see dynamically-constructed class names, so it never generated CSS for any of the 4 variants. Replaced with 4 statically-spelled-out classes so Tailwind can find them.
- Fixed: a task's custom color never actually showed in the Calendar page's Today/Backlog side panel — the row's left-border class only defined a CSS variable without ever using it as the actual border color, so every custom-colored task silently fell back to the same default gray border.
- Fixed: reloading (or opening a bookmarked/typed URL for) a client-side route that shares a path prefix with an API route (e.g. `/tasks/:id`) in the dev server showed the API's raw JSON error instead of the app — the dev proxy forwarded any matching path straight to the API with no way to tell a real browser navigation from the app's own fetch calls. It now falls through to `index.html` for navigation requests (`Accept: text/html`), matching the same distinction already made in the production nginx config.

## 2026-07-27 — 2026-07-28

### Changed
- Production deploy simplified: the web container now serves the built SPA with `vite preview` instead of bundling nginx; the API's Docker build no longer needs manual memory tuning.
- Fixed a migration ordering bug (`add_work_hours_per_day` depended on a column only created by a later migration) that only surfaced on a true from-empty `prisma migrate deploy`.

## 2026-07-26

### Added
- Direction B workspace redesign, following a full UI/UX audit.
- EPIC D: surface layering, metadata chips, and accessibility (AA contrast) fixes across the app.

### Fixed
- Task color tint now persists correctly on a selected row.
- Themed date picker for countdowns; removed a duplicate Import/Export nav entry.

## 2026-07-23

### Changed
- Consolidated the Settings page (Google Drive backup, countdowns, task color now live together).

## 2026-07-21

### Added
- Google Drive backup — export and restore all user data.
- Calendar UI redesign (softened styling, dark-mode fixes).
- TaskDetail visual polish; priority is now optional (nullable).

## 2026-07-20

### Added
- Offline-first sync engine (IndexedDB cache via Dexie + mutation queue).
- Quick Notes with Markdown support.
- PWA support — installable app, Web Push notifications.
- Calendar view (FullCalendar month/week/day) with drag-to-reschedule.
- Google Calendar integration — OAuth connect, two-way sync (push tasks as events, pull existing events), last-write-wins conflict handling.
- Keyboard shortcuts and dark mode.
- TickTick CSV import with a dry-run preview.
- Pomodoro timer, due countdowns, Kanban project workspace, and the Summary Dashboard.

## 2026-07-18

### Added
- Initial data model (Prisma schema, 9 models) and API foundation (Fastify).
- Authentication (JWT-based login/register) and bilingual support (English/Vietnamese).
- Test harness — Vitest for unit tests, Playwright for end-to-end.
- Web UI foundation — sidebar, task list, task detail panel.
- Quick Add — natural language date/time parsing for both English and Vietnamese input.
- Design system — Tailwind CSS v4 + shadcn/ui with semantic tokens.
