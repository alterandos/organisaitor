// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { registerEscapeClose } from '@/hooks/useEscapeClose';
import { pageKeyBlocked } from './pageKeys';

describe('page hotkeys stand aside (utils/pageKeys.ts)', () => {
  it('while an overlay is open, not for a docked panel, and while typing', () => {
    expect(pageKeyBlocked(document.body)).toBe(false);
    const offDocked = registerEscapeClose(() => {}, { docked: true });
    expect(pageKeyBlocked(document.body)).toBe(false);
    const offModal = registerEscapeClose(() => {});
    expect(pageKeyBlocked(document.body)).toBe(true);
    offModal();
    expect(pageKeyBlocked(document.body)).toBe(false);
    offDocked();
    const input = document.createElement('input');
    document.body.append(input);
    expect(pageKeyBlocked(input)).toBe(true);
    input.remove();
  });
});
