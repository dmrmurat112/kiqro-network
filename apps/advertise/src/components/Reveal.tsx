'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Fades its children up once they scroll into view. Use `immediate` above the fold: the
 * animation then runs from the server-rendered HTML without waiting for JavaScript.
 */
export function Reveal({ children, delay = 0, className = '', immediate = false }: { children: React.ReactNode; delay?: number; className?: string; immediate?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(immediate);

  useEffect(() => {
    const node = ref.current;
    if (!node || immediate) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [immediate]);

  return (
    <div ref={ref} className={`${className} ${visible ? 'animate-fade-up' : 'opacity-0'}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
