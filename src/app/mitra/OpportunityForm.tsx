"use client";

import { useId, useState, type FormEvent } from "react";
import { fieldClass, fieldErrors } from "@/components/experience/form";
import { AlertIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { LEVEL_HINT, LEVEL_LABEL, OPPORTUNITY_KIND_LABEL, POSITION_LABEL } from "@/lib/opportunities";
import { PROVINCES } from "@/lib/regions";
import { StoreError, saveOpportunity } from "@/lib/store";
import {
  OPPORTUNITY_KINDS,
  OPPORTUNITY_LEVELS,
  OpportunityInputSchema,
  POSITION_CATEGORIES,
  type Opportunity,
  type OpportunityInput,
  type Organization,
} from "@/lib/types";

type Key = keyof OpportunityInput;

const MESSAGES: Partial<Record<Key, string>> = {
  title: "Tulis nama posisi (3–120 karakter), mis. “Magang desain grafis”.",
  description: "Jelaskan pekerjaannya minimal 20 karakter.",
  requirements: "Syarat paling panjang 600 karakter.",
  stipend: "Tulis imbalannya, mis. “Rp1.000.000 per bulan” atau “Tidak berbayar”.",
  duration: "Tulis durasinya, mis. “3 bulan”.",
  slots: "Kuota antara 1 dan 50 orang.",
  deadline: "Tanggal tidak valid.",
  tags: "Tag hanya huruf kecil, angka, dan tanda hubung (maks 8).",
};

type Draft = {
  title: string;
  category: OpportunityInput["category"];
  kind: OpportunityInput["kind"];
  province: string;
  city: string;
  remote: boolean;
  description: string;
  requirements: string;
  stipend: string;
  duration: string;
  slots: string;
  deadline: string;
  tags: string;
  level: OpportunityInput["level"] & string;
};

const fromOpportunity = (o: Opportunity | null, org: Organization): Draft => ({
  title: o?.title ?? "",
  category: o?.category ?? "desain",
  kind: o?.kind ?? "magang",
  province: o ? (o.province ?? "") : org.province,
  city: o ? o.city : org.city,
  remote: o?.remote ?? false,
  description: o?.description ?? "",
  requirements: o?.requirements ?? "",
  stipend: o?.stipend ?? "",
  duration: o?.duration ?? "",
  slots: String(o?.slots ?? 1),
  deadline: o?.deadline ?? "",
  tags: (o?.tags ?? []).join(", "),
  level: o?.level ?? "kecil",
});

/** Buat/ubah lowongan. Setiap simpan membuat lowongan menunggu verifikasi admin lagi. */
export function OpportunityForm({
  org,
  initial,
  onSaved,
  onCancel,
}: {
  org: Organization;
  initial: Opportunity | null;
  onSaved: (opportunity: Opportunity) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [d, setD] = useState<Draft>(() => fromOpportunity(initial, org));
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(key: K, v: Draft[K]) => setD((prev) => ({ ...prev, [key]: v }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input: OpportunityInput = {
      title: d.title,
      category: d.category,
      kind: d.kind,
      province: (d.province || null) as OpportunityInput["province"],
      city: d.city,
      remote: d.remote,
      description: d.description,
      requirements: d.requirements,
      stipend: d.stipend,
      duration: d.duration,
      slots: Number(d.slots),
      deadline: d.deadline || null,
      tags: [...new Set(d.tags.split(",").map((t) => t.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean))],
      level: d.level,
    };
    const parsed = OpportunityInputSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors<Key>(parsed.error.issues, MESSAGES));
      return;
    }
    setErrors({});
    setFailure(null);
    setBusy(true);
    try {
      onSaved(await saveOpportunity(parsed.data, initial?.id));
    } catch (error) {
      setFailure(error instanceof StoreError ? error.message : "Lowongan gagal disimpan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const err = (key: Key) =>
    errors[key] ? (
      <span id={`${id}-${key}`} className="mt-1.5 flex items-center gap-1.5 text-sm font-emphasis text-danger">
        <AlertIcon className="size-4 shrink-0" />
        {errors[key]}
      </span>
    ) : null;
  const a11y = (key: Key) => ({ "aria-invalid": errors[key] ? true : undefined, "aria-describedby": errors[key] ? `${id}-${key}` : undefined });

  return (
    <form noValidate onSubmit={submit} className="card grid gap-4 p-5 sm:grid-cols-2 sm:p-6" aria-label={initial ? "Ubah lowongan" : "Buat lowongan"}>
      <h3 className="font-display text-xl font-heading sm:col-span-2">{initial ? "Ubah lowongan" : "Lowongan baru"}</h3>
      <label className="text-sm font-emphasis sm:col-span-2">
        Posisi
        <input className={fieldClass} value={d.title} maxLength={120} placeholder="Mis. Magang desain grafis" onChange={(e) => set("title", e.target.value)} {...a11y("title")} />
        {err("title")}
      </label>
      <label className="text-sm font-emphasis">
        Bidang
        <select className={fieldClass} value={d.category} onChange={(e) => set("category", e.target.value as Draft["category"])}>
          {POSITION_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {POSITION_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-emphasis">
        Jenis
        <select className={fieldClass} value={d.kind} onChange={(e) => set("kind", e.target.value as Draft["kind"])}>
          {OPPORTUNITY_KINDS.map((k) => (
            <option key={k} value={k}>
              {OPPORTUNITY_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-emphasis">
        Tingkat proyek
        <select className={fieldClass} value={d.level} onChange={(e) => set("level", e.target.value as Draft["level"])} aria-describedby={`${id}-level-hint`}>
          {OPPORTUNITY_LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </select>
        <span id={`${id}-level-hint`} className="mt-1 block text-xs leading-relaxed font-medium text-ink-muted">
          {LEVEL_HINT[d.level]} Talenta baru hanya bisa mendaftar proyek kecil.
        </span>
      </label>
      <label className="text-sm font-emphasis">
        Provinsi
        <select className={fieldClass} value={d.province} onChange={(e) => set("province", e.target.value)} {...a11y("province")}>
          <option value="">Tidak ada (online saja)</option>
          {PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {err("province")}
      </label>
      <label className="text-sm font-emphasis">
        Kota atau kabupaten
        <input className={fieldClass} value={d.city} maxLength={80} onChange={(e) => set("city", e.target.value)} />
      </label>
      <label className="flex cursor-pointer items-center gap-3 text-sm font-emphasis sm:col-span-2">
        <input type="checkbox" checked={d.remote} onChange={(e) => set("remote", e.target.checked)} className="size-5 cursor-pointer accent-[var(--color-leaf)]" />
        Bisa dikerjakan online / jarak jauh
      </label>
      <label className="text-sm font-emphasis sm:col-span-2">
        Apa yang dikerjakan
        <textarea className={`${fieldClass} min-h-28`} value={d.description} maxLength={1200} onChange={(e) => set("description", e.target.value)} {...a11y("description")} />
        {err("description")}
      </label>
      <label className="text-sm font-emphasis sm:col-span-2">
        Syarat <span className="font-medium text-ink-muted">(opsional)</span>
        <textarea className={`${fieldClass} min-h-20`} value={d.requirements} maxLength={600} onChange={(e) => set("requirements", e.target.value)} {...a11y("requirements")} />
        {err("requirements")}
      </label>
      <label className="text-sm font-emphasis">
        Imbalan
        <input className={fieldClass} value={d.stipend} maxLength={80} placeholder="Rp1.000.000 per bulan" onChange={(e) => set("stipend", e.target.value)} {...a11y("stipend")} />
        {err("stipend")}
      </label>
      <label className="text-sm font-emphasis">
        Durasi
        <input className={fieldClass} value={d.duration} maxLength={60} placeholder="3 bulan" onChange={(e) => set("duration", e.target.value)} {...a11y("duration")} />
        {err("duration")}
      </label>
      <label className="text-sm font-emphasis">
        Kuota (orang)
        <input className={fieldClass} type="number" min={1} max={50} value={d.slots} onChange={(e) => set("slots", e.target.value)} {...a11y("slots")} />
        {err("slots")}
      </label>
      <label className="text-sm font-emphasis">
        Batas daftar <span className="font-medium text-ink-muted">(opsional)</span>
        <input className={fieldClass} type="date" value={d.deadline} onChange={(e) => set("deadline", e.target.value)} {...a11y("deadline")} />
        {err("deadline")}
      </label>
      <label className="text-sm font-emphasis sm:col-span-2">
        Kata kunci <span className="font-medium text-ink-muted">(opsional, pisahkan dengan koma)</span>
        <input className={fieldClass} value={d.tags} placeholder="desain, canva, umkm" onChange={(e) => set("tags", e.target.value)} {...a11y("tags")} />
        {err("tags")}
      </label>

      <p className="rounded-2xl bg-sky-soft px-4 py-3 text-sm leading-relaxed sm:col-span-2">
        Tim TitikNol mengecek lowongan sebelum tampil ke talenta. Mengubah isi lowongan yang sudah tayang membuatnya dicek ulang.
      </p>
      {failure && (
        <p role="alert" className="flex gap-2 rounded-2xl border-2 border-danger/40 bg-danger-soft px-4 py-3 text-sm sm:col-span-2">
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          {failure}
        </p>
      )}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className={buttonClass("primary", "lg")}>
          {busy ? "Menyimpan…" : initial ? "Simpan & kirim ulang" : "Kirim untuk diverifikasi"}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass("ghost")}>
          Batal
        </button>
      </div>
    </form>
  );
}
