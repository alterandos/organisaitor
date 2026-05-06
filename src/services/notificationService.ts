export async function fireOSNotification(title: string, body: string): Promise<void> {
  try {
    if ('__TAURI_INTERNALS__' in window) {
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      await sendNotification({ title, body });
    } else if ('Notification' in window) {
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission === 'granted') new Notification(title, { body });
    }
  } catch {
    // Notifications are best-effort — never crash the app
  }
}
