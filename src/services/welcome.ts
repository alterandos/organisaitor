import { log } from '@/utils/log';

// The welcome page (components/WelcomePage) shows whenever nobody is signed in, until the person
// chooses to carry on without an account. That choice is remembered on this device only: it is
// per-device bookkeeping, not user data, so it is deliberately not in PERSISTED_STORAGE_KEYS and
// never travels in a backup. Signing out forgets it (services/signOut.ts), so a signed-out device
// greets the next person with the welcome page again.
const KEY = 'organisaitor-welcome-passed';

export function welcomePassed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch (e) {
    log.warn('welcome', 'could not read the welcome choice', e);
    return false;
  }
}

export function passWelcome(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch (e) {
    log.warn('welcome', 'could not remember the welcome choice', e);
  }
}

export function resetWelcome(): void {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    log.warn('welcome', 'could not forget the welcome choice', e);
  }
}
