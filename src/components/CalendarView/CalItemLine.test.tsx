// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CalItemBlock, CalItemLine } from './CalItemLine';

afterEach(cleanup);

// The order of a calendar item's line (CLAUDE.md "Kinds of event…"): its icon before its title; ❗/🔁
// after its time, or after its title with no time. Once, never both (2026-11-06).
const item = { title: 'Lecture', typeIcon: '🎓', flags: '❗🔁' };
const order = (el: HTMLElement) => el.textContent;

describe('CalItemLine', () => {
  it('with a time: time, flags, icon, title', () => {
    const { container } = render(<div><CalItemLine item={item} time="09:00" /></div>);
    expect(order(container)).toBe('09:00❗🔁🎓Lecture');
  });
  it('with no time: icon, title, flags', () => {
    const { container } = render(<div><CalItemLine item={item} time={null} /></div>);
    expect(order(container)).toBe('🎓Lecture❗🔁');
  });
  it('nothing to add: just the icon and title', () => {
    const { container } = render(<div><CalItemLine item={{ title: 'Lunch', typeIcon: '' }} time={null} /></div>);
    expect(order(container)).toBe('Lunch');
  });
  it('a timed block: the time and flags, then the icon and title', () => {
    const { container } = render(<div><CalItemBlock item={item} time="09:00–10:00" /></div>);
    expect(order(container)).toBe('09:00–10:00❗🔁🎓Lecture');
  });
});
