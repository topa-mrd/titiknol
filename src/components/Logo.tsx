type LogoMarkProps = { className?: string };

/** Lingkaran "nol" dengan satu "titik" di tengah, oranye hangat. */
export function LogoMark({ className }: LogoMarkProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      <rect width="32" height="32" rx="10" fill="var(--color-brand)" />
      <circle cx="16" cy="15" r="8" fill="none" stroke="#ffffff" strokeWidth="3.5" />
      <circle cx="16" cy="15" r="3" fill="var(--color-on-brand)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark className="size-8 shrink-0" />
      <span className="font-display text-xl font-black tracking-display text-brand-ink">
        Titik<span className="text-ink">Nol</span>
      </span>
    </span>
  );
}
