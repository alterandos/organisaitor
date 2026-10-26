// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IconField } from './IconField';
import { ItemIcon } from './ItemIcon';
import { firstGrapheme, iconText, isPictureIcon } from './iconValue';
import { COMMON_EMOJI, EMOJI_GROUPS, EMOJI_SET, searchEmoji } from '@/config/emojiSet';

// The icon field (components/IconPicker): picking an emoji, searching, a typed emoji, no icon, and a
// picture made into an icon; the value helpers and the emoji set.

const added = vi.hoisted(() => ({ file: null as File | null }));
vi.mock('@/services/pictures', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/pictures')>();
  return {
    ...real,
    addIconPicture: async (file: File) => { added.file = file; return 'pic1'; },
    useIconPictures: () => [],
    usePictureSrc: (id: string | null) => (id ? `data:image/webp;base64,${id}` : null),
  };
});

afterEach(cleanup);

describe('icon values and the emoji set', () => {
  it('an icon is an emoji or a picture; text-only places get the emoji or the fallback', () => {
    expect(isPictureIcon('picture:abc')).toBe(true);
    expect(iconText('picture:abc', '📁')).toBe('📁');
    expect(iconText('📚')).toBe('📚');
    expect(iconText(null, '📋')).toBe('📋');
    expect(firstGrapheme(' 👩‍🔬 lab')).toBe('👩‍🔬');
  });

  it('every group has emoji with words, none is listed twice, and search finds by word start', () => {
    const all = EMOJI_GROUPS.flatMap((g) => EMOJI_SET[g]);
    expect(all.every((e) => e.emoji && e.words)).toBe(true);
    expect(new Set(all.map((e) => e.emoji)).size).toBe(all.length);
    expect(searchEmoji('chem').map((e) => e.emoji)).toContain('🧪');
    expect(searchEmoji('book red').map((e) => e.emoji)).toEqual(['📕']);
    expect(COMMON_EMOJI.length).toBeGreaterThan(20);
  });

  it('ItemIcon draws an emoji as text and a picture as an image', () => {
    const { container } = render(<><ItemIcon icon="📚" /><ItemIcon icon="picture:p9" /><ItemIcon icon={null} fallback="📁" /></>);
    expect(container.textContent).toBe('📚📁');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/webp;base64,p9');
  });
});

describe('the icon field', () => {
  const open = (value: string | null = null) => {
    const onChange = vi.fn();
    render(<IconField value={value} onChange={onChange} fallback="📁" />);
    fireEvent.click(screen.getByRole('button', { name: 'Icon' }));
    return onChange;
  };

  it('picks an emoji from a group, or from a search', () => {
    let onChange = open();
    fireEvent.click(screen.getByRole('button', { name: 'books' }));
    expect(onChange).toHaveBeenCalledWith('📚');
    cleanup();
    onChange = open();
    fireEvent.change(screen.getByRole('textbox', { name: /Search/ }), { target: { value: 'volcano' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: /Search/ }), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('🌋');
  });

  it('takes any emoji typed or pasted, and No icon clears it', () => {
    let onChange = open();
    fireEvent.change(screen.getByRole('textbox', { name: /Search/ }), { target: { value: '🦄' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use 🦄' }));
    expect(onChange).toHaveBeenCalledWith('🦄');
    cleanup();
    onChange = open('📚');
    fireEvent.click(screen.getByRole('button', { name: 'No icon' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('a picture chosen becomes an icon in the library', async () => {
    const onChange = open();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('picture:pic1'));
    expect(added.file).toBe(file);
  });
});
