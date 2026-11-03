// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

// A stand-in for MathLive's field (jsdom can't run it). What matters here: it lives inside the
// holder the component gives it, and its value changes as it's typed in.
const { FakeField } = vi.hoisted(() => {
  class FakeField extends HTMLElement {
    value = '';
    readOnly = false;
    placeholder = '';
    menuItems: unknown[] = [];
    inlineShortcuts: Record<string, string> = {};
    setValue(v: string) { this.value = v; }
    hasFocus() { return false; }
  }
  return { FakeField };
});
vi.mock('./Maths', () => {
  customElements.define('fake-math-field', FakeField);
  return { loadMathLive: () => Promise.resolve({ MathfieldElement: FakeField }), MATH_SHORTCUTS: {} };
});

import { MathsInput } from './MathsInput';

afterEach(cleanup);

describe('MathsInput', () => {
  it('keeps the field when its value changes (2026-11-03: React wiped it, and the next keys fired hotkeys)', async () => {
    const commit = vi.fn();
    const { container, rerender } = render(<MathsInput value="" onCommit={commit} editable label="Formula" />);
    await act(async () => { await Promise.resolve(); });
    const holder = container.querySelector('[data-card-maths]')!;
    const field = holder.querySelector('fake-math-field') as InstanceType<typeof FakeField>;
    expect(field).not.toBeNull();
    field.value = 'e12';
    rerender(<MathsInput value="e12" onCommit={commit} editable label="Formula" />);
    expect(holder.querySelector('fake-math-field')).toBe(field);
    expect(field.value).toBe('e12');
  });
});
