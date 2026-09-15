# Organisaitor

A personal life-organisation suite — tasks, calendar, habit/tracker records, lists,
notes, investment tracking, and fitness logging, all in one app, with cloud sync and
offline support. All data is owned by you: it lives in your own Supabase project and
syncs across every device you run this on.

Built as a single codebase deployed three ways: a **desktop app** (Tauri v2 — Windows/Mac/Linux),
a **PWA web app** (Vercel), and a **native Android app** (Capacitor). One Vite build, one
Tauri binary, one APK — the same React/TypeScript app runs everywhere.

---

## Apps in the suite

| App | What it does |
|-----|--------------|
| **Organizer** (Tasks, Calendar, Records, Lists) | The core, free part of the suite |
| **Notes** | Rich-text knowledge base with hierarchical notebooks and cross-cutting tags |
| **Portfolio** | Investment watchlist tracking with live ticker data |
| **Fitness** | Activity logging with Strava sync |

Navigate between them with `1`–`7` (or click the sidebar) — see Hotkeys below.

---

## Features

### Tasks
- Subtasks, priorities, time-intensity estimates, links, notes
- Task kinds: `action`, `waiting` (chasing someone else), `milestone`
- Two independent date fields — **deadline** (due-by) and **scheduled** (day you plan to
  work on it) — each automatically shows up on the Calendar as its own kind of entry, kept
  in sync as you edit the task
- Group tasks into **Endeavours** (Projects, which are completable and time-bounded, or
  Lists, which are ongoing) and tag them with **Purposes** (life areas like "Career" or
  "Health") — both are shared across every section of the app
- Focused and Overview view modes; fully keyboard-driven (see Hotkeys)

### Calendar
- Month / Week / Day views, with a real hourly time grid in Week/Day
- **Schedules** — named, colour-coded recurring weekly timetables (a university or gym
  schedule) that layer on top of the real calendar and toggle on/off independently
- **Layer toggle** — show/hide Events, Reminders, Task-scheduled items, and Task deadlines
  independently
- Recurring events/reminders (daily/weekly/monthly/yearly, flexible end conditions),
  multi-day events, birthdays (auto-repeating yearly)
- ICS calendar import with a review step before anything lands on your calendar
- Account-wide timezone setting, correctly re-stamping existing data when changed

### Records
- Custom **trackers** with user-defined field schemas (text, number, date, rating, select,
  boolean, url, duration) — built-in templates for habits, books, and movies
- **Routines** — daily repeating checklists with their own history view

### Lists
- **Watchlists** (movies, books, games, places, …) with a status pipeline, or **reference
  lists** (credentials, subscriptions, contacts, …) shown as a table
- Custom field schemas and optional tabs per list, drag-and-drop tab reordering
- 12 built-in list templates, fully customisable, plus your own custom types

### Notes
- Tiptap-based rich-text editor: tables, resizable images, multi-column sections, headings
  with auto-numbering, hyperlinks, super/subscript, per-note tabs
- Hierarchical **notebooks** (areas/subjects/topics) plus cross-cutting **annotation tags**
  with their own custom attribute fields, and curated tag presets
- Drag notebooks onto each other to re-nest them, Explorer-style

### Portfolio & Fitness
- **Portfolio**: a stock/asset watchlist with live quotes, sector filtering, sort &
  group-by, and a chart view
- **Fitness**: manual activity logging with fully customisable activity types (their own
  field schemas, like Records' trackers), plus one-tap Strava sync (OAuth, no secrets ever
  reach the browser)

### Suite-wide
- **Cross-device Supabase sync** for every app's data, with soft-delete tombstones (so
  deletions propagate correctly) and conflict resolution by most-recently-updated
- **Dark mode** (light / dark / system), fully theme-aware including native form controls
- **Customizable hotkeys** — rebind the core navigation/action shortcuts in Settings, with
  conflict detection and one-click reset to defaults
- **Guest mode** — fully functional with no account at all (localStorage only); sign in any
  time to start syncing, or export/restore a full JSON backup from the Account pane
- Global link-hover preview, external links open correctly under both Tauri and Android

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| UI framework | React 19 + TypeScript (strict) |
| State management | Zustand 5 |
| Rich text editor | Tiptap v3 (Notes) |
| Styling | CSS Modules (no Tailwind, no inline styles except dynamic values) |
| Desktop wrapper | Tauri v2 |
| Android wrapper | Capacitor 8 |
| Backend / auth | Supabase (PostgreSQL + Row-Level Security) |
| Build tool | Vite 8 |
| Web hosting / edge functions | Vercel |

---

## Getting started

### Prerequisites

- Node.js 18+
- Rust + Cargo — only needed for the Tauri desktop build
- Android Studio + JDK 21+ — only needed for the Android build (see `docs/android/00-architecture.md` for environment gotchas)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables (optional — for cloud sync and Fitness's Strava integration)

```bash
cp .env.example .env.local
```

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Optional — only needed for Fitness's Strava sync
VITE_STRAVA_CLIENT_ID=your-strava-client-id
STRAVA_CLIENT_SECRET=your-strava-client-secret   # server-only, never VITE_-prefixed
```

Without Supabase credentials, the app runs entirely in guest mode (localStorage only).

### 3. Run the web dev server

```bash
npm run dev        # http://localhost:5173
```

### 4. Run the desktop app (Tauri)

```bash
npm run tauri dev  # builds the Rust backend + launches a desktop window with hot reload
```

### 5. Run the Android app (Capacitor)

```bash
npm run build:android   # web build + capacitor sync
npm run open:android    # opens the project in Android Studio
```

See `docs/android/00-architecture.md` for the full Android architecture, and the other
files in `docs/android/` for what's built vs. still planned per app section.

---

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run every file in [`supabase/migrations/`](supabase/migrations)
   **in numeric order** (there are 15 as of this writing — each is additive, so running them
   in order against a fresh project is safe and required)
3. Go to **Project Settings → API** and copy the Project URL and anon/public key into
   `.env.local`

This creates the full schema — tasks, collections, tags, purposes, calendar events and
reminders, tracker entries, schedules, lists (+ items + custom types), and (if you set up
Strava) a token-storage table for Fitness's sync — all with Row-Level Security enabled, so
each signed-in user can only read and write their own rows.

---

## Deployment (Vercel — web/PWA)

1. Go to [vercel.com](https://vercel.com) and import this GitHub repo
2. Vercel auto-detects Vite; leave build settings as defaults
3. Add environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and (if using
   Fitness's Strava sync) `VITE_STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET`
4. Deploy — you'll get a public URL instantly

The deployed web app is installable as a PWA on mobile (Add to Home Screen from the
browser). The `api/` directory ships as Vercel Edge Functions — Strava's OAuth
callback/status/sync endpoints, and a ticker-data proxy for Portfolio — none of which run
against the local Vite dev server, only on an actual Vercel deployment.

---

## Project structure

```
src/
  App.tsx             Root: hotkey dispatch, modal routing, section switcher
  components/         UI components (one folder per component)
  store/               Zustand stores — taskStore, calendarStore, trackerStore, routineStore,
                        noteStore, listStore, fitnessStore, scheduleStore, uiStore,
                        settingsStore, hotkeyOverridesStore, authStore, …
  services/
    supabase.ts        Supabase client
    sync/               Cloud sync layer (mappers + subscription-based sync service)
    taskCalendarBackfill.ts   One-time catch-up for tasks predating a schema change
  types/               Shared TypeScript types (index.ts, plus per-app files like lists.ts, notes.ts, fitness.ts)
  utils/               Date/timezone helpers, ID generators, colour utilities, hotkey binding parser
  config/               Label overrides, hotkey definitions, tracker/list/activity-type templates
supabase/
  migrations/          SQL schema, run in order in the Supabase SQL Editor
api/                   Vercel Edge Functions (Strava OAuth, Portfolio ticker data)
src-tauri/             Rust/Tauri desktop backend
android/                Capacitor-generated Android project (git-tracked; build artifacts gitignored)
docs/android/           Android architecture + phased build plan
```

---

## Roadmap

See [`BACKLOG.md`](BACKLOG.md) for the full requirements backlog and `CLAUDE.md` for
complete architecture/implementation detail on everything already built. Highlights of
what's still ahead:

- **Daily planner** — drag tasks into a timeline for the day, with time-intensity-aware slot suggestions
- **AI agent integration** — paste meeting notes → auto-generate tasks; voice control; custom agent endpoint
- **External calendar sync** — Google/Microsoft Calendar ingest (scoped, staged plan written, not yet built)
- **Android**: Records and Lists app sections, native push notifications, Play Billing/entitlements for the paid add-on apps, and touch support for the app's drag-and-drop features (List tabs, Notes tabs, Chronicle notebook nesting all currently rely on mouse-only HTML5 drag-and-drop)
- **Notes** cloud sync (currently localStorage-only), full-text search, inline passage tagging
- Habit streaks and a heatmap view for Records trackers
- Task dependencies/blocking, project-completion flow

---

## Name

*Organisaitor* — a life organiser with an AI agent at its core (eventually).
