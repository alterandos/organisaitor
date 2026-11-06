// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { usePictureStore } from '@/store/pictureStore';

vi.mock('@/utils/imageCompress', async (orig) => ({
  ...(await orig<typeof import('@/utils/imageCompress')>()),
  compressImageBlob: async (b: Blob) => `data:image/png;base64,${b.size}`,
}));
const { PicturesField } = await import('./PicturesField');

beforeEach(() => usePictureStore.setState(usePictureStore.getInitialState(), true));
afterEach(cleanup);

function Host({ start = [] as string[] }) {
  const [ids, setIds] = useState(start);
  return <><PicturesField value={ids} onChange={setIds} /><output data-testid="ids">{ids.join(',')}</output></>;
}

const png = (n: number) => new File([new Uint8Array(n)], `p${n}.png`, { type: 'image/png' });
const transfer = (files: File[]) => ({ items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })), files, types: ['Files'] });

describe('PicturesField: adding pictures to an item', () => {
  it('a picture pasted into it or dropped on it goes into the library (origin item) and onto the item', async () => {
    render(<Host />);
    const field = screen.getByRole('group');
    await act(async () => { fireEvent.paste(field, { clipboardData: transfer([png(3)]) }); });
    await act(async () => { fireEvent.drop(field, { dataTransfer: transfer([png(5)]) }); });
    const ids = screen.getByTestId('ids').textContent!.split(',');
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => usePictureStore.getState().pictures[id as never]?.origin)).toEqual(['item', 'item']);
  });

  it('each picture opens larger, and can be taken off', async () => {
    render(<Host />);
    await act(async () => { fireEvent.paste(screen.getByRole('group'), { clipboardData: transfer([png(3)]) }); });
    fireEvent.click(screen.getByRole('button', { name: /Picture 1: open/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove picture 1' }));
    expect(screen.getByTestId('ids').textContent).toBe('');
  });

  it('offers a file and the clipboard', () => {
    render(<Host />);
    expect(screen.getByRole('button', { name: /Add a picture/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /From clipboard/ })).toBeInTheDocument();
  });
});
