import type { ReactNode } from "react";
import { OPPORTUNITY_KIND_LABEL, POSITION_LABEL, locationLabel } from "@/lib/opportunities";
import type { Opportunity } from "@/lib/types";
import { Sep } from "../Sep";

const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });

/** Kartu lowongan: dipakai talenta (dengan tombol Daftar), mitra, dan admin (dengan aksi masing-masing). */
export function OpportunityCard({
  opportunity: o,
  matched = [],
  badge,
  children,
}: {
  opportunity: Opportunity;
  matched?: string[];
  /** Label status di pojok kanan atas (mis. "Menunggu verifikasi"). */
  badge?: ReactNode;
  /** Aksi/isi tambahan di bagian bawah kartu. */
  children?: ReactNode;
}) {
  return (
    <article className="card flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl leading-snug font-heading tracking-display text-balance">{o.title}</h2>
          <p className="mt-1 text-sm font-emphasis text-ink-muted">{o.orgName}</p>
        </div>
        {badge}
      </div>

      <p className="mt-2 text-sm text-ink-muted">
        <span className="font-emphasis text-ink">{locationLabel(o)}</span>
        <Sep />
        {POSITION_LABEL[o.category]}
      </p>

      <div className="mt-3 flex flex-wrap gap-2 text-xs font-emphasis">
        <span className="rounded-full bg-brand-soft px-2.5 py-1 text-brand-ink">{OPPORTUNITY_KIND_LABEL[o.kind]}</span>
        {matched.length > 0 && (
          <span className="rounded-full bg-leaf-soft px-2.5 py-1 text-leaf-ink">Cocok untukmu: {matched.join(", ")}</span>
        )}
      </div>

      <p className="mt-3 leading-relaxed">{o.description}</p>
      {o.requirements && (
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          <span className="font-emphasis text-ink">Syarat</span>
          <Sep />
          {o.requirements}
        </p>
      )}

      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-y-2 border-line py-3 text-sm">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-ink-muted">Imbalan</dt>
          <dd className="font-heading">{o.stipend}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-ink-muted">Durasi</dt>
          <dd className="font-heading">{o.duration}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-ink-muted">Kuota</dt>
          <dd className="font-heading">{o.slots} orang</dd>
        </div>
        {o.deadline && (
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-muted">Daftar sebelum</dt>
            <dd className="font-heading">{dateFormat.format(new Date(`${o.deadline}T00:00:00`))}</dd>
          </div>
        )}
      </dl>

      {children && <div className="mt-auto pt-5">{children}</div>}
    </article>
  );
}
