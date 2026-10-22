import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

// One wheel "notch": trackpads send many small deltas, so they're added up until they make one.
const WHEEL_NOTCH = 40;

// The wheel over a segment of a segmented field (TimeInput, DateInput) steps it: `onStep(index,
// dir)` with +1 for up, -1 for down, `index` being which of `refs` the wheel was over. React's wheel
// listener is passive, so it can't stop the page scrolling: native listeners instead. `deps`
// re-attaches them when the segments change (a segment shown or hidden).
export function useWheelSteps(refs: RefObject<HTMLElement | null>[], onStep: (index: number, dir: 1 | -1) => void, deps: unknown[] = []): void {
  const stepRef = useRef(onStep);
  useLayoutEffect(() => { stepRef.current = onStep; });
  const acc = useRef(0);
  useEffect(() => {
    const offs = refs.map((ref, i) => {
      const el = ref.current;
      if (!el) return () => {};
      const onWheel = (e: WheelEvent) => {
        if (e.deltaY === 0) return;
        e.preventDefault();
        acc.current += e.deltaMode === 0 ? e.deltaY : e.deltaY * WHEEL_NOTCH;
        if (Math.abs(acc.current) < WHEEL_NOTCH) return;
        const dir = acc.current < 0 ? 1 : -1;
        acc.current = 0;
        stepRef.current(i, dir);
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
    });
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the refs are stable; deps says when the elements change
  }, deps);
}
