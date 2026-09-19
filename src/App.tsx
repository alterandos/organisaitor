import { useRef, useEffect, lazy, Suspense } from 'react';
import type React from 'react';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { supabase, isSupabaseConfigured } from '@/services/supabase';
import { openExternalLink } from '@/utils/links';
import { usePlatform } from '@/hooks/usePlatform';
import { useAuthStore } from '@/store/authStore';
import { initSync, stopSync } from '@/services/sync/syncService';
import { checkVaultStatus, resetVaultModuleState } from '@/services/vault';
import { initNoteSecretsSync } from '@/services/noteSecretsSync';
import { initListSecretsSync } from '@/services/listSecretsSync';
import { DecryptPrompt } from '@/components/DecryptPrompt/DecryptPrompt';
import { backfillTaskCalendarLinks } from '@/services/taskCalendarBackfill';
import { syncGoogleCalendars } from '@/services/googleCalendar';
import { matchesHotkeyId } from '@/store/hotkeyOverridesStore';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { AccountPane } from '@/components/AccountPane/AccountPane';
import { TaskList } from '@/components/TaskList/TaskList';
import { QuickAddInput } from '@/components/QuickAddInput/QuickAddInput';
import { MobileQuickAddBar } from '@/components/MobileQuickAddBar/MobileQuickAddBar';
import { MobileCalendarQuickAdd } from '@/components/MobileCalendarQuickAdd/MobileCalendarQuickAdd';
import { AddTaskButton } from '@/components/AddTaskButton/AddTaskButton';
import { CollectionFilterPicker } from '@/components/CollectionPicker/CollectionFilterPicker';
import { SortBar } from '@/components/SortBar/SortBar';
import { PurposeFilterPicker } from '@/components/PurposeFilterPicker/PurposeFilterPicker';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { NavSidebar } from '@/components/NavSidebar/NavSidebar';
import { MobileNav } from '@/components/MobileNav/MobileNav';
import { MobileMoreSheet } from '@/components/MobileMoreSheet/MobileMoreSheet';
import { CalendarView } from '@/components/CalendarView/CalendarView';
import { RecordsView } from '@/components/RecordsView/RecordsView';
import { NotesSection } from '@/components/NotesSection/NotesSection';
import { ListsSection } from '@/components/ListsSection/ListsSection';
import { AddActivityModal } from '@/components/AddActivityModal/AddActivityModal';
import { EditActivityTypeModal } from '@/components/EditActivityTypeModal/EditActivityTypeModal';
import { AddScheduleModal } from '@/components/AddScheduleModal/AddScheduleModal';
import { AddListModal } from '@/components/AddListModal/AddListModal';
import { AddListItemModal } from '@/components/AddListItemModal/AddListItemModal';
import { AddWatchlistItemModal } from '@/components/AddWatchlistItemModal/AddWatchlistItemModal';
import { BulkUploadWatchlistModal } from '@/components/BulkUploadWatchlistModal/BulkUploadWatchlistModal';
import { AddPortfolioTagModal } from '@/components/AddPortfolioTagModal/AddPortfolioTagModal';
import { AddInvestmentPurposeModal } from '@/components/AddInvestmentPurposeModal/AddInvestmentPurposeModal';
import { TaskPane } from '@/components/TaskPane/TaskPane';
import { SettingsPane } from '@/components/SettingsPane/SettingsPane';
import { ManagePane } from '@/components/ManagePane/ManagePane';
import { CalendarEventPane } from '@/components/CalendarEventPane/CalendarEventPane';
import { CalendarReminderPane } from '@/components/CalendarReminderPane/CalendarReminderPane';
import { AddTaskModal } from '@/components/AddTaskModal/AddTaskModal';
import { AddCollectionModal } from '@/components/AddCollectionModal/AddCollectionModal';
import { AddPurposeModal } from '@/components/AddPurposeModal/AddPurposeModal';
import { AddTagModal } from '@/components/AddTagModal/AddTagModal';
import { AddCalendarItemModal } from '@/components/AddCalendarItemModal/AddCalendarItemModal';
import { AddTrackerModal } from '@/components/AddTrackerModal/AddTrackerModal';
import { AddEntryModal } from '@/components/AddEntryModal/AddEntryModal';
import { EditTrackerPane } from '@/components/EditTrackerPane/EditTrackerPane';
import { EditRoutinePane } from '@/components/EditRoutinePane/EditRoutinePane';
import { AddRoutineModal } from '@/components/AddRoutineModal/AddRoutineModal';
import { IntegrationsPane } from '@/components/IntegrationsPane/IntegrationsPane';
import { NotificationCenter } from '@/components/NotificationCenter/NotificationCenter';
import { LinkHoverPreview } from '@/components/LinkHoverPreview/LinkHoverPreview';
import { QuickAccessPane } from '@/components/QuickAccessPane/QuickAccessPane';
import { AddNoteModal } from '@/components/AddNoteModal/AddNoteModal';
import { AddNoteTagModal } from '@/components/AddNoteTagModal/AddNoteTagModal';
import { NoteTagPresetModal } from '@/components/NoteTagPresetModal/NoteTagPresetModal';
import { EditNoteMetaModal } from '@/components/EditNoteMetaModal/EditNoteMetaModal';
import { NoteEditorPane } from '@/components/NoteEditorPane/NoteEditorPane';
import { useNotificationChecker } from '@/hooks/useNotificationChecker';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore, selectActiveCollectionId, closeTopmostMobileOverlay } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { hexToRgba } from '@/utils/color';
import { getOrderedEndeavours } from '@/utils/collections';
import { isAppEnabled } from '@/config/apps';
import type { CollectionId } from '@/types';
import styles from './App.module.css';

// Add-on apps (Portfolio, Fitness) are code-split from the core bundle — their code
// only downloads when a user actually navigates to them. Core sections (Tasks,
// Calendar, Records, Lists, Notes) stay eagerly bundled since every user has them.
const PortfolioSection = lazy(() =>
  import('@/components/PortfolioSection/PortfolioSection').then((m) => ({ default: m.PortfolioSection }))
);
const FitnessSection = lazy(() =>
  import('@/components/FitnessSection/FitnessSection').then((m) => ({ default: m.FitnessSection }))
);

function AppSectionFallback() {
  return <div className={styles.sectionLoading}>Loading…</div>;
}

export default function App() {
  const { isAndroid } = usePlatform();
  const openAccount                = useUIStore((s) => s.openAccount);
  const closeAccount               = useUIStore((s) => s.closeAccount);
  const accountOpen                = useUIStore((s) => s.accountOpen);
  const openModal                  = useUIStore((s) => s.openModal);
  const editingTaskId              = useUIStore((s) => s.editingTaskId);
  const activeCollectionId         = useUIStore(selectActiveCollectionId);
  const endeavourPickerOpen        = useUIStore((s) => s.endeavourPickerOpen);
  const toggleEndeavourPicker      = useUIStore((s) => s.toggleEndeavourPicker);
  const closeEndeavourPicker       = useUIStore((s) => s.closeEndeavourPicker);
  const setActiveCollection        = useUIStore((s) => s.setActiveCollection);
  const togglePurposePicker        = useUIStore((s) => s.togglePurposePicker);
  const toggleManage               = useUIStore((s) => s.toggleManage);
  const settingsOpen               = useUIStore((s) => s.settingsOpen);
  const openSidebar                = useUIStore((s) => s.openSidebar);
  const closeSidebar               = useUIStore((s) => s.closeSidebar);
  const openSettings               = useUIStore((s) => s.openSettings);
  const closeSettings              = useUIStore((s) => s.closeSettings);
  const activeView                 = useUIStore((s) => s.activeView);
  const editingCalendarEventId     = useUIStore((s) => s.editingCalendarEventId);
  const editingCalendarReminderId  = useUIStore((s) => s.editingCalendarReminderId);
  const integrationsOpen           = useUIStore((s) => s.integrationsOpen);
  const editTrackerOpen            = useUIStore((s) => s.editTrackerOpen);
  const editRoutineOpen            = useUIStore((s) => s.editRoutineOpen);
  const editingWatchlistItemId     = useUIStore((s) => s.editingWatchlistItemId);
  const portfolioChartOpen         = useUIStore((s) => s.portfolioChartOpen);
  const editingNoteId              = useUIStore((s) => s.editingNoteId);
  const quickAccessOpen            = useUIStore((s) => s.quickAccessOpen);
  const decryptPrompt              = useUIStore((s) => s.decryptPrompt);
  const toggleQuickAccess          = useUIStore((s) => s.toggleQuickAccess);
  const collectionsRecord          = useTaskStore((s) => s.collections);
  const colorEnabled               = useSettingsStore((s) => s.colorEnabled);
  const setChartTickerRowZoom      = useSettingsStore((s) => s.setChartTickerRowZoom);
  const chartTickerRowZoom         = useSettingsStore((s) => s.chartTickerRowZoom);
  const theme                      = useSettingsStore((s) => s.theme);
  const nudgeNoteEditorZoom        = useSettingsStore((s) => s.nudgeNoteEditorZoom);

  // Idempotent catch-up pass for pre-existing deadline/scheduled tasks — see
  // taskCalendarBackfill.ts. Stores rehydrate synchronously from localStorage on module
  // load (see the SplashScreen effect below for the same observation), so this is safe
  // to run unconditionally on mount, every mount.
  useEffect(() => {
    backfillTaskCalendarLinks();
  }, []);

  useEffect(() => {
    const apply = (dark: boolean) => {
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      if (isAndroid) {
        void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
        void StatusBar.setBackgroundColor({ color: dark ? '#0f0f0f' : '#ffffff' });
      }
    };

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches);
      const handler = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      apply(theme === 'dark');
    }
  }, [theme, isAndroid]);

  useEffect(() => {
    if (!isAndroid) return;
    document.body.classList.add('platform-android');
    // Stores hydrate synchronously from localStorage on module load, so by the time this
    // effect runs (after first paint) there's nothing further to wait on.
    void SplashScreen.hide();
  }, [isAndroid]);

  useEffect(() => {
    if (!isAndroid) return;
    const handle = CapApp.addListener('backButton', () => {
      if (closeTopmostMobileOverlay()) return;
      const { mobileBackConsumer, sectionHistory, navigateBack } = useUIStore.getState();
      if (mobileBackConsumer?.()) return;
      if (sectionHistory.length > 0) { navigateBack(); return; }
      void CapApp.minimizeApp();
    });
    return () => { void handle.then((l) => l.remove()); };
  }, [isAndroid]);

  useEffect(() => {
    // Tauri's webview doesn't act on <a target="_blank">/window.open() for external URLs —
    // there's no OS browser tab to hand off to without the opener plugin, so links across
    // the whole app (task link pills, list items, calendar events, etc.) silently did
    // nothing when running as the desktop app. Android's WebView has the same problem for
    // the same reason. One capture-phase listener here covers every existing/future
    // `target="_blank"` link instead of patching each render site.
    // Excludes the Notes editor (`.ProseMirror`, Tiptap's own stable root class): it
    // already opens its links itself (needed anyway to distinguish plain click from
    // Ctrl+click-to-select), and clicks on an anchor inside contenteditable don't
    // trigger the browser's native navigation — so without this exclusion, a click
    // there would be handled twice (once by the editor, once by this listener).
    if (!isAndroid && !('__TAURI_INTERNALS__' in window)) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[target="_blank"]') as HTMLAnchorElement | null;
      if (!anchor?.href || anchor.closest('.ProseMirror')) return;
      e.preventDefault();
      e.stopPropagation();
      openExternalLink(anchor.href);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [isAndroid]);

  useNotificationChecker();
  useEffect(() => { initNoteSecretsSync(); initListSecretsSync(); }, []);

  const setSession = useAuthStore((s) => s.setSession);
  const authUserId = useAuthStore((s) => s.user?.id ?? null);

  const handlePullRefresh = () => {
    if (!isSupabaseConfigured || !authUserId) return;
    return initSync(authUserId);
  };
  const { ref: taskScrollRef, distance: pullDistance, refreshing: pullRefreshing } =
    usePullToRefresh<HTMLElement>(handlePullRefresh, isAndroid);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) { initSync(session.user.id); checkVaultStatus(session.user.id); }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_IN'  && session) { initSync(session.user.id); checkVaultStatus(session.user.id); }
      if (event === 'SIGNED_OUT')             { stopSync(); resetVaultModuleState(); }
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHoverOpen = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    openSidebar();
  };
  const handleHoverClose = () => {
    closeTimerRef.current = setTimeout(closeSidebar, 250);
  };

  const setActiveView    = useUIStore((s) => s.setActiveView);
  const navigateBack     = useUIStore((s) => s.navigateBack);
  const navigateForward  = useUIStore((s) => s.navigateForward);
  const taskViewMode     = useUIStore((s) => s.taskViewMode);
  const setTaskViewMode  = useUIStore((s) => s.setTaskViewMode);

  useEffect(() => {
    // Strava's OAuth redirect lands on bare "/" (no section context survives a full page
    // navigation) — jump straight to Fitness so the connected/error message is visible
    // without the user having to know to go find it.
    if (new URLSearchParams(window.location.search).has('strava') && isAppEnabled('fitness')) {
      setActiveView('fitness');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSchedules   = useUIStore((s) => s.openSchedules);
  const toggleSchedules = useUIStore((s) => s.toggleSchedules);
  const schedulesOpen   = useUIStore((s) => s.schedulesOpen);
  useEffect(() => {
    // Google's OAuth redirect lands on bare "/" too (same reasoning as Strava's above) —
    // jump to Calendar and open the side pane's "Imported calendars" section so the
    // connected/error state is immediately visible.
    if (new URLSearchParams(window.location.search).has('googleCalendar')) {
      setActiveView('calendar');
      openSchedules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Syncs connected Google calendars while the app is open — on load/sign-in, then every
  // 15 minutes. No server-side cron: this app has no service-role Supabase credential
  // anywhere, and this keeps it that way (see CLAUDE.md "External calendar sync"). A no-op
  // if there's no session or no connections (syncGoogleCalendars checks both internally).
  useEffect(() => {
    if (!isSupabaseConfigured || !authUserId) return;
    void syncGoogleCalendars();
    const id = setInterval(() => { void syncGoogleCalendars(); }, 15 * 60_000);
    return () => clearInterval(id);
  }, [authUserId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Notes editor zoom — must fire before isTyping guard (editor is contentEditable)
      // !e.shiftKey prevents Ctrl+Shift+= (superscript) and Ctrl+Shift+- (subscript) from also zooming
      if (activeView === 'notes' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        if (e.key === '-') { e.preventDefault(); nudgeNoteEditorZoom(-0.1); return; }
        if (e.key === '=') { e.preventDefault(); nudgeNoteEditorZoom(0.1); return; }
      }

      // Don't fire when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (e.target as HTMLElement)?.isContentEditable;
      if (isTyping) return;

      // Endeavour filter: while expanded, 0-9 select (0 = All) and Escape closes.
      // Takes over the keyboard entirely until closed, so this must run before the
      // digit-based section-switch hotkeys below.
      if (endeavourPickerOpen) {
        if (e.key === 'Escape') { e.preventDefault(); closeEndeavourPicker(); return; }
        if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          if (e.key === '0') {
            setActiveCollection(null);
          } else {
            const ordered = getOrderedEndeavours(collectionsRecord);
            const chosen  = ordered[Number(e.key) - 1];
            if (chosen) setActiveCollection(chosen.id);
          }
          closeEndeavourPicker();
        }
        return;
      }

      // Section-switch, and most global Actions, hotkeys are user-customizable (see
      // SettingsPane's "Keyboard shortcuts" section, hotkeyOverridesStore) — matchesHotkeyId
      // resolves each id's effective binding (an override if set, else the hotkeys.ts
      // default) and checks it against this event. Everything below behaves identically to
      // before customization existed as long as nothing has actually been rebound.
      if (matchesHotkeyId(e, 'action-back')) {
        e.preventDefault();
        navigateBack();
        return;
      }

      if (matchesHotkeyId(e, 'action-forward')) {
        e.preventDefault();
        navigateForward();
        return;
      }

      if (matchesHotkeyId(e, 'action-quick-access')) {
        e.preventDefault();
        toggleQuickAccess();
        return;
      }

      if (matchesHotkeyId(e, 'nav-tasks'))     { e.preventDefault(); setActiveView('tasks');     return; }
      if (matchesHotkeyId(e, 'nav-calendar'))  { e.preventDefault(); setActiveView('calendar');  return; }
      if (matchesHotkeyId(e, 'nav-records'))   { e.preventDefault(); setActiveView('records');   return; }
      if (matchesHotkeyId(e, 'nav-lists'))     { e.preventDefault(); setActiveView('lists');     return; }
      if (matchesHotkeyId(e, 'nav-notes'))     { e.preventDefault(); setActiveView('notes');     return; }
      if (matchesHotkeyId(e, 'nav-portfolio')) { if (isAppEnabled('portfolio')) { e.preventDefault(); setActiveView('portfolio'); } return; }
      if (matchesHotkeyId(e, 'nav-fitness'))   { if (isAppEnabled('fitness'))   { e.preventDefault(); setActiveView('fitness');   } return; }

      if (matchesHotkeyId(e, 'action-settings')) {
        e.preventDefault();
        if (settingsOpen) closeSettings(); else openSettings();
        return;
      }

      if (matchesHotkeyId(e, 'action-account')) {
        e.preventDefault();
        if (accountOpen) closeAccount(); else openAccount();
        return;
      }

      if (matchesHotkeyId(e, 'action-endeavour')) {
        if (activeView !== 'portfolio' && activeView !== 'lists' && activeView !== 'fitness') { e.preventDefault(); toggleEndeavourPicker(); }
        return;
      }

      if (matchesHotkeyId(e, 'action-purpose')) {
        if (activeView === 'tasks') { e.preventDefault(); togglePurposePicker(); }
        return;
      }

      if (matchesHotkeyId(e, 'action-manage')) {
        e.preventDefault();
        toggleManage();
        return;
      }


      if (portfolioChartOpen && e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === '-') { e.preventDefault(); setChartTickerRowZoom(chartTickerRowZoom - 0.1); return; }
        if (e.key === '=' || e.key === '+') { e.preventDefault(); setChartTickerRowZoom(chartTickerRowZoom + 0.1); return; }
      }

      // Ctrl+N is a permanent bonus alias for "New item" — not itself a customizable slot,
      // since hotkeys.ts has only ever documented it as "N / Space — Ctrl+N also works"
      // rather than a real third binding.
      const isNewItem = matchesHotkeyId(e, 'action-new-item')
                     || (e.key.toUpperCase() === 'N' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey);
      if (isNewItem) {
        e.preventDefault();
        const { showAddTask, showAddCalendarItem, showAddTracker, showAddEntry, showAddWatchlistItem, showAddList, showAddListItem, showAddNote, showAddActivity, activeTrackerId: tid, activeRoutineId: rid, activeListId: lid } = useUIStore.getState();
        if (activeView === 'calendar') showAddCalendarItem();
        else if (activeView === 'portfolio') showAddWatchlistItem();
        else if (activeView === 'lists') { if (lid) showAddListItem(lid); else showAddList(); }
        else if (activeView === 'notes') showAddNote();
        else if (activeView === 'fitness') showAddActivity();
        else if (activeView === 'records') {
          if (tid) showAddEntry(tid);
          else if (rid) showAddEntry(rid);
          else showAddTracker();
        } else showAddTask();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    setActiveView, activeView, settingsOpen, openSettings, closeSettings,
    accountOpen, openAccount, closeAccount,
    portfolioChartOpen, chartTickerRowZoom, setChartTickerRowZoom, openModal, nudgeNoteEditorZoom,
    endeavourPickerOpen, toggleEndeavourPicker, closeEndeavourPicker, setActiveCollection, collectionsRecord,
    togglePurposePicker, toggleManage, navigateBack, navigateForward, toggleQuickAccess,
  ]);

  const activeCollection = activeCollectionId
    ? collectionsRecord[activeCollectionId as CollectionId]
    : null;
  const headerStyle: React.CSSProperties = (() => {
    if (activeView === 'portfolio') return {};
    if (!activeCollection?.color) return {};
    const c = activeCollection.color;
    const style: React.CSSProperties = {
      boxShadow: `inset 0 -2px 0 ${c}, 0 1px 3px rgba(0,0,0,0.06), 0 4px 14px ${hexToRgba(c, 0.2)}`,
    };
    if (colorEnabled) style.background = hexToRgba(c, 0.12);
    return style;
  })();

  return (
    <div className={styles.shell}>
      {!isAndroid && <NavSidebar />}

      <div className={`${styles.app} ${isAndroid ? styles.appMobile : ''}`}>
        <header className={styles.header} style={headerStyle}>
          <div className={styles.headerLeft}>
            {!isAndroid && (
              // On Calendar, this hamburger has a different job: rather than the generic
              // Endeavours/Purposes/Tags hover Sidebar every other section shows, it opens
              // CalendarSidePane (Layers/Schedules/Imported calendars/Go-to-date) — a
              // click, not a hover, since that pane is meant to stay open while interacted
              // with, not just previewed. See CLAUDE.md "Calendar side pane".
              activeView === 'calendar' ? (
                <button
                  className={styles.menuBtn}
                  onClick={toggleSchedules}
                  aria-label="Calendar options"
                  aria-expanded={schedulesOpen}
                >☰</button>
              ) : (
                <button
                  className={styles.menuBtn}
                  onMouseEnter={handleHoverOpen}
                  onMouseLeave={handleHoverClose}
                  aria-label="Open library"
                >☰</button>
              )
            )}
            <h1 className={styles.heading}>
              {activeView === 'calendar'  ? 'Calendar'
               : activeView === 'records'   ? 'Records'
               : activeView === 'lists'     ? 'Lists'
               : activeView === 'portfolio' ? 'Portfolio'
               : activeView === 'notes'     ? 'Notes'
               : activeView === 'fitness'   ? 'Fitness'
               : 'My To Do'}
            </h1>
          </div>
          <div className={styles.headerRight}>
            {activeView === 'tasks' && <PurposeFilterPicker variant={isAndroid ? 'sheet' : 'dropdown'} />}
            {activeView !== 'portfolio' && activeView !== 'lists' && activeView !== 'fitness' && (
              <CollectionFilterPicker variant={isAndroid ? 'sheet' : 'dropdown'} />
            )}
            <NotificationCenter />
            <button
              className={styles.settingsBtn}
              onClick={openAccount}
              aria-label="Account"
              title="Account &amp; sync"
            >◎</button>
            <button
              className={styles.settingsBtn}
              onClick={openSettings}
              aria-label="Open settings"
            >⚙</button>
          </div>
        </header>

        {activeView === 'tasks' && (
          <>
            <main
              ref={taskScrollRef}
              className={`${styles.main} ${isAndroid ? styles.mainMobile : ''}`}
            >
              {isAndroid && (pullDistance > 0 || pullRefreshing) && (
                <div className={styles.pullIndicator} style={{ height: pullRefreshing ? 40 : pullDistance }}>
                  {pullRefreshing ? 'Refreshing…' : pullDistance > 50 ? 'Release to refresh' : 'Pull to refresh'}
                </div>
              )}
              {!isAndroid && <QuickAddInput />}
              <div className={styles.toolRow}>
                <SortBar />
                <div className={styles.viewModeToggle}>
                  <button
                    className={`${styles.viewModeBtn} ${taskViewMode === 'overview' ? styles.viewModeBtnActive : ''}`}
                    onClick={() => setTaskViewMode('overview')}
                    title="Overview — all tasks collapsed"
                  >Overview</button>
                  <button
                    className={`${styles.viewModeBtn} ${taskViewMode === 'focused' ? styles.viewModeBtnActive : ''}`}
                    onClick={() => setTaskViewMode('focused')}
                    title="Focused — all tasks expanded"
                  >Focused</button>
                </div>
              </div>
              <TaskList />
            </main>
            {isAndroid && <MobileQuickAddBar />}
          </>
        )}

        {activeView === 'calendar'  && <CalendarView />}
        {activeView === 'records'   && <RecordsView />}
        {activeView === 'lists'     && <ListsSection />}
        {activeView === 'notes'     && <NotesSection />}
        {activeView === 'portfolio' && isAppEnabled('portfolio') && (
          <Suspense fallback={<AppSectionFallback />}><PortfolioSection /></Suspense>
        )}
        {activeView === 'fitness' && isAppEnabled('fitness') && (
          <Suspense fallback={<AppSectionFallback />}><FitnessSection /></Suspense>
        )}

        <AddTaskButton />

        {!isAndroid && <Sidebar onHoverEnter={handleHoverOpen} onHoverLeave={handleHoverClose} />}
        {editingTaskId             && <TaskPane />}
        {settingsOpen              && <SettingsPane />}
        <ManagePane />
        {accountOpen               && <AccountPane />}
        {integrationsOpen          && <IntegrationsPane />}
        {editingCalendarEventId    && <CalendarEventPane />}
        {editingCalendarReminderId && <CalendarReminderPane />}

        {openModal === 'add-task'            && <AddTaskModal />}
        {openModal === 'add-collection'      && <AddCollectionModal />}
        {openModal === 'add-purpose'         && <AddPurposeModal />}
        {openModal === 'add-tag'             && <AddTagModal />}
        {openModal === 'add-calendar-item'   && <AddCalendarItemModal />}
        {openModal === 'add-tracker'            && <AddTrackerModal />}
        {openModal === 'add-entry'             && <AddEntryModal />}
        {openModal === 'add-routine'           && <AddRoutineModal />}
        {openModal === 'add-watchlist-item'      && <AddWatchlistItemModal key={editingWatchlistItemId ?? 'new'} />}
        {openModal === 'add-portfolio-tag'       && <AddPortfolioTagModal />}
        {openModal === 'add-investment-purpose'  && <AddInvestmentPurposeModal />}
        {openModal === 'bulk-upload-watchlist'   && <BulkUploadWatchlistModal />}
        {openModal === 'add-list'               && <AddListModal />}
        {openModal === 'add-list-item'          && <AddListItemModal />}
        {openModal === 'add-note'               && <AddNoteModal />}
        {openModal === 'add-note-tag'           && <AddNoteTagModal />}
        {openModal === 'note-tag-presets'       && <NoteTagPresetModal />}
        {openModal === 'edit-note-meta'         && <EditNoteMetaModal />}
        {openModal === 'add-activity'           && <AddActivityModal />}
        <EditActivityTypeModal />
        {openModal === 'add-schedule'           && <AddScheduleModal />}
        {editTrackerOpen                     && <EditTrackerPane />}
        {editRoutineOpen                     && <EditRoutinePane />}
        {editingNoteId && activeView !== 'notes' && <NoteEditorPane />}

        <LinkHoverPreview />
        {quickAccessOpen && <QuickAccessPane />}
        {decryptPrompt && <DecryptPrompt />}
        {isAndroid && <MobileNav />}
        {isAndroid && <MobileMoreSheet />}
        {isAndroid && <MobileCalendarQuickAdd />}
      </div>
    </div>
  );
}
