'use client';

import { useEffect } from 'react';

/**
 * Lets `.card-glow` cards light up where the pointer is: one listener for the whole page sets
 * --mx / --my on the card under the pointer. Renders nothing.
 */
export function PointerGlow() {
  useEffect(() => {
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const card = (e.target as Element | null)?.closest?.('.card-glow') as HTMLElement | null;
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
    };
  }, []);
  return null;
}
