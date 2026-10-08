// THE way app code logs (CLAUDE.md "Errors and logging"). Every entry has a scope (the area it
// comes from: 'sync', 'vault', 'noteSecrets'…) and a message, so the console reads "[scope]
// message" everywhere and entries can be read back as data. Debug entries are dropped from
// production builds. The last MAX_RECENT entries are kept in memory (recentLogs) so an error
// report — the ErrorBoundary's Details — can say what led up to it.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  at: string;          // ISO time
  level: LogLevel;
  scope: string;
  message: string;
  detail: unknown[];
}

const MAX_RECENT = 100;
const recent: LogEntry[] = [];

function write(level: LogLevel, scope: string, message: string, detail: unknown[]): void {
  if (level === 'debug' && !import.meta.env.DEV) return;
  recent.push({ at: new Date().toISOString(), level, scope, message, detail });
  if (recent.length > MAX_RECENT) recent.shift();
  console[level](`[${scope}] ${message}`, ...detail);
}

export const log = {
  debug: (scope: string, message: string, ...detail: unknown[]) => write('debug', scope, message, detail),
  info:  (scope: string, message: string, ...detail: unknown[]) => write('info', scope, message, detail),
  warn:  (scope: string, message: string, ...detail: unknown[]) => write('warn', scope, message, detail),
  error: (scope: string, message: string, ...detail: unknown[]) => write('error', scope, message, detail),
};

export function recentLogs(): readonly LogEntry[] {
  return recent;
}

// A caught value as text for a message: an Error's message, anything else stringified.
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Errors no try/catch or ErrorBoundary saw (an async handler, a rejected promise nobody
// awaited) are logged rather than lost. Installed once, from main.tsx.
let installed = false;
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => log.error('unhandled', e.message, e.error));
  window.addEventListener('unhandledrejection', (e) => log.error('unhandled', `promise rejected: ${errorMessage(e.reason)}`, e.reason));
}
