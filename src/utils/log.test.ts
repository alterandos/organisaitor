import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorMessage, log, recentLogs } from './log';

afterEach(() => { vi.restoreAllMocks(); });

describe('log', () => {
  it('writes "[scope] message" with the detail, and keeps the entry', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = new Error('boom');
    log.warn('sync', 'push failed', err);
    expect(spy).toHaveBeenCalledWith('[sync] push failed', err);
    const last = recentLogs().at(-1)!;
    expect(last).toMatchObject({ level: 'warn', scope: 'sync', message: 'push failed', detail: [err] });
  });

  it('keeps only the most recent entries', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    for (let i = 0; i < 150; i++) log.info('t', `n${i}`);
    expect(recentLogs().length).toBe(100);
    expect(recentLogs().at(-1)!.message).toBe('n149');
  });

  it('errorMessage reads an Error or anything else', () => {
    expect(errorMessage(new Error('x'))).toBe('x');
    expect(errorMessage('plain')).toBe('plain');
  });
});
