"use client";

import { useId, useState, type ReactNode } from "react";
import { LIMITS, ProfileSchema, type Profile } from "@/lib/types";
import { buttonClass } from "../ui";
import { AlertIcon } from "../icons";

type ProfileCardProps = { profile: Profile; onSave: (profile: Profile) => void };

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function ProfileCard({ profile, onSave }: ProfileCardProps) {
  const [editing, setEditing] = useState(false);
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-display font-heading tracking-display">
          Profilmu
        </h2>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className={`${buttonClass("ghost")} -mr-2 min-h-9 px-3 text-sm`}>
            Edit profil
          </button>
        )}
      </div>
      {editing ? (
        <ProfileForm
          profile={profile}
          onCancel={() => setEditing(false)}
          onSave={(next) => {
            onSave(next);
            setEditing(false);
          }}
        />
      ) : (
        <ProfileSummary profile={profile} />
      )}
    </section>
  );
}

function ProfileSummary({ profile }: { profile: Profile }) {
  return (
    <div className="mt-3 space-y-4">
      <p className="leading-relaxed">{profile.summary}</p>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <Field label="Mimpi">{profile.dream}</Field>
        <Field label="Kondisi sekarang">{profile.currentCondition}</Field>
        <Field label="Lokasi">{profile.location ?? "Belum disebutkan"}</Field>
        <Field label="Kendala">
          <Chips items={profile.constraints} empty="Tidak ada kendala khusus" tone="bg-sun-soft" />
        </Field>
        <Field label="Modal yang kamu punya" wide>
          <Chips items={profile.strengths} empty="Belum disebutkan" tone="bg-leaf-soft" />
        </Field>
      </dl>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="font-emphasis text-ink-muted">{label}</dt>
      <dd className="mt-1 leading-relaxed">{children}</dd>
    </div>
  );
}

function Chips({ items, empty, tone }: { items: string[]; empty: string; tone: string }) {
  if (items.length === 0) return <span className="text-ink-muted">{empty}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className={`rounded-full px-2.5 py-1 font-medium ${tone}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

const inputClass =
  "mt-1.5 block w-full rounded-2xl border-2 border-line-strong bg-surface px-4 py-2.5 text-base leading-relaxed focus:border-sky focus:outline-none";

function ProfileForm({
  profile,
  onSave,
  onCancel,
}: {
  profile: Profile;
  onSave: (p: Profile) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    dream: profile.dream,
    summary: profile.summary,
    currentCondition: profile.currentCondition,
    location: profile.location ?? "",
    constraints: profile.constraints.join("\n"),
    strengths: profile.strengths.join("\n"),
  });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const save = () => {
    const parsed = ProfileSchema.safeParse({
      dream: values.dream,
      summary: values.summary,
      currentCondition: values.currentCondition,
      location: values.location.trim() || null,
      constraints: lines(values.constraints),
      strengths: lines(values.strengths),
    });
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] ?? "");
      setError(
        field === "constraints" || field === "strengths"
          ? `Maksimal ${LIMITS.list} baris, masing-masing paling panjang ${LIMITS.item} karakter.`
          : "Mimpi, ringkasan, dan kondisi tidak boleh kosong atau terlalu panjang.",
      );
      return;
    }
    onSave(parsed.data);
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="mt-4 space-y-4"
    >
      <label className="block text-sm font-emphasis">
        Mimpi
        <textarea rows={2} maxLength={LIMITS.dream} value={values.dream} onChange={set("dream")} className={inputClass} />
      </label>
      <label className="block text-sm font-emphasis">
        Ringkasan tentangmu
        <textarea rows={3} maxLength={LIMITS.text} value={values.summary} onChange={set("summary")} className={inputClass} />
      </label>
      <label className="block text-sm font-emphasis">
        Kondisi sekarang
        <textarea
          rows={2}
          maxLength={LIMITS.text}
          value={values.currentCondition}
          onChange={set("currentCondition")}
          className={inputClass}
        />
      </label>
      <label className="block text-sm font-emphasis">
        Lokasi
        <input maxLength={LIMITS.short} value={values.location} onChange={set("location")} className={inputClass} placeholder="Mis. Kediri" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-emphasis">
          Kendala <span className="font-normal text-ink-muted">(satu per baris)</span>
          <textarea rows={4} value={values.constraints} onChange={set("constraints")} className={inputClass} />
        </label>
        <label className="block text-sm font-emphasis">
          Modal yang kamu punya <span className="font-normal text-ink-muted">(satu per baris)</span>
          <textarea rows={4} value={values.strengths} onChange={set("strengths")} className={inputClass} />
        </label>
      </div>
      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm font-medium text-danger">
          <AlertIcon className="size-4 shrink-0" />
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonClass("ghost")}>
          Batal
        </button>
        <button type="submit" className={buttonClass("primary")}>
          Simpan profil
        </button>
      </div>
    </form>
  );
}
