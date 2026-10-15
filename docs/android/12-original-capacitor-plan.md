# Original Capacitor plan (2026-09)

*Moved verbatim from BACKLOG.md on 2026-10-14. Superseded for architecture by `00-architecture.md`, and for notifications by `05-notifications.md`; what is built is in `implementation-status.md`. Kept for its setup, file-manifest and build/release reference detail. The dark-mode steps it lists are built.*

> **Superseded for architecture decisions** by `docs/android/00-architecture.md` — that document
> is now the source of truth for the Android build (vehicle, entry points, monetization,
> entitlements) and reconciles this section with the Fitness app, Schedule feature, and the
> add-on-tier system, none of which existed when this section was first written. The
> notifications spec below (§6) is still materially correct and is being carried forward into
> `docs/android/05-notifications.md`; read it here until that file exists. Sections 1–5 and 7–8
> below (setup commands, file manifest, mobile layout, native polish, build/release) remain
> useful reference detail, just no longer the top-level architecture record.

### Vision

The existing Vite/React codebase compiles to both the Vercel PWA and a native Android app via Capacitor. A single Google Play Store listing ships the full Organisaitor suite with a mobile-optimised layout and native capabilities: local notifications, haptic feedback, status bar control, and Play Store distribution. All business logic, Zustand stores, Supabase sync, and entity types are shared without modification. The desktop will always ship more advanced configuration UX; mobile is optimised for consumption, quick-capture, and daily logging.

**Scope for Android MVP:** Full suite available (Tasks, Calendar, Records, Lists, Notes, Portfolio). Complex setup flows (building tracker field schemas, complex routine creation, Portfolio chart deep-dive) are accessible but not layout-optimised — that's acceptable. Notification system is the primary Android-native capability.

**Android-only indefinitely** — iOS is not in scope.

---

### 1. Prerequisites & One-time Setup

**System requirements:**
- Java 17+
- Android Studio (for SDK, emulator, release signing)
- Android SDK API level 23 minimum target; API 34+ as target SDK (Play Store requirement)

**Install Capacitor packages:**
```
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install @capacitor/local-notifications
npm install @capacitor/app
npm install @capacitor/status-bar
npm install @capacitor/splash-screen
npm install @capacitor/haptics
npm install @capacitor/keyboard
```

**Initialise Capacitor (one-time, run from project root):**
```
npx cap init "Organisaitor" "com.organisaitor.app" --web-dir dist
npx cap add android
```

The `android/` directory is committed to git. Add only build artifacts to `.gitignore`:
```
android/.gradle/
android/app/build/
android/build/
android/.idea/
```

**`capacitor.config.ts` (project root):**
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.organisaitor.app',
  appName: 'Organisaitor',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_launcher_foreground',
      iconColor: '#6366f1',
    },
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0f0f0f',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f0f0f',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
```

**`package.json` scripts to add:**
```json
"build:android": "npm run build && npx cap sync android",
"open:android": "npx cap open android",
"sync:android": "npx cap sync android"
```

---

### 2. New Files & Modified Files

**New files:**
```
capacitor.config.ts
android/                                    — generated Android project (git-tracked)
src/
  hooks/
    usePlatform.ts                          — platform detection
    useNotificationSync.ts                  — store-aware notification scheduler
  services/
    notifications/
      notificationService.ts               — schedule / cancel / sync logic
      notificationHelpers.ts               — ID hashing, payload builders
  utils/
    haptics.ts                             — guarded haptic wrappers
  styles/
    tokens.css                             — design tokens (see Dark Mode section)
  components/
    MobileNav/
      MobileNav.tsx                        — bottom tab bar
      MobileNav.module.css
    MobileMoreSheet/
      MobileMoreSheet.tsx                  — "More" bottom sheet (Lists, Portfolio, Settings)
      MobileMoreSheet.module.css
```

**Modified files:**
```
src/App.tsx                                — platform branch for nav/layout, theme effect, deep link listener
src/main.tsx                               — import tokens.css
index.html                                 — FOUC prevention script
src/store/settingsStore.ts                 — add theme, notification preferences
src/store/taskStore.ts                     — add reminderTime to Collection; bump to v6
src/components/NavSidebar/NavSidebar.tsx   — hide on Android
src/components/TaskPane/                   — full-screen on mobile
src/components/NoteEditorPane/             — full-screen on mobile
src/components/EditTrackerPane/            — full-screen on mobile
src/components/CalendarEventPane/          — full-screen on mobile
src/components/CalendarReminderPane/       — full-screen on mobile
src/components/SettingsPane/               — add Appearance section + Notifications section (Android-gated)
src/components/EditRoutinePane/ (if exists) or AddRoutineModal — add reminderTime field (Android-gated)
+ every *.module.css file                  — replace hardcoded colors with token variables
```

---

### 3. Platform Detection

**`src/hooks/usePlatform.ts`:**
```typescript
import { Capacitor } from '@capacitor/core';

export function usePlatform() {
  const platform = Capacitor.getPlatform();
  return {
    isAndroid: platform === 'android',
    isNative: Capacitor.isNativePlatform(),
    isWeb: platform === 'web',
  };
}
```

**Body class in App.tsx (applied once on mount):**
```typescript
useEffect(() => {
  if (Capacitor.getPlatform() === 'android') {
    document.body.classList.add('platform-android');
  }
}, []);
```

CSS modules can use `:global(.platform-android) .myClass { }` for Android-specific overrides in addition to `@media (max-width: 768px)` responsive breakpoints.

---

### 4. Mobile Layout System

#### 4a. App.tsx layout restructure

```tsx
const { isAndroid } = usePlatform();

return (
  <div className={cx(styles.app, isAndroid && styles.appMobile)}>
    {!isAndroid && <NavSidebar />}
    <main className={cx(styles.main, isAndroid && styles.mainMobile)}>
      {/* section content unchanged */}
    </main>
    {!isAndroid && <Sidebar />}       {/* right filter sidebar — hidden on mobile */}
    {isAndroid && <MobileNav />}
    {/* all modals and panes unchanged */}
  </div>
);
```

`.appMobile` / `.mainMobile`: removes left margin (no sidebar), adds `padding-bottom: calc(56px + env(safe-area-inset-bottom))` so content clears the bottom tab bar.

#### 4b. Bottom Tab Bar (MobileNav)

`position: fixed; bottom: 0; width: 100%; height: 56px`. Background: `var(--nav-bg)`. Top border: `1px solid var(--nav-border)`. Bottom padding: `env(safe-area-inset-bottom)` for Android gesture navigation.

Five tabs:

| Index | Label | Section key | Notes |
|-------|-------|-------------|-------|
| 0 | Tasks | `'tasks'` | |
| 1 | Calendar | `'calendar'` | |
| 2 | Records | `'records'` | |
| 3 | Notes | `'notes'` | |
| 4 | More | — | Opens MobileMoreSheet |

Active tab: icon + label in `var(--accent)`. Inactive: icon only (no label) in `var(--text-tertiary)`. Tapping the active tab scrolls current view to top (`window.scrollTo({ top: 0, behavior: 'smooth' })`).

Uses `useSettingsStore` / `uiStore.setActiveView` to switch sections — same action as NavSidebar.

#### 4c. MobileMoreSheet

Bottom sheet that slides up over a backdrop when "More" is tapped. Pattern: same overlay + sheet structure as existing modals (bottom-sheet on mobile). Contains:

- **Lists** — calls `setActiveView('lists')`, closes sheet
- **Portfolio** — calls `setActiveView('portfolio')`, closes sheet
- **Settings** — calls `openSettings()`, closes sheet
- **Account** — calls `openAccount()`, closes sheet

Backdrop tap and swipe-down dismiss the sheet. Escape key closes it (for stylus/keyboard users).

#### 4d. Slide-in panes → full-screen on mobile

All panes (TaskPane, NoteEditorPane, EditTrackerPane, CalendarEventPane, CalendarReminderPane, EditRoutinePane, SettingsPane, AccountPane) must become full-screen on Android.

In each pane's CSS module, add:
```css
@media (max-width: 768px) {
  .pane {
    width: 100% !important;
    height: 100%;
    top: 0;
    border-radius: 0;
  }
}
```

Or apply via `:global(.platform-android) .pane { }` if media query conflicts with existing fixed widths.

The × close button stays top-right. Back-button behaviour on Android: hook `@capacitor/app`'s `backButton` event to call the active pane's close action before defaulting to system back:

```typescript
App.addListener('backButton', () => {
  // check for open modals/panes in uiStore; close the topmost one
  // if nothing is open, allow default back (minimize app)
});
```

#### 4e. Section-specific layout notes

**Tasks:**
The right Sidebar (collection/purpose/tag filters) is hidden. Access via a filter icon (funnel) in the Tasks section header → opens a bottom sheet with the same filter controls. SortBar stays visible. Routines collapsible panel stays as-is.

**Calendar:**
- Month view: works at mobile widths; verify day cell tap targets ≥ 44px.
- Week view: show 3 columns (days) on phone (< 480px wide), 7 on tablet. Horizontal swipe to advance days. The 7-column layout can use `overflow-x: auto` with snap scrolling as a simpler alternative.
- Day view: single-column timeline; no layout changes needed.
- View toggle (Month/Week/Day) moves into the section header on mobile.

**Records:**
Left tracker/routine sidebar is replaced by a header-level picker: a dropdown or horizontally scrollable chip list showing the user's trackers and routines. Selecting one sets `activeTrackerId`. Tracker detail fills full width. RoutineChecklist cards stack vertically (already card-based; no change needed). AddEntry FAB stays.

**Notes:**
ChronicleView tag tree becomes drill-down navigation: tapping an area shows its children full-screen (back button to go up). Breadcrumb stays in the header. NoteEditorPane is full-screen — stylus input works natively in the WebView textarea with no additional code.

**Lists:**
Left sidebar → header picker (same approach as Records). Card grid → 1 column on phone (`grid-template-columns: 1fr`).

**Portfolio:**
WatchlistView table → `overflow-x: auto` (horizontal scroll). Reduce default visible columns on phone to: Name, Price, Daily Change %. Column picker button remains accessible. Chart view → chart fills full width; right sidebar (tickers list) hidden behind a toggle button tap. This section is read-heavy on mobile; complex configuration stays functional but is not layout-optimised.

---

### 5. Native Polish

#### StatusBar

Sync with active theme in the theme effect (App.tsx):
```typescript
import { StatusBar, Style } from '@capacitor/status-bar';

if (isAndroid) {
  const isDark = /* resolved theme === 'dark' */;
  await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
  await StatusBar.setBackgroundColor({ color: isDark ? '#0f0f0f' : '#ffffff' });
}
```

#### SplashScreen

Hide after app finishes initial data hydration:
```typescript
import { SplashScreen } from '@capacitor/splash-screen';
// In App.tsx, after stores are hydrated from localStorage:
if (isAndroid) await SplashScreen.hide();
```

#### Haptics (`src/utils/haptics.ts`)

```typescript
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

const native = () => Capacitor.isNativePlatform();

export const hapticLight   = () => native() && Haptics.impact({ style: ImpactStyle.Light });
export const hapticMedium  = () => native() && Haptics.impact({ style: ImpactStyle.Medium });
export const hapticSuccess = () => native() && Haptics.notification({ type: NotificationType.Success });
export const hapticWarning = () => native() && Haptics.notification({ type: NotificationType.Warning });
```

Wire `hapticLight()` to: task completion toggle, routine step toggle, list item status toggle, any checkbox-style interaction. Wire `hapticMedium()` to destructive confirmations (delete task, delete tracker entry). Wire `hapticSuccess()` to completing a full routine.

#### Keyboard

Config in `capacitor.config.ts` (`resize: 'body'`) handles most cases automatically. For NoteEditorPane (full-screen editor), optionally listen for `keyboardDidShow` to add bottom padding equal to `info.keyboardHeight` so the editor content clears the keyboard.

#### App icon

Generate using Android Studio's Image Asset Studio (right-click `res/` → New → Image Asset). Source: a single 1024×1024 PNG of the Organisaitor icon. This auto-generates all required `mipmap-*` density directories. The launcher icon must be a `.png` placed at `android/app/src/main/res/mipmap-*/ic_launcher.png`.

---

### 6. Notifications

#### 6a. Permissions

Request on first meaningful interaction (not cold open). Show an explainer first, then:

```typescript
import { LocalNotifications } from '@capacitor/local-notifications';

export async function requestNotificationPermission(): Promise<boolean> {
  const { display } = await LocalNotifications.requestPermissions();
  return display === 'granted';
}
```

Store result in `settingsStore.notificationsEnabled`. If denied: show a nudge in the Notifications settings section — "Open Android Settings to enable notifications." with a button that calls `NativeSettings.open()` (or `@capacitor/app`'s `openUrl` with the settings intent).

All `LocalNotifications` calls must be wrapped in `if (!Capacitor.isNativePlatform()) return` — the plugin is a no-op on web but may log warnings if called unguarded.

#### 6b. settingsStore additions

```typescript
notificationsEnabled: boolean;             // master switch; default false until granted
notifTaskDeadlines: boolean;              // default true
notifCalendarEvents: boolean;             // default true
notifCalendarEventMinutesBefore: number;  // 15 | 30 | 60 | 1440; default 30
notifRoutineReminders: boolean;           // default true
notifRoutineDefaultTime: string;          // HH:MM; default '20:00'
notifWaitingTaskOverdue: boolean;         // default true
```

**Per-routine reminder time:** add `reminderTime: string | null` (HH:MM) to the `Collection` interface (in `src/types/index.ts`). `null` means use `settingsStore.notifRoutineDefaultTime`. This requires a **taskStore migration to v6**: backfill `reminderTime: null` on all existing collections.

#### 6c. Notification ID strategy

Capacitor local notification IDs are 32-bit positive integers. Derive a stable ID from entity ID + notification kind using a djb2-variant hash:

```typescript
// src/services/notifications/notificationHelpers.ts
export type NotifKind =
  | 'task-deadline'
  | 'calendar-event'
  | 'calendar-reminder'
  | 'routine-logging'
  | 'waiting-task-overdue';

export function notifId(entityId: string, kind: NotifKind, suffix = 0): number {
  let hash = 5381;
  const str = `${kind}:${entityId}:${suffix}`;
  for (let i = 0; i < str.length; i++) {
    hash = (((hash << 5) + hash) ^ str.charCodeAt(i)) >>> 0;
  }
  return (hash % 2_000_000_000) + 1;
}
```

For routine logging notifications (one per scheduled day-of-week), call `notifId(routineId, 'routine-logging', dayOfWeek)` for `suffix` values 0–6. Reserve 7 IDs per routine.

#### 6d. Notification triggers per entity type

**Task deadlines (`notifTaskDeadlines`):**
- Condition: task has `deadline` set AND `completedAt === null`
- Schedule: 09:00 on the deadline date (one-shot)
- Title: `"Task due today"` / Body: `task.title`
- Cancel on: task completed, deadline removed, task deleted
- Skip if deadline is in the past

**Calendar events (`notifCalendarEvents`):**
- Condition: CalendarEvent with a date/time
- Schedule: `notifCalendarEventMinutesBefore` minutes before event start
- Title: `"Upcoming event"` / Body: `event.title`
- Recurring events: schedule the next 12 occurrences only (re-schedule on each app open)
- Cancel and reschedule on edit; cancel on delete

**Calendar reminders (`notifCalendarEvents`):**
- CalendarReminder entities already have a specific time — schedule at that time
- Title: reminder title / Body: blank or notes if present
- Same 12-occurrence limit for recurring reminders

**Routine logging reminders (`notifRoutineReminders`):**
- Per routine with `kind === 'routine'`
- Days: `repeatConfig.daysOfWeek` (or every day if empty/undefined)
- Time: `routine.reminderTime ?? settings.notifRoutineDefaultTime`
- Scheduling approach: on each app open, for each active routine, schedule the next 4 occurrences of each due day-of-week. Cancel all existing routine notifs for that routine first, then reschedule. This keeps notifications fresh without requiring always-on background processes.
- Title: `"Routine reminder"` / Body: `"Time to log ${routine.name}"`
- Cancel all (7 possible IDs) on routine deleted

**Waiting task overdue (`notifWaitingTaskOverdue`):**
- Condition: task with `kind === 'waiting'` AND `deadline` set
- Schedule: 09:00 on the deadline date
- Title: `"Waiting task overdue"` / Body: `"Follow up: ${task.title}"`
- Cancel on: task completed, deadline changed (reschedule), task deleted

#### 6e. Notification service (`src/services/notifications/notificationService.ts`)

Exports the following functions (all guarded with `if (!Capacitor.isNativePlatform()) return`):

```typescript
scheduleTaskDeadlineNotif(task: Task, settings: SettingsState): Promise<void>
cancelTaskDeadlineNotif(taskId: TaskId): Promise<void>

scheduleCalendarEventNotif(event: CalendarEvent, settings: SettingsState): Promise<void>
cancelCalendarEventNotif(eventId: CalendarEventId): Promise<void>

scheduleCalendarReminderNotif(reminder: CalendarReminder): Promise<void>
cancelCalendarReminderNotif(reminderId: CalendarReminderId): Promise<void>

scheduleRoutineNotifs(routine: Collection, settings: SettingsState): Promise<void>
cancelRoutineNotifs(routineId: CollectionId): Promise<void>

// Full sync — called on app start. Diffs pending notifs against store state.
syncAllNotifications(
  tasks: Task[],
  calEvents: CalendarEvent[],
  calReminders: CalendarReminder[],
  routines: Collection[],
  settings: SettingsState
): Promise<void>
```

`syncAllNotifications` implementation:
1. Call `LocalNotifications.getPending()` to get currently scheduled IDs.
2. Compute the full set of IDs that *should* be scheduled given current store state.
3. Cancel IDs that are scheduled but should not be (stale from deleted/completed entities).
4. Schedule IDs that should be but are not yet scheduled.
This ensures correctness after Supabase sync brings in changes made on desktop.

Notification payloads include `extra: { url: string }` for deep linking (see section 6g).

#### 6f. useNotificationSync hook (`src/hooks/useNotificationSync.ts`)

Mounted once in App.tsx, Android-only. Runs a full sync on mount (after stores hydrate from localStorage), then handles incremental updates by calling individual schedule/cancel functions when specific entities change.

```typescript
export function useNotificationSync() {
  const { isAndroid } = usePlatform();
  const settings = useSettingsStore();

  useEffect(() => {
    if (!isAndroid || !settings.notificationsEnabled) return;
    const tasks = Object.values(useTaskStore.getState().tasks);
    const events = useTaskStore.getState().calendarEvents;
    const reminders = useTaskStore.getState().calendarReminders;
    const routines = Object.values(useTaskStore.getState().collections)
      .filter(c => c.kind === 'routine');
    syncAllNotifications(tasks, events, reminders, routines, settings);
  }, []); // full sync on mount only
}
```

For incremental updates, existing store actions (completeTask, deleteTask, updateCollection, etc.) call the appropriate schedule/cancel function after mutating state. Keep these calls in App.tsx or a thin wrapper around the store actions — do not import the notification service inside the Zustand store itself (keep stores platform-agnostic).

#### 6g. Deep linking from notification tap

When a notification is tapped and the app opens, navigate to the relevant entity. Notification `extra` field carries a URL:

- Task: `organisaitor://tasks/{taskId}`
- Calendar event: `organisaitor://calendar/{eventId}`
- Calendar reminder: `organisaitor://calendar/{reminderId}`
- Routine: `organisaitor://records/{routineId}`

URL scheme `organisaitor://` must be registered in `android/app/src/main/AndroidManifest.xml` via an `<intent-filter>` — Capacitor's `@capacitor/app` plugin handles the boilerplate when correctly configured. Refer to Capacitor `appUrlOpen` docs for the exact manifest entry.

In App.tsx:
```typescript
import { App as CapApp } from '@capacitor/app';

useEffect(() => {
  if (!isAndroid) return;
  const handle = CapApp.addListener('appUrlOpen', ({ url }) => {
    try {
      const u = new URL(url);
      const [, section, id] = u.pathname.split('/');
      if (section === 'tasks' && id) {
        setActiveView('tasks');
        openTaskPane(id as TaskId);
      } else if (section === 'calendar' && id) {
        setActiveView('calendar');
        openCalendarEventPane(id as CalendarEventId);
      } else if (section === 'records' && id) {
        setActiveView('records');
        setActiveTracker(id);
      }
    } catch {}
  });
  return () => { handle.then(l => l.remove()); };
}, []);
```

#### 6h. Notifications section in SettingsPane

Visible only on Android (`isAndroid`). Controls:

- **Master toggle** — "Enable notifications". On toggle-on, calls `requestNotificationPermission()`. If granted, sets `notificationsEnabled: true`. If denied, shows inline message directing user to Android Settings.
- **Task deadlines** — toggle `notifTaskDeadlines`
- **Calendar events** — toggle `notifCalendarEvents` + inline picker for minutes before (options: 15 min, 30 min, 1 hour, Day before)
- **Routine reminders** — toggle `notifRoutineReminders` + time picker for `notifRoutineDefaultTime` (HH:MM)
- **Waiting task follow-up** — toggle `notifWaitingTaskOverdue`

**Per-routine reminder time:** In EditRoutinePane (or wherever routines are edited), add a "Custom reminder time" field (`reminderTime` on Collection) visible only on Android. Shows a time picker; "Default" option sets it back to `null`.

---

### 7. Build & Release

#### Development workflow

```bash
npm run build:android    # Vite build + cap sync
npx cap open android     # open Android Studio
```

For live-reload during dev, temporarily add to `capacitor.config.ts` (do NOT commit):
```typescript
server: { url: 'http://YOUR_LOCAL_IP:5173', cleartext: true }
```

#### Release build

1. In Android Studio: Build → Generate Signed Bundle/APK → **Android App Bundle (.aab)** (required for Play Store).
2. Create a signing keystore one-time:
   ```
   keytool -genkey -v -keystore organisaitor.jks -alias organisaitor -keyalg RSA -keysize 2048 -validity 10000
   ```
3. Store the `.jks` file and its passwords **outside the git repo** (e.g. a password manager or secrets manager).
4. Configure signing in `android/app/build.gradle` using environment variables for CI safety.

#### Play Store setup

- Google Play Console account ($25 one-time fee).
- Upload `.aab` to **Internal Testing** track first; promote to Production after verification.
- Required assets: app icon (512×512 PNG), feature graphic (1024×500 PNG), ≥2 screenshots per form factor.
- App ID `com.organisaitor.app` is permanent — cannot be changed after first publish.
- Target SDK: API 34+ (Play Store requirement as of 2024).
- Privacy policy required (Supabase auth collects email address; host a simple policy page and link it in the Play Console listing).

---

### 8. Implementation order (for agent)

Complete dark mode first (steps 1–6) — it benefits desktop immediately and is a prerequisite for the Android StatusBar integration.

1. Create `src/styles/tokens.css` with full token set.
2. Import `tokens.css` in `src/main.tsx`.
3. Add `theme` to `settingsStore` + migration; set Android default to `'dark'`.
4. Add theme effect + StatusBar sync to `App.tsx`; add FOUC script to `index.html`.
5. Add Appearance section to `SettingsPane` (desktop immediately usable).
6. Audit and migrate all `*.module.css` files — replace every hardcoded color with tokens. Run the grep command in section 4 of Dark Mode to find them all.
7. Install Capacitor packages; run `cap init` + `cap add android`.
8. Create `capacitor.config.ts`.
9. Create `src/hooks/usePlatform.ts`; add body class in `App.tsx`.
10. Create `MobileNav` component (bottom tab bar).
11. Create `MobileMoreSheet`.
12. Modify `App.tsx` for platform layout branching (hide NavSidebar/Sidebar, show MobileNav).
13. Make all slide-in panes full-screen on mobile (CSS).
14. Wire Android back button via `@capacitor/app` `backButton` listener.
15. Section-specific layout passes: Tasks filter sheet, Records/Lists header picker, Calendar week view responsive, Portfolio horizontal scroll.
16. Create `src/utils/haptics.ts`; wire haptic calls to task/routine/list completion actions.
17. StatusBar + SplashScreen integration (already configured, add hide() call).
18. Add `reminderTime: string | null` to `Collection` type in `src/types/index.ts`; bump taskStore to v6 with migration.
19. Add notification preference fields to `settingsStore`.
20. Build `notificationHelpers.ts` (ID hashing, payload builders).
21. Build `notificationService.ts` (schedule/cancel/sync functions).
22. Build `useNotificationSync.ts`; mount in `App.tsx` (Android-gated).
23. Wire incremental schedule/cancel calls at task/calendar/routine action sites.
24. Wire deep linking: `appUrlOpen` listener in `App.tsx`; add `extra.url` to notification payloads.
25. Add Notifications section to `SettingsPane` (Android-gated); add per-routine reminder time to EditRoutinePane (Android-gated).
26. Generate app icon via Android Studio Image Asset Studio.
27. Test end-to-end on Android emulator API 34: all notification types fire correctly, deep links navigate correctly, theme switching works, all sections accessible and usable.
28. Create signing keystore; build release `.aab`; upload to Play Store Internal Testing.
