import { getStatus } from "@/lib/server/status";

/**
 * Sama dengan /api/status: tampil bila AI berjalan dalam mode tiruan.
 * Dirender di server dari env build/runtime, jadi tidak ada request tambahan
 * maupun pergeseran layout.
 */
export function DemoBanner() {
  if (getStatus().ai !== "mock") return null;
  return (
    <p className="flex items-center justify-center gap-2 bg-sun-soft px-4 py-2 text-center text-xs font-emphasis text-on-sun sm:text-sm">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-sun" />
      Mode demo: jawaban AI masih tiruan.
    </p>
  );
}
