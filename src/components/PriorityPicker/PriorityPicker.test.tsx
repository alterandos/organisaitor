// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { Priority } from '@/types';
import { PriorityPicker } from './PriorityPicker';

afterEach(cleanup);

function Host() {
  const [p, setP] = useState<Priority>('none');
  return <PriorityPicker value={p} onChange={setP} />;
}

describe('PriorityPicker: a priority as a traffic light', () => {
  it('a dot per level, the chosen one checked and named beside them; a click or the arrows choose', () => {
    render(<Host />);
    const dots = screen.getAllByRole('radio');
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual(['None', 'Low', 'Medium', 'High']);
    expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'High' }));
    expect(screen.getByRole('radio', { name: 'High' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('High')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'High' })).toHaveAttribute('aria-checked', 'true');
  });
});
