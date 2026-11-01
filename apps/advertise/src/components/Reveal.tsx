'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Fades its children up when they scroll into view. The server renders them visible, so the
 * page reads at once on slow phones even before JavaScript runs; after hydration only blocks
 * still below the viewport are hidden and then revealed as the user scrolls. `immediate` plays
 * the fade at once (above the fold), straight from the server-rendered HTML.
 */
export function Reveal({ children, delay = 0, className = '', immediate = false }: { children: React.ReactNode; delay?: number; className?: string; immediate?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'shown' | 'waiting' | 'revealed'>('shown');

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || immediate || typeof IntersectionObserver === 'undefined') return;
    // Already on screen (or above it): leave it as rendered.
    if (node.getBoundingClientRect().top < window.innerHeight) return;
    setState('waiting');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState('revealed');
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [immediate]);

  const motion = immediate || state === 'revealed' ? 'animate-fade-up' : state === 'waiting' ? 'opacity-0' : '';
  return (
    <div ref={ref} className={`${className} ${motion}`} style={motion === 'animate-fade-up' ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
