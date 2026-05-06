# Organisaitor

A personal life organisation app — tasks, calendar, and tracking in one place, with cloud sync and offline support.

Built as a **desktop app** (Tauri v2 on Windows/Mac/Linux) with a **PWA web version** for mobile access. All data is owned by you: it lives in your Supabase project and syncs seamlessly across devices.

---

## Features

### Tasks
- Create, organise, and prioritise tasks with subtasks, deadlines, priorities, and time-intensity estimates
- Group tasks into **Endeavours** (Projects or Lists) — Projects are completable and time-bounded, Lists are ongoing
- Tag tasks and associate them with **Purposes** (high-level life areas like "Career" or "Health")
- Task kinds: `action`, `waiting` (chasing someone else), `milestone`
- Focused and Overview view modes

### Calendar
- Monthly calendar view with events and reminders
- Recurring items (daily/weekly/monthly/yearly with flexible end conditions)
- Birthday event type — all-day, auto-repeats yearly, notify at a chosen time
- Overflow day pane — click "+N more" to see all items for a date

### Endeavours (Collections)
- **Projects** — completable, with optional deadline and completion date
- **Lists** — ongoing, never complete
- Each has a name, colour, and optional Purpose association
- Colour-coded throughout the app

### Sync & accounts
- **Guest mode** — fully functional with no account (data in localStorage)
- **Cloud sync** — sign in with email/password to sync to Supabase
- On first sign-in, existing local data migrates to the cloud automatically
- Sign out clears local cache; sign back in from any device to restore data
- Export backup (JSON) available from the Account pane

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| UI framework | React 19 + TypeScript |
| State management | Zustand 5 |
| Styling | CSS Modules |
| Desktop wrapper | Tauri v2 |
| Backend / auth | Supabase (PostgreSQL + Row-Level Security) |
| Build tool | Vite 8 |
| Web hosting | Vercel |

---

## Getting started

### Prerequisites

- Node.js 18+
- Rust + Cargo — only needed for the Tauri desktop build

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Supabase (optional — for cloud sync)

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env.local
```

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Without these, the app runs in guest mode (localStorage only).

### 3. Run the web dev server

```bash
npm run dev        # http://localhost:5173
```

### 4. Run the desktop app (Tauri)

```bash
npm run tauri dev  # builds Rust backend + launches desktop window with hot reload
```

---

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of [`supabase/migrations/001_initial.sql`](supabase/migrations/001_initial.sql)
3. Go to **Project Settings → API** and copy the Project URL and anon/public key into `.env.local`

This creates six tables (`tasks`, `collections`, `tags`, `purposes`, `calendar_events`, `calendar_reminders`) with Row-Level Security enabled — each user can only read and write their own rows.

---

## Deployment (Vercel — web/PWA)

1. Go to [vercel.com](https://vercel.com) and import this GitHub repo
2. Vercel auto-detects Vite; leave build settings as defaults
3. Add environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. Deploy — you'll get a public URL instantly

The deployed web app is installable as a PWA on mobile (Add to Home Screen from the browser). Camera, microphone, and geolocation APIs are available to the PWA.

---

## Project structure

```
src/
  components/       UI components (one folder per component)
  store/            Zustand stores (taskStore, calendarStore, uiStore, authStore, …)
  services/
    supabase.ts     Supabase client
    sync/           Cloud sync layer (mappers + subscription-based sync service)
  types/            Shared TypeScript types
  utils/            Date helpers, ID generators, colour utilities
  config/           Label overrides (rename "Endeavour" etc. without touching logic)
supabase/
  migrations/       SQL schema — run once in Supabase SQL Editor
src-tauri/          Rust/Tauri desktop backend
```

---

## Roadmap

See [`BACKLOG.md`](BACKLOG.md) for the full requirements backlog. Highlights:

- **Records** — a dedicated section for tracking habits, books, movies, and custom logs (e.g. workout logs, scuba dives). Custom field schemas, heatmap views, Strava integration.
- **Daily planner** — drag tasks into a timeline for the day, with time-intensity-aware slot suggestions
- **AI agent integration** — paste meeting notes → auto-generate tasks; voice control; custom agent endpoint
- **Notes** — note-taking with bidirectional links to tasks and tracker entries
- **Native mobile** — Tauri v2 mobile or React Native once the PWA proves the use case

---

## Name

*Organisaitor* — a life organiser with an AI agent at its core (eventually).
