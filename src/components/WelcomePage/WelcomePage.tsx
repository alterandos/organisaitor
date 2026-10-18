import { useEffect, useRef, useState } from 'react';
import { pickTagline } from './taglines';
import { useUIStore } from '@/store/uiStore';
import { isSupabaseConfigured } from '@/services/supabase';
import { LABELS } from '@/config/labels';
import styles from './WelcomePage.module.css';

// What a signed-out visitor sees first (2026-10-18), instead of the whole app: the suite's name,
// its tagline and its logo, then Sign in / Create an account (both open the Account pane, the one
// sign-in path) or carry on without an account (App.tsx remembers that on this device:
// services/welcome.ts).
//
// The logo is public/brand/logo.png, served at /brand/logo.png on the website and bundled into
// the desktop and Android builds. Until that file exists the page simply shows no logo.
export const LOGO_SRC = '/brand/logo.png';

// The taglines take turns: each stays HOLD_MS, then fades out over FADE_MS and the next fades in.
const HOLD_MS = 5500;
const FADE_MS = 700;

// The tagline showing now, changing every few seconds. Which comes next is taglines.ts.
function useCyclingTagline(count: number): { index: number; shown: boolean } {
  const [index, setIndex] = useState(() => pickTagline(count, []));
  const [shown, setShown] = useState(true);
  const history = useRef<number[]>([index]);
  useEffect(() => {
    let fade: ReturnType<typeof setTimeout> | undefined;
    const tick = setInterval(() => {
      setShown(false);
      fade = setTimeout(() => {
        const next = pickTagline(count, history.current);
        history.current = [...history.current, next].slice(-10);
        setIndex(next);
        setShown(true);
      }, FADE_MS);
    }, HOLD_MS + FADE_MS);
    return () => { clearInterval(tick); clearTimeout(fade); };
  }, [count]);
  return { index, shown };
}

export function WelcomePage({ onContinue }: { onContinue: () => void }) {
  const L = LABELS.welcome;
  const openAccount = useUIStore((s) => s.openAccount);
  const [logoMissing, setLogoMissing] = useState(false);
  const tagline = useCyclingTagline(L.taglines.length);

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.content}>
        {!logoMissing && (
          <img className={styles.logo} src={LOGO_SRC} alt="" width={256} height={256} onError={() => setLogoMissing(true)} />
        )}
        <h1 className={styles.name}>{L.suiteName}</h1>
        <p className={`${styles.tagline} ${tagline.shown ? '' : styles.taglineHidden}`}>{L.taglines[tagline.index]}</p>

        <div className={styles.actions}>
          {isSupabaseConfigured && (
            <>
              <button type="button" className={styles.primary} onClick={() => openAccount('signin')}>{L.signIn}</button>
              <button type="button" className={styles.secondary} onClick={() => openAccount('signup')}>{L.createAccount}</button>
            </>
          )}
        </div>
        <button type="button" className={styles.guest} onClick={onContinue}>{L.continueWithout}</button>
        <p className={styles.guestHint}>{L.continueHint}</p>
      </div>
      <p className={styles.footer}>{L.footer}</p>
    </main>
  );
}
