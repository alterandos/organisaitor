// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CardIcon } from './CardIcon';
import { createCardIcon } from './cardIconDom';

// The card look's icon is drawn by React (CardIcon) and by plain DOM (createCardIcon, for a card
// ProseMirror draws). They must stay alike: same parts, same labels, same buttons.
const shape = (el: Element | null): unknown => el && ({
  attrs: [...el.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'aria-label' || a.name === 'title').map((a) => `${a.name}=${a.value}`).sort(),
  children: [...el.children].filter((c) => c.tagName !== 'svg').map(shape),
  text: el.children.length ? undefined : el.textContent,
});

describe('the card icon', () => {
  afterEach(cleanup);

  for (const [name, shown, toggle] of [
    ['shown, with its hide button', true, true],
    ['shown, nothing to hide it with', true, false],
    ['hidden, with its show button', false, true],
  ] as const) {
    it(`React and plain DOM draw the same: ${name}`, () => {
      const onToggle = toggle ? vi.fn() : undefined;
      const { container } = render(<CardIcon icon="📖" shown={shown} onToggle={onToggle} />);
      const dom = createCardIcon({ icon: '📖', shown, onToggle });
      expect(shape(dom)).toEqual(shape(container.firstElementChild));
    });
  }

  it('hidden with no way back draws nothing, in both', () => {
    const { container } = render(<CardIcon icon="📖" shown={false} />);
    expect(container.firstElementChild).toBeNull();
    expect(createCardIcon({ icon: '📖', shown: false })).toBeNull();
  });

  it('the buttons say which way', () => {
    const onToggle = vi.fn();
    createCardIcon({ icon: '📖', shown: true, onToggle })!.querySelector('button')!.click();
    (createCardIcon({ icon: '📖', shown: false, onToggle }) as HTMLButtonElement).click();
    expect(onToggle.mock.calls).toEqual([[false], [true]]);
  });
});
