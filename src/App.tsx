import { useRef, useEffect } from 'react';
import type React from 'react';
import { supabase, isSupabaseConfigured } from '@/services/supabase';
import { useAuthStore } from '@/store/authStore';
import { initSync, stopSync } from '@/services/sync/syncService';
import { AccountPane } from '@/components/AccountPane/AccountPane';
import { TaskList } from '@/components/TaskList/TaskList';
import { QuickAddInput } from '@/components/QuickAddInput/QuickAddInput';
import { AddTaskButton } from '@/components/AddTaskButton/AddTaskButton';
import { CollectionFilterPicker } from '@/components/CollectionPicker/CollectionFilterPicker';
import { SortBar } from '@/components/SortBar/SortBar';
import { PurposeFilterBar } from '@/components/PurposeFilterBar/PurposeFilterBar';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { NavSidebar } from '@/components/NavSidebar/NavSidebar';
import { CalendarView } from '@/components/CalendarView/CalendarView';
import { RecordsView } from '@/components/RecordsView/RecordsView';
import { PortfolioSection } from '@/components/PortfolioSection/PortfolioSection';
import { AddWatchlistItemModal } from '@/components/AddWatchlistItemModal/AddWatchlistItemModal';
import { BulkUploadWatchlistModal } from '@/components/BulkUploadWatchlistModal/BulkUploadWatchlistModal';
import { AddPortfolioTagModal } from '@/components/AddPortfolioTagModal/AddPortfolioTagModal';
import { AddInvestmentPurposeModal } from '@/components/AddInvestmentPurposeModal/AddInvestmentPurposeModal';
import { TaskPane } from '@/components/TaskPane/TaskPane';
import { SettingsPane } from '@/components/SettingsPane/SettingsPane';
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
import { useNotificationChecker } from '@/hooks/useNotificationChecker';
import { useTaskStore } from '@/store/taskStore';
import { useUIStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { hexToRgba } from '@/utils/color';
import type { CollectionId } from '@/types';
import styles from './App.module.css';

export default function App() {
  const openAccount                = useUIStore((s) => s.openAccount);
  const accountOpen                = useUIStore((s) => s.accountOpen);
  const openModal                  = useUIStore((s) => s.openModal);
  const editingTaskId              = useUIStore((s) => s.editingTaskId);
  const activeCollectionId         = useUIStore((s) => s.activeCollectionId);
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
  const collectionsRecord          = useTaskStore((s) => s.collections);
  const colorEnabled               = useSettingsStore((s) => s.colorEnabled);
  const setChartTickerRowZoom      = useSettingsStore((s) => s.setChartTickerRowZoom);
  const chartTickerRowZoom         = useSettingsStore((s) => s.chartTickerRowZoom);

  useNotificationChecker();

  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) initSync(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_IN'  && session) initSync(session.user.id);
      if (event === 'SIGNED_OUT')             stopSync();
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
  const taskViewMode     = useUIStore((s) => s.taskViewMode);
  const setTaskViewMode  = useUIStore((s) => s.setTaskViewMode);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (e.target as HTMLElement)?.isContentEditable;
      if (isTyping) return;

      if ((e.key === '1' || (e.ctrlKey && e.key === '1')) && !e.altKey && !e.metaKey) { e.preventDefault(); setActiveView('tasks'); return; }
      if ((e.key === '2' || (e.ctrlKey && e.key === '2')) && !e.altKey && !e.metaKey) { e.preventDefault(); setActiveView('calendar'); return; }
      if ((e.key === '3' || (e.ctrlKey && e.key === '3')) && !e.altKey && !e.metaKey) { e.preventDefault(); setActiveView('records'); return; }
      if ((e.key === '4' || (e.ctrlKey && e.key === '4')) && !e.altKey && !e.metaKey) { e.preventDefault(); setActiveView('portfolio'); return; }

      if (e.key === 's' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (settingsOpen) closeSettings(); else openSettings();
        return;
      }

      if (portfolioChartOpen && e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === '-') { e.preventDefault(); setChartTickerRowZoom(chartTickerRowZoom - 0.1); return; }
        if (e.key === '=' || e.key === '+') { e.preventDefault(); setChartTickerRowZoom(chartTickerRowZoom + 0.1); return; }
      }

      const isNewItem = (e.key === ' ' && !e.ctrlKey && !e.altKey && !e.metaKey)
                     || (e.ctrlKey && e.key === 'n');
      if (isNewItem) {
        e.preventDefault();
        const { showAddTask, showAddCalendarItem, showAddTracker, showAddEntry, showAddWatchlistItem, activeTrackerId: tid, activeRoutineId: rid } = useUIStore.getState();
        if (activeView === 'calendar') showAddCalendarItem();
        else if (activeView === 'portfolio') showAddWatchlistItem();
        else if (activeView === 'records') {
          if (tid) showAddEntry(tid);
          else if (rid) showAddEntry(rid);
          else showAddTracker();
        } else showAddTask();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setActiveView, activeView, settingsOpen, openSettings, closeSettings, portfolioChartOpen, chartTickerRowZoom, setChartTickerRowZoom]);

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
      <NavSidebar />

      <div className={styles.app}>
        <header className={styles.header} style={headerStyle}>
          <div className={styles.headerLeft}>
            <button
              className={styles.menuBtn}
              onMouseEnter={handleHoverOpen}
              onMouseLeave={handleHoverClose}
              aria-label="Open library"
            >☰</button>
            <h1 className={styles.heading}>
              {activeView === 'calendar'  ? 'Calendar'
               : activeView === 'records'   ? 'Records'
               : activeView === 'portfolio' ? 'Portfolio'
               : 'My To Do'}
            </h1>
          </div>
          <div className={styles.headerRight}>
            {activeView !== 'portfolio' && <CollectionFilterPicker />}
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
            <PurposeFilterBar />
            <main className={styles.main}>
              <QuickAddInput />
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
          </>
        )}

        {activeView === 'calendar'  && <CalendarView />}
        {activeView === 'records'   && <RecordsView />}
        {activeView === 'portfolio' && <PortfolioSection />}

        <AddTaskButton />

        <Sidebar onHoverEnter={handleHoverOpen} onHoverLeave={handleHoverClose} />
        {editingTaskId             && <TaskPane />}
        {settingsOpen              && <SettingsPane />}
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
        {editTrackerOpen                     && <EditTrackerPane />}
        {editRoutineOpen                     && <EditRoutinePane />}
      </div>
    </div>
  );
}
