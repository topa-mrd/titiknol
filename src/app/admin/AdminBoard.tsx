"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { AlertIcon, CheckIcon, ExternalIcon } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import {
  ApplicationReviewSection,
  OpportunityReviewSection,
} from "./ExperienceAdmin";
import { Sep } from "@/components/Sep";
import { buttonClass } from "@/components/ui";
import { RESOURCE_TYPE_LABEL, REVIEW_LABEL } from "@/lib/labels";
import { loginHref } from "@/lib/safe-next";
import { StoryModerationSection } from "./StoryAdmin";
import {
  StoreError,
  getUser,
  isAdmin,
  listResourcesForAdmin,
  storeMode,
  updateResourceByAdmin,
  type AdminFilter,
} from "@/lib/store";
import {
  RESOURCE_COSTS,
  RESOURCE_LEVELS,
  RESOURCE_TYPES,
  REVIEW_STATUSES,
  type AdminResource,
  type AdminResourcePatch,
  type ReviewStatus,
} from "@/lib/types";

type Gate = "loading" | "demo" | "login" | "forbidden" | "ready";

const FILTERS: { value: AdminFilter; label: string }[] = [
  { value: "belum_dicek", label: "Belum dicek" },
  { value: "disetujui", label: "Disetujui" },
  { value: "ditolak", label: "Ditolak" },
  { value: "semua", label: "Semua" },
];

const REVIEW_TONE: Record<ReviewStatus, string> = {
  belum_dicek: "bg-sky-soft text-link",
  disetujui: "bg-leaf-soft text-leaf-ink",
  ditolak: "bg-danger-soft text-danger",
};

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

type Section = "lowongan" | "pendaftar" | "tulisan" | "katalog";

const SECTIONS: { value: Section; label: string }[] = [
  { value: "lowongan", label: "Lowongan" },
  { value: "pendaftar", label: "Pendaftar" },
  { value: "tulisan", label: "Blog & komunitas" },
  { value: "katalog", label: "Katalog sumber" },
];

/**
 * Halaman admin: verifikasi lowongan mitra, menghubungkan pendaftar ke mitra,
 * dan memeriksa katalog sumber hasil pencarian web. Mode demo: siapa pun yang
 * masuk boleh mencoba peran admin untuk lowongan & pendaftar (data di browser).
 */
export function AdminBoard() {
  const [gate, setGate] = useState<Gate>("loading");
  const [section, setSection] = useState<Section>("lowongan");
  const demo = gate === "demo";

  useEffect(() => {
    let active = true;
    (async () => {
      const user = await getUser().catch(() => null);
      if (!user) return active && setGate("login");
      if (storeMode() === "demo") return active && setGate("demo");
      const admin = await isAdmin();
      if (active) setGate(admin ? "ready" : "forbidden");
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-[2rem] leading-[1.15] font-heading tracking-display sm:text-[2.625rem]">
        Admin TitikNol
      </h1>
      <p className="mt-3 max-w-prose text-lg leading-relaxed text-ink-muted">
        Verifikasi lowongan dari mitra, hubungkan pendaftar dengan mitranya,
        jaga Blog dan Komunitas, dan periksa sumber belajar hasil pencarian web.
      </p>

      {gate === "loading" && (
        <div
          aria-hidden="true"
          className="mt-8 h-48 animate-pulse rounded-card bg-surface-muted"
        />
      )}

      {gate === "login" && (
        <GateMessage title="Masuk dulu">
          Halaman ini hanya untuk admin TitikNol.
          <Link
            href={loginHref("/admin")}
            className={`${buttonClass("primary")} mt-5`}
          >
            Masuk sebagai admin
          </Link>
        </GateMessage>
      )}

      {gate === "forbidden" && (
        <GateMessage title="Akunmu belum terdaftar sebagai admin">
          Minta admin lain menjalankan{" "}
          <code className="rounded bg-surface-muted px-1.5">
            npm run admin:add -- emailmu
          </code>
          , lalu muat ulang halaman ini.
        </GateMessage>
      )}

      {(gate === "ready" || demo) && (
        <>
          {demo && (
            <p className="mt-6 rounded-2xl bg-sun-soft px-4 py-3 text-sm leading-relaxed text-on-sun">
              <span className="font-heading">Mode demo.</span> Kamu bisa mencoba
              peran admin untuk lowongan, pendaftar, dan tulisan. Datanya tersimpan di
              browser ini saja.
            </p>
          )}
          <div
            role="tablist"
            aria-label="Bagian admin"
            className="mt-6 flex flex-wrap gap-2 border-b-2 border-line pb-4"
          >
            {SECTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="tab"
                aria-selected={section === s.value}
                onClick={() => setSection(s.value)}
                className={`min-h-11 rounded-full px-5 text-sm font-heading tracking-wide uppercase transition-colors ${
                  section === s.value
                    ? "bg-brand-soft text-brand-ink ring-2 ring-brand/40 ring-inset"
                    : "text-ink-muted hover:bg-surface-muted"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {section === "lowongan" && <OpportunityReviewSection />}
          {section === "pendaftar" && <ApplicationReviewSection />}
          {section === "tulisan" && <StoryModerationSection />}
          {section === "katalog" &&
            (demo ? (
              <GateMessage title="Admin butuh Supabase">
                Katalog sumber ada di database. Mode demo menyimpan data di
                browser saja, jadi belum ada katalog untuk diperiksa. Isi env
                Supabase lalu jalankan ulang aplikasi.
              </GateMessage>
            ) : (
              <CatalogSection />
            ))}
        </>
      )}
    </div>
  );
}

/** Katalog sumber: periksa sumber hasil pencarian web, revisi, setujui, atau tolak. */
function CatalogSection() {
  const [filter, setFilter] = useState<AdminFilter>("belum_dicek");
  const [items, setItems] = useState<AdminResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (value: AdminFilter) => {
    setItems(null);
    setError(null);
    try {
      setItems(await listResourcesForAdmin(value));
    } catch (e) {
      setError(
        e instanceof StoreError
          ? e.message
          : "Katalog gagal dimuat. Muat ulang halaman.",
      );
      setItems([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(filter), 0);
    return () => clearTimeout(t);
  }, [filter, load]);

  const save = async (item: AdminResource, patch: AdminResourcePatch) => {
    const updated = await updateResourceByAdmin(item.id, patch);
    setItems((list) =>
      (list ?? []).flatMap((r) =>
        r.id !== item.id
          ? [r]
          : filter === "semua" || updated.review === filter
            ? [updated]
            : [],
      ),
    );
    setNotice(
      `“${updated.title}” ${REVIEW_LABEL[updated.review].toLowerCase()}.`,
    );
    return updated;
  };

  return (
    <section aria-label="Katalog sumber" className="mt-6">
      <p className="max-w-prose text-ink-muted">
        Sumber dari pencarian web Gemini langsung dipakai di roadmap dengan
        label “belum dicek”. Periksa link-nya, revisi bila perlu, lalu setujui.
        Sumber yang ditolak hilang dari semua roadmap.
      </p>
      <>
        <div
          role="tablist"
          aria-label="Saring status"
          className="mt-4 flex flex-wrap gap-2"
        >
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => {
                setNotice(null);
                setFilter(f.value);
              }}
              className={`min-h-10 rounded-full px-4 text-sm font-heading tracking-wide uppercase transition-colors ${
                filter === f.value
                  ? "bg-sky-soft text-link ring-2 ring-sky/40 ring-inset"
                  : "text-ink-muted hover:bg-surface-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <p
          className="mt-4 h-5 text-sm font-emphasis text-leaf-ink"
          role="status"
          aria-live="polite"
        >
          {notice}
        </p>
        {error && (
          <p
            role="alert"
            className="mt-2 flex gap-2 rounded-2xl border-2 border-danger/40 bg-danger-soft px-4 py-3 text-sm"
          >
            <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
            {error}
          </p>
        )}

        {items === null ? (
          <div
            aria-hidden="true"
            className="mt-4 h-48 animate-pulse rounded-card bg-surface-muted"
          />
        ) : items.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line px-6 py-10 text-center font-emphasis text-ink-muted">
            <Mascot pose="cheer" idle={false} className="h-20 w-auto" />
            Tidak ada sumber dengan status ini.
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {items.map((item) => (
              <AdminItem key={item.id} item={item} onSave={save} />
            ))}
          </ul>
        )}
      </>
    </section>
  );
}

function GateMessage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card mt-8 flex flex-col items-center p-8 text-center">
      <Mascot pose="think" idle={false} className="h-24 w-auto" />
      <h2 className="mt-4 font-display text-xl font-heading">{title}</h2>
      <div className="mt-2 flex max-w-md flex-col items-center leading-relaxed text-ink-muted">
        {children}
      </div>
    </section>
  );
}

const toPatch = (r: AdminResource): AdminResourcePatch => ({
  title: r.title,
  provider: r.provider,
  type: r.type,
  url: r.url,
  cost: r.cost,
  tags: r.tags,
  level: r.level,
  note: r.note,
  review: r.review,
});

function AdminItem({
  item,
  onSave,
}: {
  item: AdminResource;
  onSave: (
    item: AdminResource,
    patch: AdminResourcePatch,
  ) => Promise<AdminResource>;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AdminResourcePatch>(() => toPatch(item));
  const [tagsText, setTagsText] = useState(item.tags.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (patch: AdminResourcePatch) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await onSave(item, patch);
      setDraft(toPatch(updated));
      setTagsText(updated.tags.join(", "));
      setEditing(false);
    } catch (e) {
      setError(
        e instanceof StoreError
          ? e.message
          : "Revisi gagal disimpan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const tags = [
      ...new Set(
        tagsText
          .split(",")
          .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
          .filter(Boolean),
      ),
    ];
    void run({ ...draft, tags });
  };

  const field =
    "mt-1.5 block w-full rounded-2xl border-2 border-line-strong bg-surface px-4 py-2.5 text-base focus:border-sky focus:outline-none";

  return (
    <li className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg leading-snug font-heading text-balance">
            {item.title}
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {item.provider}
            <Sep />
            {RESOURCE_TYPE_LABEL[item.type]}
            <Sep />
            {item.cost}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-heading ${REVIEW_TONE[item.review]}`}
        >
          {REVIEW_LABEL[item.review]}
        </span>
      </div>

      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex max-w-full items-center gap-1.5 text-sm font-emphasis break-all text-link underline decoration-link/40 underline-offset-4 hover:decoration-link"
      >
        {item.url}
        <ExternalIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className="sr-only">(buka di tab baru)</span>
      </a>
      <p className="mt-2 text-xs text-ink-muted">
        {item.origin === "web" ? "Dari pencarian web" : "Kurasi"}
        {item.sourceQuery && (
          <>
            <Sep />
            kata kunci “{item.sourceQuery}”
          </>
        )}
        <Sep />
        ditambahkan {dateFormat.format(new Date(item.createdAt))}
        {item.reviewedAt && (
          <>
            <Sep />
            dicek {dateFormat.format(new Date(item.reviewedAt))}
          </>
        )}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-3 flex gap-2 text-sm font-emphasis text-danger"
        >
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {editing ? (
        <form
          onSubmit={submit}
          className="mt-5 grid gap-4 border-t-2 border-line pt-5 sm:grid-cols-2"
        >
          <label className="text-sm font-emphasis sm:col-span-2">
            Judul
            <input
              className={field}
              value={draft.title}
              maxLength={120}
              required
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="text-sm font-emphasis">
            Penyelenggara
            <input
              className={field}
              value={draft.provider}
              maxLength={120}
              required
              onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
            />
          </label>
          <label className="text-sm font-emphasis">
            URL (https)
            <input
              className={field}
              type="url"
              value={draft.url}
              maxLength={500}
              required
              onChange={(e) =>
                setDraft({ ...draft, url: e.target.value.trim() })
              }
            />
          </label>
          <label className="text-sm font-emphasis">
            Jenis
            <select
              className={field}
              value={draft.type}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  type: e.target.value as AdminResourcePatch["type"],
                })
              }
            >
              {RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RESOURCE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-emphasis">
            Biaya
            <select
              className={field}
              value={draft.cost}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  cost: e.target.value as AdminResourcePatch["cost"],
                })
              }
            >
              {RESOURCE_COSTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-emphasis">
            Level
            <select
              className={field}
              value={draft.level}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  level: e.target.value as AdminResourcePatch["level"],
                })
              }
            >
              {RESOURCE_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-emphasis">
            Status
            <select
              className={field}
              value={draft.review}
              onChange={(e) =>
                setDraft({ ...draft, review: e.target.value as ReviewStatus })
              }
            >
              {REVIEW_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {REVIEW_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label
            className="text-sm font-emphasis sm:col-span-2"
            htmlFor={`${id}-tags`}
          >
            Tag (pisahkan dengan koma)
            <input
              id={`${id}-tags`}
              className={field}
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
            />
          </label>
          <label className="text-sm font-emphasis sm:col-span-2">
            Catatan
            <textarea
              className={`${field} min-h-20`}
              value={draft.note}
              maxLength={200}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className={buttonClass("primary")}
            >
              {busy ? "Menyimpan…" : "Simpan revisi"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(toPatch(item));
                setTagsText(item.tags.join(", "));
              }}
              className={buttonClass("ghost")}
            >
              Batal
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-5 flex flex-wrap gap-3">
          {item.review !== "disetujui" && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run({ ...toPatch(item), review: "disetujui" })
              }
              className={buttonClass("secondary")}
              aria-label={`Setujui ${item.title}`}
            >
              <CheckIcon className="size-4" strokeWidth={3} />
              Setujui
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={buttonClass("ghost")}
            aria-label={`Revisi ${item.title}`}
          >
            Revisi
          </button>
          {item.review !== "ditolak" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run({ ...toPatch(item), review: "ditolak" })}
              className={`${buttonClass("ghost")} text-danger hover:text-danger`}
              aria-label={`Tolak ${item.title}`}
            >
              Tolak
            </button>
          )}
        </div>
      )}
    </li>
  );
}
