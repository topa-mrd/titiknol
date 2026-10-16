/**
 * Kurs perkiraan ke rupiah untuk mengonversi biaya hasil pencarian web
 * (kuliah luar negeri sering tertulis dalam mata uang asing). Sengaja kasar:
 * hasil selalu rentang yang dilebarkan dan diberi catatan "kurs perkiraan".
 * USD bisa ditimpa lewat env PRICE_USD_IDR.
 */
export const FX_IDR: Record<string, number> = {
  IDR: 1,
  USD: 16_500,
  EUR: 18_000,
  GBP: 21_000,
  AUD: 10_800,
  NZD: 9_800,
  CAD: 12_000,
  SGD: 12_300,
  MYR: 3_600,
  JPY: 110,
  KRW: 12,
  CNY: 2_300,
  TWD: 520,
  HKD: 2_100,
  CHF: 18_800,
  SEK: 1_550,
  NOK: 1_550,
  DKK: 2_400,
  THB: 470,
};

/** Rentang rupiah dari jumlah dalam mata uang lain (−3% / +6% untuk selisih kurs dan biaya transfer). null bila mata uang tidak dikenal. */
export function toIdrRange(min: number, max: number, currency: string, usdRate?: number): { min: number; max: number; converted: boolean } | null {
  const code = currency.trim().toUpperCase();
  const rate = code === "USD" && usdRate && usdRate > 0 ? usdRate : FX_IDR[code];
  if (!rate) return null;
  if (code === "IDR") return { min: Math.round(min), max: Math.round(max), converted: false };
  const step = rate * max > 10_000_000 ? 100_000 : 10_000;
  const round = (n: number) => Math.max(0, Math.round(n / step) * step);
  return { min: round(min * rate * 0.97), max: round(max * rate * 1.06), converted: true };
}
