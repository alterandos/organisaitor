// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WelcomePage } from './WelcomePage';
import { useUIStore } from '@/store/uiStore';
import { LABELS } from '@/config/labels';
import { passWelcome, resetWelcome, welcomePassed } from '@/services/welcome';

vi.mock('@/services/supabase', () => ({ isSupabaseConfigured: true, supabase: {} }));

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  localStorage.clear();
});
afterEach(() => cleanup());

describe('the welcome page', () => {
  it('shows the suite name and tagline; Sign in and Create an account open Account on the right tab', async () => {
    const user = userEvent.setup();
    const { container } = render(<WelcomePage onContinue={() => {}} />);
    expect(screen.getByRole('heading', { name: LABELS.welcome.suiteName })).toBeInTheDocument();
    const tagline = container.querySelector('p')!.textContent;
    expect(LABELS.welcome.taglines).toContain(tagline);

    await user.click(screen.getByRole('button', { name: LABELS.welcome.createAccount }));
    expect(useUIStore.getState()).toMatchObject({ accountOpen: true, accountStartMode: 'signup' });
    await user.click(screen.getByRole('button', { name: LABELS.welcome.signIn }));
    expect(useUIStore.getState().accountStartMode).toBe('signin');
  });

  it('the tagline changes every few seconds, fading out and back in', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<WelcomePage onContinue={() => {}} />);
      const p = () => container.querySelector('p')!;
      const first = p().textContent;
      act(() => { vi.advanceTimersByTime(6200); });
      expect(p().className).toMatch(/taglineHidden/);
      act(() => { vi.advanceTimersByTime(700); });
      expect(p().className).not.toMatch(/taglineHidden/);
      expect(p().textContent).not.toBe(first);
      expect(LABELS.welcome.taglines).toContain(p().textContent);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Continue without an account hands back to the app', async () => {
    const onContinue = vi.fn();
    render(<WelcomePage onContinue={onContinue} />);
    await userEvent.setup().click(screen.getByRole('button', { name: LABELS.welcome.continueWithout }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('shows no broken image while the logo file is missing', () => {
    const { container } = render(<WelcomePage onContinue={() => {}} />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', '/brand/logo.png');
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('services/welcome.ts', () => {
  it('remembers carrying on without an account on this device, and forgets it', () => {
    expect(welcomePassed()).toBe(false);
    passWelcome();
    expect(welcomePassed()).toBe(true);
    resetWelcome();
    expect(welcomePassed()).toBe(false);
  });
});
