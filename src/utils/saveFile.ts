import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// THE way to hand the user a file the app made (backups, snapshots, future exports). The web and
// desktop download it through an <a download>. An Android WebView ignores that, so there the
// file is written to the app's cache and the share sheet opens (save to Files or Drive, email…).
export async function saveFile(filename: string, blob: Blob): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: toBase64(new Uint8Array(await blob.arrayBuffer())),
      directory: Directory.Cache,
    });
    try {
      await Share.share({ title: filename, files: [uri] });
    } catch (e) {
      // Dismissing the share sheet rejects; that's the user's choice, not a failure.
      if (e instanceof Error && /cancel/i.test(e.message)) return;
      throw e;
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
