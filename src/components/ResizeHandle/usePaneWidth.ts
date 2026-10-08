import { useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { usePlatform } from '@/hooks/usePlatform';
import type { ResizeHandleProps } from './ResizeHandle';

// THE way a side panel or column gets a draggable edge (CLAUDE.md "Resizable side panels").
// `id` names the width in settingsStore.paneWidths; panes of one family share an id so they open
// at the same width. Until the user drags, the pane keeps its CSS width. Desktop only: on a phone
// panes are full width or sheets.
//
//   const resize = usePaneWidth('item-pane', { edge: 'left', min: 340, max: 760 });
//   <aside className={styles.pane} style={resize.style}>
//     {resize.handle && <ResizeHandle {...resize.handle} />}
export function usePaneWidth(id: string, { edge, min, max }: { edge: 'left' | 'right'; min: number; max: number }) {
  const stored = useSettingsStore((s) => s.paneWidths[id]);
  const setPaneWidth = useSettingsStore((s) => s.setPaneWidth);
  const { isAndroid } = usePlatform();
  const [live, setLive] = useState<number | null>(null);

  if (isAndroid) return { style: undefined, handle: null, dragging: false };
  const width = live ?? stored ?? null;
  const handle: ResizeHandleProps = {
    edge, min, max, width,
    onResize: setLive,
    onCommit: (w) => { setLive(null); setPaneWidth(id, w); },
    onReset:  () => { setLive(null); setPaneWidth(id, null); },
  };
  return {
    style: width === null ? undefined : { width: `min(${width}px, 100vw)` },
    handle,
    dragging: live !== null,
  };
}
