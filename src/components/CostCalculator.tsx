"use client";

import { useId, useState } from "react";
import { costLines, formatIdr, formatRange, summarize, withItem, type CostLine } from "@/lib/costs";
import { PriceSchema, type ResolvedStep, type RoadmapCosts } from "@/lib/types";
import { AlertIcon, CheckIcon, ExternalIcon, SparkIcon } from "./icons";
import { Sep } from "./Sep";

type Props = {
  steps: ResolvedStep[];
  costs: RoadmapCosts;
  onChange: (costs: RoadmapCosts) => void;
  saveLabel: string;
};

const UNIT_LABEL = { sekali: "sekali bayar", "per bulan": "bulan", "per semester": "semester" } as const;
const ORIGIN_LABEL = { kurasi: "dari situs resmi", ai: "perkiraan AI", koreksi: "koreksimu" } as const;
const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });

/** Kalkulator biaya sumber di roadmap: harga dari database, bisa dikoreksi, AI mencari bila kosong. */
export function CostCalculator({ steps, costs, onChange, saveLabel }: Props) {
  const lines = costLines(steps, costs);
  const sum = summarize(lines);
  const checkedDates = [...new Set(lines.map((l) => l.price?.checkedAt).filter(Boolean))] as string[];

  if (lines.length === 0) return null;

  return (
    <section aria-labelledby="cost-title" className="card">
      <div className="border-b border-line p-5 sm:p-6">
        <h2 id="cost-title" className="text-xl font-display font-heading tracking-display">
          Kalkulator biaya
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          Perkiraan biaya sumber di roadmap ini. Hapus centang sumber yang tidak kamu ambil, atau koreksi harganya.
        </p>
        <div className="mt-5 border-t-2 border-line pt-4" aria-live="polite">
          <p className="text-sm font-emphasis text-ink-muted">Perkiraan total</p>
          <p id="cost-total" className="mt-1 font-display text-3xl font-black tracking-display text-brand-ink tabular-nums sm:text-4xl">
            {sum.taken === 0 ? formatIdr(0) : formatRange({ min: sum.min, max: sum.max })}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {sum.taken} sumber diambil
            <Sep />
            {sum.free} gratis
            {sum.unknown > 0 && (
              <>
                <Sep />
                <span className="font-medium text-danger">{sum.unknown} belum ada harga</span>
              </>
            )}
          </p>
        </div>
      </div>

      <ul className="divide-y divide-line">
        {lines.map((line) => (
          <CostRow key={line.resource.id} line={line} onChange={(patch) => onChange(withItem(costs, line, patch))} />
        ))}
      </ul>

      <div className="border-t border-line p-5 text-xs leading-relaxed text-ink-muted sm:px-6">
        <p>
          Harga dari situs resmi{checkedDates.length > 0 && <> dicek {dateFormat.format(new Date(checkedDates.sort()[0]))}</>}
          ; “perkiraan AI” berasal dari pencarian web dan bisa keliru. Harga bisa berubah, jadi selalu cek situs resminya
          sebelum membayar.
        </p>
        <p className="mt-2 flex h-4 items-center gap-1.5 font-medium" aria-live="polite">
          {saveLabel === "Tersimpan" && <CheckIcon aria-hidden="true" className="size-3.5" strokeWidth={2.5} />}
          {saveLabel}
        </p>
      </div>
    </section>
  );
}

function CostRow({ line, onChange }: { line: CostLine; onChange: (patch: Partial<CostLine["item"]>) => void }) {
  const id = useId();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { resource, item, unit, price, total, origin } = line;
  const repeatable = unit !== "sekali";

  const findPrice = async () => {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/price", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resourceId: resource.id }),
        signal: AbortSignal.timeout(60_000),
      });
      const body = (await res.json().catch(() => null)) as { price?: unknown; error?: unknown } | null;
      const parsed = PriceSchema.safeParse(body?.price);
      if (!res.ok || !parsed.success) {
        setError(typeof body?.error === "string" ? body.error : "Harga belum bisa dicari. Isi perkiraanmu sendiri.");
        return;
      }
      onChange({ estimate: parsed.data, qty: parsed.data.unit === "per bulan" ? item.qty : 1 });
    } catch {
      setError("Koneksi terputus saat mencari harga. Coba lagi, atau isi perkiraanmu sendiri.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <li className={`p-5 sm:px-6 ${item.included ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-3">
        <input
          id={`${id}-take`}
          type="checkbox"
          checked={item.included}
          onChange={(e) => onChange({ included: e.target.checked })}
          className="mt-1 size-5 shrink-0 cursor-pointer accent-[var(--color-leaf)]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <label htmlFor={`${id}-take`} className="cursor-pointer font-emphasis">
              {resource.title}
            </label>
            <p className="font-display font-heading tabular-nums">{total ? formatRange(total) : <span className="text-danger">Harga belum ada</span>}</p>
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">
            Langkah {line.stepIndex + 1}
            {price && price.max > 0 && (
              <>
                <Sep />
                {formatRange(price)} {unit === "sekali" ? "sekali bayar" : unit}
              </>
            )}
            {origin && total && total.max > 0 && (
              <>
                <Sep />
                <span className={origin === "ai" ? "font-medium text-ink" : undefined}>{ORIGIN_LABEL[origin]}</span>
              </>
            )}
            {price?.sourceUrl && (
              <>
                <Sep />
                <a href={price.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-emphasis text-link underline decoration-link/40 underline-offset-4 hover:decoration-link">
                  cek harga<span className="sr-only"> {resource.title} (tab baru)</span>
                  <ExternalIcon className="ml-0.5 inline size-3.5 align-[-2px]" />
                </a>
              </>
            )}
          </p>
          {price?.note && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{price.note}</p>}

          {item.included && (total === null || total.max > 0 || item.amount !== null) && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-xs font-emphasis text-ink-muted">
                Harga menurutmu{repeatable ? ` per ${UNIT_LABEL[unit]}` : ""}
                <span className="mt-1 flex items-center rounded-2xl border-2 border-line-strong bg-surface focus-within:border-sky">
                  <span className="pl-3 text-sm text-ink-muted">Rp</span>
                  <input
                    inputMode="numeric"
                    value={item.amount === null ? "" : item.amount.toLocaleString("id-ID")}
                    placeholder={price ? price.min.toLocaleString("id-ID") : "0"}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                      onChange({ amount: digits ? Number(digits) : null });
                    }}
                    aria-label={`Harga ${resource.title} menurutmu dalam rupiah`}
                    className="w-32 bg-transparent px-2 py-2 text-sm font-medium text-ink tabular-nums focus:outline-none"
                  />
                </span>
              </label>
              {repeatable && (
                <label className="text-xs font-emphasis text-ink-muted">
                  Lama ({UNIT_LABEL[unit]})
                  <input
                    type="number"
                    min={1}
                    max={48}
                    value={item.qty}
                    onChange={(e) => onChange({ qty: Math.min(48, Math.max(1, Number(e.target.value) || 1)) })}
                    className="mt-1 block w-20 rounded-2xl border-2 border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink focus:border-sky focus:outline-none"
                  />
                </label>
              )}
              {item.amount !== null && (
                <button type="button" onClick={() => onChange({ amount: null })} className="pb-2 text-xs font-emphasis text-link underline decoration-link/40 underline-offset-4 hover:decoration-link">
                  Pakai harga {price ? "katalog" : "kosong"}
                </button>
              )}
              {!price && (
                <button
                  type="button"
                  onClick={() => void findPrice()}
                  disabled={searching}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border-2 border-line bg-surface px-4 text-sm font-heading tracking-wide text-link uppercase shadow-[0_3px_0_var(--color-line)] hover:bg-surface-muted active:translate-y-0.5 active:shadow-none disabled:opacity-60"
                >
                  <SparkIcon className="size-4" />
                  {searching ? "Mencari di web…" : "Cari perkiraan harga (AI)"}
                </button>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="mt-2 flex gap-1.5 text-sm text-danger">
              <AlertIcon className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
