/**
 * Kelas tombol bersama ala Duolingo: tebal, huruf kapital, dengan "bibir" 3D
 * yang hilang saat ditekan. Oranye hanya untuk aksi utama di tiap layar.
 */
const base =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-heading uppercase tracking-wide transition-[transform,box-shadow,background-color,border-color,color] duration-100 active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50 select-none [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-200 hover:[&>svg:last-child:not(:first-child)]:translate-x-0.5";

const variants = {
  primary: "bg-brand text-on-brand shadow-[0_4px_0_var(--color-brand-lip)] hover:bg-brand-strong",
  secondary: "border-2 border-line bg-surface text-link shadow-[0_4px_0_var(--color-line)] hover:bg-surface-muted",
  ghost: "text-ink-muted hover:bg-surface-muted hover:text-ink active:translate-y-0",
  /** Belum bisa dipakai, tapi tetap bisa diketuk untuk menampilkan alasannya. */
  inactive: "bg-line text-ink-muted shadow-[0_4px_0_#d8cab5]",
} as const;

const sizes = {
  md: "min-h-11 px-5 text-sm",
  lg: "min-h-13 px-7 text-base",
  xl: "min-h-14 px-9 text-base sm:text-lg",
} as const;

export function buttonClass(variant: keyof typeof variants = "primary", size: keyof typeof sizes = "md") {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}
