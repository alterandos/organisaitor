export function normalizeLinkUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+/gi;

export function extractUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = text.match(URL_IN_TEXT) ?? [];
  const cleaned = found
    .map((u) => u.replace(/[.,;:!?)]+$/, '')) // trim trailing sentence punctuation
    .map((u) => normalizeLinkUrl(u))
    .filter(Boolean);
  return [...new Set(cleaned)];
}

// "https://Example.com/" and "example.com" are the same link for de-duplication purposes.
const linkKey = (url: string) => url.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');

// Links that appear in `notes` but weren't in `previousNotes` (so a link the user deliberately
// removed from the links list isn't re-added by an unrelated later edit of the notes) and aren't
// already in `existing`. Returns `existing` itself, untouched, when there's nothing to add.
export function mergeNewLinks(existing: string[], notes: string | null | undefined, previousNotes?: string | null): string[] {
  const seen = new Set(existing.map(linkKey));
  const before = new Set(extractUrls(previousNotes).map(linkKey));
  const added = extractUrls(notes).filter((u) => !before.has(linkKey(u)) && !seen.has(linkKey(u)));
  return added.length ? [...existing, ...added] : existing;
}

// Tauri's webview does not act on window.open()/<a target="_blank"> for external URLs —
// there's no OS browser tab to hand them off to without the opener plugin. Android's
// WebView has the exact same problem for the exact same reason. Route external link
// clicks through this helper so they work identically across the Tauri desktop app, the
// Android app, and the PWA/browser build (same __TAURI_INTERNALS__ detection pattern as
// notificationService.ts for Tauri; Capacitor.isNativePlatform() + platform check for
// Android — checked before Tauri's string-based check just in case, though the two never
// overlap in practice since a build is either Tauri or Capacitor, never both).
export async function openExternalLink(url: string): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.getPlatform() === 'android') {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else if ('__TAURI_INTERNALS__' in window) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
