"use client";

import { useId, useState, type FormEvent } from "react";
import { fieldClass, fieldErrors } from "@/components/experience/form";
import { AlertIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { ORG_KIND_LABEL } from "@/lib/opportunities";
import { PROVINCES } from "@/lib/regions";
import { StoreError, saveMyOrganization } from "@/lib/store";
import { ORG_KINDS, OrganizationInputSchema, type Organization, type OrganizationInput } from "@/lib/types";

type Key = keyof OrganizationInput;

const MESSAGES: Partial<Record<Key, string>> = {
  name: "Tulis nama usaha/organisasi (2–120 karakter).",
  province: "Pilih provinsi.",
  city: "Tulis kota atau kabupaten.",
  contactName: "Tulis nama orang yang bisa dihubungi.",
  contact: "Isi nomor WhatsApp (08…) atau email yang valid.",
  description: "Deskripsi paling panjang 600 karakter.",
};

/** Data mitra: diisi sekali saat pertama kali membuka lowongan, bisa diubah kapan saja. */
export function OrganizationForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: Organization | null;
  onSaved: (org: Organization) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState<OrganizationInput>(
    initial ?? { name: "", kind: "umkm", province: "Jawa Timur", city: "", contactName: "", contact: "", description: "" },
  );
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends Key>(key: K, v: OrganizationInput[K]) => setValue((prev) => ({ ...prev, [key]: v }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = OrganizationInputSchema.safeParse(value);
    if (!parsed.success) {
      setErrors(fieldErrors<Key>(parsed.error.issues, MESSAGES));
      return;
    }
    setErrors({});
    setFailure(null);
    setBusy(true);
    try {
      onSaved(await saveMyOrganization(parsed.data));
    } catch (error) {
      setFailure(error instanceof StoreError ? error.message : "Data mitra gagal disimpan. Coba lagi.");
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
    <form noValidate onSubmit={submit} className="card grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
      <label className="text-sm font-emphasis sm:col-span-2">
        Nama usaha atau organisasi
        <input className={fieldClass} value={value.name} maxLength={120} onChange={(e) => set("name", e.target.value)} {...a11y("name")} />
        {err("name")}
      </label>
      <label className="text-sm font-emphasis">
        Jenis
        <select className={fieldClass} value={value.kind} onChange={(e) => set("kind", e.target.value as OrganizationInput["kind"])}>
          {ORG_KINDS.map((k) => (
            <option key={k} value={k}>
              {ORG_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-emphasis">
        Provinsi
        <select
          className={fieldClass}
          value={value.province}
          onChange={(e) => set("province", e.target.value as OrganizationInput["province"])}
          {...a11y("province")}
        >
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
        <input className={fieldClass} value={value.city} maxLength={80} onChange={(e) => set("city", e.target.value)} {...a11y("city")} />
        {err("city")}
      </label>
      <label className="text-sm font-emphasis">
        Nama kontak
        <input
          className={fieldClass}
          value={value.contactName}
          maxLength={80}
          autoComplete="name"
          onChange={(e) => set("contactName", e.target.value)}
          {...a11y("contactName")}
        />
        {err("contactName")}
      </label>
      <label className="text-sm font-emphasis sm:col-span-2">
        WhatsApp atau email kontak
        <input
          className={fieldClass}
          value={value.contact}
          maxLength={120}
          placeholder="08123456789 atau nama@usaha.id"
          onChange={(e) => set("contact", e.target.value)}
          {...a11y("contact")}
        />
        <span className="mt-1 block text-xs text-ink-muted">Hanya terlihat oleh tim TitikNol, tidak ditampilkan ke talenta.</span>
        {err("contact")}
      </label>
      <label className="text-sm font-emphasis sm:col-span-2">
        Tentang usaha/organisasimu <span className="font-medium text-ink-muted">(opsional)</span>
        <textarea
          className={`${fieldClass} min-h-24`}
          value={value.description ?? ""}
          maxLength={600}
          onChange={(e) => set("description", e.target.value)}
          {...a11y("description")}
        />
        {err("description")}
      </label>

      {failure && (
        <p role="alert" className="flex gap-2 rounded-2xl border-2 border-danger/40 bg-danger-soft px-4 py-3 text-sm sm:col-span-2">
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          {failure}
        </p>
      )}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className={buttonClass("primary", "lg")}>
          {busy ? "Menyimpan…" : initial ? "Simpan data mitra" : "Daftar sebagai mitra"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={buttonClass("ghost")}>
            Batal
          </button>
        )}
      </div>
    </form>
  );
}
