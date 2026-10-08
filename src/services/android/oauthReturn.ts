import { Browser } from '@capacitor/browser';
import { registerDeepLink } from '@/services/android/deepLinks';
import { settleOAuthFlow } from '@/services/oauthState';
import { syncGoogleCalendars } from '@/services/googleCalendar';
import { useUIStore } from '@/store/uiStore';
import { showToast } from '@/components/Toast/showToast';
import { LABELS } from '@/config/labels';
import { isAppEnabled } from '@/config/apps';

// organisaitor://oauth-done?provider=<strava|google-calendar>&status=<connected|error>&reason=…
// is where api/*-oauth-callback.ts sends a connect flow started from the Android app (decision
// D5). It does what the web app does on ?strava=… / ?googleCalendar=… (App.tsx): go to the
// provider's section, and for Google open the side pane listing the calendars and sync now.
// The connect button that opened the flow refreshes its own status (openOAuthFlow resolves).
export async function handleOAuthDone(url: URL): Promise<void> {
  const provider = url.searchParams.get('provider');
  if (provider !== 'strava' && provider !== 'google-calendar') return;
  const connected = url.searchParams.get('status') === 'connected';
  const reason = url.searchParams.get('reason') ?? undefined;

  settleOAuthFlow(provider, connected ? { status: 'connected' } : { status: 'error', reason });
  await Browser.close().catch(() => { /* already closed */ });

  const ui = useUIStore.getState();
  if (provider === 'strava') {
    if (isAppEnabled('fitness')) ui.setActiveView('fitness');
  } else {
    ui.setActiveView('calendar');
    ui.openSchedules();
    if (connected) void syncGoogleCalendars();
  }

  const name = LABELS.oauthReturn.provider[provider];
  showToast({
    message: connected ? LABELS.oauthReturn.connected(name) : LABELS.oauthReturn.failed(name),
    detail: connected ? undefined : reason,
  });
}

export function registerOAuthReturn(): () => void {
  return registerDeepLink('oauth-done', handleOAuthDone);
}
