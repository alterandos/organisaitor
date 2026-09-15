export function normalizeLinkUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
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
