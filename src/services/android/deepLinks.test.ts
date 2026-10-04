import { beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => ({
  platform: 'android',
  browserOpen: vi.fn(() => Promise.resolve()),
  browserClose: vi.fn(() => Promise.resolve()),
  finished: null as null | (() => void),
  syncGoogle: vi.fn(() => Promise.resolve({ created: 0, failed: 0 })),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => cap.platform },
}));
vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })), getLaunchUrl: vi.fn(() => Promise.resolve(undefined)) },
}));
vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: cap.browserOpen,
    close: cap.browserClose,
    addListener: (_e: string, fn: () => void) => { cap.finished = fn; return Promise.resolve({ remove: vi.fn() }); },
  },
}));
vi.mock('@/services/supabase', () => ({ supabase: {} }));
vi.mock('@/services/googleCalendar', () => ({ syncGoogleCalendars: cap.syncGoogle }));

import { handleDeepLink, registerDeepLink, resetDeepLinksForTest } from './deepLinks';
import { registerOAuthReturn } from './oauthReturn';
import { openOAuthFlow } from '@/services/oauthState';
import { useUIStore } from '@/store/uiStore';
import { useToastStore } from '@/store/toastStore';

beforeEach(() => {
  resetDeepLinksForTest();
  cap.browserClose.mockClear();
  cap.syncGoogle.mockClear();
  useUIStore.setState(useUIStore.getInitialState(), true);
  useToastStore.setState(useToastStore.getInitialState(), true);
});

describe('deepLinks router', () => {
  it('routes an organisaitor:// link by its host', async () => {
    const handler = vi.fn();
    registerDeepLink('open', handler);
    expect(await handleDeepLink('organisaitor://open?type=task&id=t1')).toBe(true);
    expect(handler.mock.calls[0][0].searchParams.get('id')).toBe('t1');
  });

  it('ignores other schemes, unknown routes and garbage', async () => {
    const handler = vi.fn();
    registerDeepLink('open', handler);
    expect(await handleDeepLink('https://organisaitor.vercel.app/open')).toBe(false);
    expect(await handleDeepLink('organisaitor://nowhere')).toBe(false);
    expect(await handleDeepLink('not a url')).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles the same link only once when it arrives twice (cold start)', async () => {
    const handler = vi.fn();
    registerDeepLink('open', handler);
    await handleDeepLink('organisaitor://open?id=1');
    await handleDeepLink('organisaitor://open?id=1');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unregistering removes the route', async () => {
    const handler = vi.fn();
    const unregister = registerDeepLink('open', handler);
    unregister();
    expect(await handleDeepLink('organisaitor://open?id=2')).toBe(false);
  });
});

describe('oauth-done route', () => {
  it('Google: settles the waiting connect button, closes the browser, opens the calendar list, syncs, toasts', async () => {
    registerOAuthReturn();
    const flow = openOAuthFlow('google-calendar', 'https://accounts.google.com/o/oauth2/v2/auth?x');
    await vi.waitFor(() => expect(cap.browserOpen).toHaveBeenCalled());

    await handleDeepLink('organisaitor://oauth-done?provider=google-calendar&status=connected');

    expect(await flow).toEqual({ status: 'connected' });
    expect(cap.browserClose).toHaveBeenCalled();
    expect(useUIStore.getState().activeView).toBe('calendar');
    expect(useUIStore.getState().schedulesOpen).toBe(true);
    expect(cap.syncGoogle).toHaveBeenCalled();
    expect(useToastStore.getState().current?.message).toBe('Google Calendar connected');
  });

  it('Strava error: goes to Fitness and shows the reason, without syncing calendars', async () => {
    registerOAuthReturn();
    await handleDeepLink('organisaitor://oauth-done?provider=strava&status=error&reason=access_denied');
    expect(useUIStore.getState().activeView).toBe('fitness');
    expect(cap.syncGoogle).not.toHaveBeenCalled();
    expect(useToastStore.getState().current).toMatchObject({ message: 'Strava connection failed', detail: 'access_denied' });
  });

  it('closing the browser without finishing resolves the connect button as closed', async () => {
    const flow = openOAuthFlow('strava', 'https://www.strava.com/oauth/authorize?x');
    await vi.waitFor(() => expect(cap.finished).not.toBeNull());
    cap.finished!();
    expect(await flow).toEqual({ status: 'closed' });
  });
});
