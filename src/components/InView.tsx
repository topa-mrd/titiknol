"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Menandai bagian dengan `data-inview="true"` sekali saat masuk layar, untuk
 * animasi CSS (benang yang ditarik). Tanpa IntersectionObserver langsung dianggap terlihat.
 */
export function InView({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setSeen(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-inview={seen ? "true" : "false"} className={className}>
      {children}
    </div>
  );
}
