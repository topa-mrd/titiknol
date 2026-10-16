"use client";

import { useEffect, useId, useRef, useState } from "react";
import { aiAvailable } from "@/lib/ai-status";
import { costLines, extraLines, formatIdr, formatRange, summarize, withExtra, withItem, type CostLine, type ExtraLine } from "@/lib/costs";
import { postJson } from "@/lib/http-client";
import {
  CostExtraSchema,
  PriceSchema,
  SavingOptionSchema,
  type CostExtra,
  type SavingKind,
  type SavingOption,
  type CostResearchRequest,
  type ExtraCategory,
  type ResolvedStep,
  type RoadmapCosts,
} from "@/lib/types";
import Link from "next/link";
import { z } from "zod";
import { AlertIcon, CheckIcon, ExternalIcon, SparkIcon } from "./icons";
import { Sep } from "./Sep";

type Props = {
  steps: ResolvedStep[];
  costs: RoadmapCosts;
  onChange: (costs: RoadmapCosts) => void;
  saveLabel: string;
  /** Data rencana untuk mencari biaya besar (kuliah, hidup, visa…) di web. */
  research: Omit<CostResearchRequest, "existing">;
  /** Draf plan roadmap ini ada di perangkat: bisa minta revisi plan yang lebih hemat di Drafting. */
  canRevise?: boolean;
};

const ResearchResponseSchema = z.object({
  extras: z.array(CostExtraSchema),
  savings: z.array(SavingOptionSchema).default([]),
  status: z.enum(["selesai", "kosong"]),
});

type ResearchState = "idle" | "checking" | "searching" | "demo" | "error";

const UNIT_LABEL = { sekali: "sekali bayar", "per bulan": "bulan", "per semester": "semester" } as const;
const ORIGIN_LABEL = { kurasi: "dari situs resmi", ai: "perkiraan AI", koreksi: "koreksimu" } as const;
const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });

/** Kalkulator biaya sumber di roadmap: harga dari database, bisa dikoreksi, AI mencari bila kosong. */
export function CostCalculator({ steps, costs, onChange, saveLabel, research, canRevise = false }: Props) {
  const lines = costLines(steps, costs);
  const extras = extraLines(costs);
  const sum = summarize(lines, extras);
  const checkedDates = [...new Set(lines.map((l) => l.price?.checkedAt).filter(Boolean))] as string[];

  // Hasil pencarian datang belakangan: gabungkan ke biaya TERBARU, bukan salinan saat pencarian dimulai.
  const latestRef = useRef(costs);
  useEffect(() => {
    latestRef.current = costs;
  }, [costs]);
  const [state, setState] = useState<ResearchState>("idle");
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const runResearch = async () => {
    setError(null);
    setState("searching");
    const existing = lines.filter((l) => l.price && l.price.max > 0).map((l) => l.resource.title);
    const result = await postJson("/api/costs", { ...research, existing }, ResearchResponseSchema, 90_000);
    if (!result.ok) {
      setState("error");
      setError(result.error);
      return;
    }
    setState("idle");
    onChange({ ...latestRef.current, extras: result.data.extras, savings: result.data.savings, extrasStatus: result.data.status });
  };

  // Sekali per roadmap: cari biaya besar otomatis bila AI aktif dan belum pernah dicari.
  useEffect(() => {
    if (costs.extrasStatus !== "belum" || startedRef.current) return;
    startedRef.current = true;
    let active = true;
    const timer = setTimeout(() => {
      setState("checking");
      void aiAvailable().then((ok) => {
        if (!active) return;
        if (ok) void runResearch();
        else setState("demo");
      });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dijalankan sekali saat kalkulator tampil
  }, []);

  if (lines.length === 0 && extras.length === 0 && state === "demo") return null;

  return (
    <section aria-labelledby="cost-title" className="card">
      <div className="border-b border-line p-5 sm:p-6">
        <h2 id="cost-title" className="text-xl font-display font-heading tracking-display">
          Kalkulator biaya
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          Perkiraan biaya roadmap ini: sumber belajar, ditambah biaya besar seperti kuliah dan biaya hidup. Hapus centang
          yang tidak kamu ambil, atau koreksi harganya.
        </p>
        <div className="mt-5 border-t-2 border-line pt-4" aria-live="polite">
          <p className="text-sm font-emphasis text-ink-muted">Perkiraan total</p>
          <p id="cost-total" className="mt-1 font-display text-3xl font-black tracking-display text-brand-ink tabular-nums sm:text-4xl">
            {sum.taken === 0 ? formatIdr(0) : formatRange({ min: sum.min, max: sum.max })}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {sum.taken} sumber diambil
            {sum.extras > 0 && (
              <>
                <Sep />
                {sum.extras} biaya besar
              </>
            )}
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

      {lines.length > 0 && (
        <section aria-labelledby="cost-sources">
          <h3 id="cost-sources" className="border-b border-line bg-surface-muted px-5 py-2.5 text-sm font-heading tracking-wide text-ink-muted uppercase sm:px-6">
            Sumber belajar
          </h3>
          <ul className="divide-y divide-line">
            {lines.map((line) => (
              <CostRow key={line.resource.id} line={line} onChange={(patch) => onChange(withItem(costs, line, patch))} />
            ))}
          </ul>
        </section>
      )}

      <BigCosts
        extras={extras}
        status={costs.extrasStatus}
        state={state}
        error={error}
        onRetry={() => void runResearch()}
        onChange={(id, patch) => onChange(withExtra(costs, id, patch))}
      />

      <Savings savings={costs.savings} status={costs.extrasStatus} state={state} canRevise={canRevise} />

      <div className="border-t border-line p-5 text-xs leading-relaxed text-ink-muted sm:px-6">
        <p>
          Harga dari situs resmi{checkedDates.length > 0 && <> dicek {dateFormat.format(new Date(checkedDates.sort()[0]))}</>}
          ; “perkiraan AI” berasal dari pencarian web dan bisa keliru, termasuk biaya kuliah dan biaya hidup yang dikonversi dengan kurs perkiraan. Harga bisa berubah, jadi selalu cek situs resminya
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

// ───────────────────────── Biaya besar (kuliah, hidup, visa…) ─────────────────────────

const EXTRA_UNIT_LABEL = { sekali: "sekali bayar", "per bulan": "bulan", "per semester": "semester", "per tahun": "tahun" } as const;
const CATEGORY_LABEL: Record<ExtraCategory, string> = {
  pendidikan: "Kuliah",
  hidup: "Biaya hidup",
  perjalanan: "Perjalanan",
  dokumen: "Dokumen",
  tes: "Tes",
  perangkat: "Perangkat",
  lainnya: "Lainnya",
};
/** Pengingat per jenis biaya, selalu tampil. */
const ROW_HINT: Partial<Record<ExtraCategory, string>> = {
  hidup: "Bisa meleset: tergantung kota, gaya hidup, dan kurs. Sesuaikan dengan rencanamu sendiri.",
  pendidikan: "Bisa jauh lebih murah atau gratis lewat golongan UKT, bantuan biaya, atau beasiswa. Lihat opsi lebih hemat.",
};

const hostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "sumber";
  }
};

function BigCosts({
  extras,
  status,
  state,
  error,
  onRetry,
  onChange,
}: {
  extras: ExtraLine[];
  status: RoadmapCosts["extrasStatus"];
  state: ResearchState;
  error: string | null;
  onRetry: () => void;
  onChange: (id: string, patch: Partial<Pick<CostExtra, "included" | "qty" | "amount">>) => void;
}) {
  const busy = state === "searching" || state === "checking";
  return (
    <section aria-labelledby="cost-big" aria-busy={busy} className="border-t border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-muted px-5 py-2.5 sm:px-6">
        <h3 id="cost-big" className="text-sm font-heading tracking-wide text-ink-muted uppercase">
          Biaya besar lainnya
        </h3>
        {!busy && state !== "demo" && status !== "belum" && (
          <button type="button" onClick={onRetry} className="text-xs font-emphasis text-link underline decoration-link/40 underline-offset-4 hover:decoration-link">
            Cari ulang
          </button>
        )}
      </div>

      <p aria-live="polite" className={busy || state === "demo" || (status === "kosong" && !busy) ? "px-5 pt-4 text-sm leading-relaxed text-ink-muted sm:px-6" : "sr-only"}>
        {busy
          ? "Mencari biaya kuliah, biaya hidup, dan perjalanan untuk rencanamu di web…"
          : state === "demo"
            ? "Biaya kuliah, biaya hidup, dan perjalanan dicari AI dari web. Di mode demo bagian ini belum aktif."
            : status === "kosong"
              ? "Tidak ada biaya besar bersumber yang ditemukan untuk rencana ini, misalnya karena rencanamu tidak membutuhkan kuliah atau pindah kota."
              : extras.length > 0
                ? `${extras.length} biaya besar ditemukan.`
                : ""}
      </p>

      {/* Pengingat tetap: angka di bagian ini selalu patokan, dan biaya kuliah sering bisa ditekan. */}
      <div className="mx-5 mt-4 flex gap-2.5 rounded-2xl bg-sun-soft px-4 py-3 text-sm leading-relaxed text-on-sun sm:mx-6">
        <AlertIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-heading">Patokan, bukan kepastian.</strong> Biaya hidup bisa meleset jauh tergantung kota, gaya
          hidup, dan kurs. Biaya kuliah sering bisa jauh lebih murah, bahkan gratis, lewat golongan UKT, bantuan biaya, atau
          beasiswa. Lihat <a href="#opsi-hemat" className="font-heading underline underline-offset-4">opsi lebih hemat</a> di bawah.
        </p>
      </div>

      {busy && (
        <div aria-hidden="true" className="space-y-3 px-5 py-4 sm:px-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface-muted" />
          ))}
        </div>
      )}

      {state === "error" && error && (
        <div role="alert" className="mx-5 my-4 flex flex-wrap items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm sm:mx-6">
          <AlertIcon className="size-4 shrink-0 text-danger" />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={onRetry} className="font-emphasis text-link underline decoration-link/40 underline-offset-4">
            Coba lagi
          </button>
        </div>
      )}

      {!busy && extras.length > 0 && (
        <ul className="divide-y divide-line">
          {extras.map((line) => (
            <ExtraRow key={line.extra.id} line={line} onChange={(patch) => onChange(line.extra.id, patch)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ExtraRow({ line, onChange }: { line: ExtraLine; onChange: (patch: Partial<Pick<CostExtra, "included" | "qty" | "amount">>) => void }) {
  const id = useId();
  const { extra, total } = line;
  const repeatable = extra.unit !== "sekali";
  const per = EXTRA_UNIT_LABEL[extra.unit];
  return (
    <li className={`p-5 sm:px-6 ${extra.included ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-3">
        <input
          id={`${id}-take`}
          type="checkbox"
          checked={extra.included}
          onChange={(e) => onChange({ included: e.target.checked })}
          className="mt-1 size-5 shrink-0 cursor-pointer accent-[var(--color-leaf)]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <label htmlFor={`${id}-take`} className="cursor-pointer font-emphasis">
              {extra.label}
            </label>
            <p className="font-display font-heading tabular-nums">{formatRange(total)}</p>
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">
            <span className="inline-flex items-center rounded-full bg-sun-soft px-2 py-0.5 text-xs font-heading text-on-sun">{CATEGORY_LABEL[extra.category]}</span>
            <Sep />
            {formatRange({ min: extra.min, max: extra.max })} {repeatable ? `per ${per}` : per}
            {repeatable && <> × {extra.qty}</>}
            <Sep />
            <span className="font-medium text-ink">perkiraan AI</span>
            <Sep />
            <a href={extra.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-emphasis text-link underline decoration-link/40 underline-offset-4 hover:decoration-link">
              {hostLabel(extra.sourceUrl)}
              <span className="sr-only"> (sumber {extra.label}, tab baru)</span>
              <ExternalIcon className="ml-0.5 inline size-3.5 align-[-2px]" />
            </a>
          </p>
          {extra.note && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{extra.note}</p>}
          {ROW_HINT[extra.category] && (
            <p className="mt-1.5 flex gap-1.5 text-xs leading-relaxed font-medium text-ink">
              <SparkIcon className="mt-px size-3.5 shrink-0 text-leaf-ink" />
              {ROW_HINT[extra.category]}
            </p>
          )}

          {extra.included && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-xs font-emphasis text-ink-muted">
                Harga menurutmu{repeatable ? ` per ${per}` : ""}
                <span className="mt-1 flex items-center rounded-2xl border-2 border-line-strong bg-surface focus-within:border-sky">
                  <span className="pl-3 text-sm text-ink-muted">Rp</span>
                  <input
                    inputMode="numeric"
                    value={extra.amount === null ? "" : extra.amount.toLocaleString("id-ID")}
                    placeholder={extra.min.toLocaleString("id-ID")}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                      onChange({ amount: digits ? Math.min(2_000_000_000, Number(digits)) : null });
                    }}
                    aria-label={`Harga ${extra.label} menurutmu dalam rupiah`}
                    className="w-36 bg-transparent px-2 py-2 text-sm font-medium text-ink tabular-nums focus:outline-none"
                  />
                </span>
              </label>
              {repeatable && (
                <label className="text-xs font-emphasis text-ink-muted">
                  Lama ({per})
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={extra.qty}
                    onChange={(e) => onChange({ qty: Math.min(120, Math.max(1, Number(e.target.value) || 1)) })}
                    className="mt-1 block w-20 rounded-2xl border-2 border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink focus:border-sky focus:outline-none"
                  />
                </label>
              )}
              {extra.amount !== null && (
                <button type="button" onClick={() => onChange({ amount: null })} className="pb-2 text-xs font-emphasis text-link underline decoration-link/40 underline-offset-4 hover:decoration-link">
                  Pakai perkiraan
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// ───────────────────────── Opsi lebih hemat ─────────────────────────

const KIND: Record<SavingKind, { label: string; tone: string }> = {
  beasiswa: { label: "Beasiswa", tone: "bg-leaf-soft text-leaf-ink" },
  bantuan: { label: "Bantuan biaya", tone: "bg-sky-soft text-link" },
  "lebih-murah": { label: "Lebih murah", tone: "bg-sun-soft text-on-sun" },
  gratis: { label: "Gratis", tone: "bg-leaf-soft text-leaf-ink" },
};

function Savings({
  savings,
  status,
  state,
  canRevise,
}: {
  savings: SavingOption[];
  status: RoadmapCosts["extrasStatus"];
  state: ResearchState;
  canRevise: boolean;
}) {
  const busy = state === "searching" || state === "checking";
  return (
    <section id="opsi-hemat" aria-labelledby="cost-save" className="scroll-mt-6 border-t border-line">
      <h3 id="cost-save" className="border-b border-line bg-leaf-soft px-5 py-2.5 text-sm font-heading tracking-wide text-leaf-ink uppercase sm:px-6">
        Opsi lebih hemat
      </h3>
      <div className="px-5 py-4 sm:px-6">
        {busy ? (
          <p className="text-sm leading-relaxed text-ink-muted">Mencari beasiswa, bantuan biaya, dan alternatif yang lebih murah…</p>
        ) : savings.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {savings.map((o) => (
              <li key={o.id} className="rounded-2xl border-2 border-line p-4">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-heading ${KIND[o.kind].tone}`}>{KIND[o.kind].label}</span>
                <p className="mt-2 leading-snug font-emphasis text-balance">{o.title}</p>
                {o.covers && (
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                    <span className="font-medium text-ink">Menanggung:</span> {o.covers}
                  </p>
                )}
                {o.requirement && (
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                    <span className="font-medium text-ink">Syarat:</span> {o.requirement}
                  </p>
                )}
                <a
                  href={o.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-2 inline-flex min-h-9 items-center gap-1 text-sm font-emphasis text-link underline decoration-link/40 underline-offset-4 hover:decoration-link"
                >
                  {hostLabel(o.sourceUrl)}
                  <ExternalIcon className="size-3.5" />
                  <span className="sr-only"> (sumber {o.title}, tab baru)</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-relaxed text-ink-muted">
            {state === "demo"
              ? "Beasiswa, bantuan biaya, dan alternatif yang lebih murah dicari AI dari web. Di mode demo bagian ini belum aktif."
              : status === "belum"
                ? "Opsi lebih hemat akan dicari bersama biaya besar."
                : "Belum ada opsi hemat bersumber yang ditemukan untuk rencana ini."}
          </p>
        )}
        {savings.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            Syarat dan jadwal pendaftaran bisa berubah. Selalu cek situs resminya sebelum mendaftar.
          </p>
        )}
        {canRevise && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-relaxed">Mau jalur yang biayanya lebih ringan? Minta Gemini menyusun ulang plan-mu.</p>
            <Link href="/draft?minta=hemat" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-surface px-4 text-sm font-heading tracking-wide text-link uppercase shadow-[0_3px_0_var(--color-line)] hover:bg-surface-muted active:translate-y-0.5 active:shadow-none">
              Minta plan yang lebih hemat
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
