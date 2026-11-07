// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { TimeIntensity } from '@/types';
import { TimeNeededPicker } from './TimeNeededPicker';

afterEach(cleanup);

function Host() {
  const [v, setV] = useState<TimeIntensity | null>(null);
  return <TimeNeededPicker value={v} onChange={setV} />;
}

describe('TimeNeededPicker: how much time a task needs, as clocks', () => {
  it('Not set, then three clocks; the chosen one checked and named; a click or the arrows choose', () => {
    render(<Host />);
    expect(screen.getAllByRole('radio').map((d) => d.getAttribute('aria-label'))).toEqual(['Not set', 'Short', 'Medium', 'Long']);
    expect(screen.getByRole('radio', { name: 'Not set' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Medium' }));
    expect(screen.getByRole('radio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Medium')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Not set' })).toHaveAttribute('aria-checked', 'true');
  });
  it('each is a clock (rim, four hour marks, two hands), filled clockwise from twelve: a third, two thirds, all', () => {
    render(<Host />);
    const svg = (name: string) => screen.getByRole('radio', { name }).querySelector('svg')!;
    for (const name of ['Not set', 'Short', 'Medium', 'Long']) expect(svg(name).querySelectorAll('line')).toHaveLength(6);
    expect(svg('Not set').querySelectorAll('path')).toHaveLength(0);
    // a third: the short arc (large-arc 0) ending at four o'clock; two thirds: the long one, at eight
    expect(svg('Short').querySelector('path')!.getAttribute('d')).toMatch(/ 0 0 1 12\.85 10\.8 Z$/);
    expect(svg('Medium').querySelector('path')!.getAttribute('d')).toMatch(/ 0 1 1 3\.15 10\.8 Z$/);
    expect(svg('Long').querySelectorAll('circle')).toHaveLength(3);
  });
});
