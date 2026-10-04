// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => ({
  platform: 'web',
  writeFile: vi.fn(),
  share: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => cap.platform } }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: { writeFile: cap.writeFile },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: cap.share } }));

import { saveFile } from './saveFile';

const json = () => new Blob([JSON.stringify({ a: 'é' })], { type: 'application/json' });

beforeEach(() => {
  cap.platform = 'web';
  cap.writeFile.mockReset().mockResolvedValue({ uri: 'file:///cache/backup.json' });
  cap.share.mockReset().mockResolvedValue({});
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

describe('saveFile on the web', () => {
  it('downloads through an anchor with the filename', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('backup.json');
      expect(this.href).toBe('blob:x');
    });

    await saveFile('backup.json', json());

    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    expect(cap.writeFile).not.toHaveBeenCalled();
    expect(document.querySelector('a')).toBeNull();
  });
});

describe('saveFile on Android', () => {
  beforeEach(() => { cap.platform = 'android'; });

  it('writes the bytes to the cache directory, then shares that file', async () => {
    await saveFile('backup.json', json());

    const written = cap.writeFile.mock.calls[0][0];
    expect(written).toMatchObject({ path: 'backup.json', directory: 'CACHE' });
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(written.data), (c) => c.charCodeAt(0)));
    expect(JSON.parse(decoded)).toEqual({ a: 'é' });
    expect(cap.share).toHaveBeenCalledWith({ title: 'backup.json', files: ['file:///cache/backup.json'] });
  });

  it('treats dismissing the share sheet as fine', async () => {
    cap.share.mockRejectedValue(new Error('Share canceled'));
    await expect(saveFile('backup.json', json())).resolves.toBeUndefined();
  });

  it('passes a real failure on', async () => {
    cap.writeFile.mockRejectedValue(new Error('disk full'));
    await expect(saveFile('backup.json', json())).rejects.toThrow('disk full');
  });
});
