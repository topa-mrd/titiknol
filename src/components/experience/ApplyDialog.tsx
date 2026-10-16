"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { StoreError, applyToOpportunity } from "@/lib/store";
import { ContactSchema, type Application, type Opportunity } from "@/lib/types";
import { AlertIcon, CloseIcon } from "../icons";
import { buttonClass } from "../ui";

type Props = {
  opportunity: Opportunity | null;
  /** Roadmap terbaru talenta; ringkasannya bisa dilampirkan untuk admin. */
  roadmap: { id: string; title: string } | null;
  onClose: () => void;
  onApplied: (application: Application) => void;
};

type Errors = Partial<Record<"contact" | "motivation" | "portfolioUrl" | "cvUrl", string>>;

const isHttps = (v: string) => /^https:\/\/[^\s]+\.[^\s]+/.test(v);

const field =
  "mt-1.5 block w-full rounded-2xl border-2 border-line-strong bg-surface px-4 py-2.5 text-base focus:border-sky focus:outline-none aria-invalid:border-danger";

/** Form singkat pendaftaran: kontak, alasan, link portofolio/CV, ringkasan roadmap (opsional). */
export function ApplyDialog({ opportunity, roadmap, onClose, onApplied }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const open = opportunity !== null;
  const [contact, setContact] = useState("");
  const [motivation, setMotivation] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [cvUrl, setCvUrl] = useState("");
  const [attachRoadmap, setAttachRoadmap] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const validate = (): Errors => {
    const next: Errors = {};
    if (!ContactSchema.safeParse(contact).success) next.contact = "Isi nomor WhatsApp (08…) atau email yang valid.";
    if (motivation.trim().length < 20) next.motivation = "Ceritakan alasanmu sedikit lebih panjang, minimal 20 karakter.";
    if (portfolioUrl.trim() && !isHttps(portfolioUrl.trim())) next.portfolioUrl = "Link harus diawali https://";
    if (cvUrl.trim() && !isHttps(cvUrl.trim())) next.cvUrl = "Link harus diawali https://";
    return next;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!opportunity) return;
    const found = validate();
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const application = await applyToOpportunity({
        opportunityId: opportunity.id,
        contact,
        motivation,
        portfolioUrl: portfolioUrl.trim() || null,
        cvUrl: cvUrl.trim() || null,
        roadmapId: attachRoadmap && roadmap ? roadmap.id : null,
      });
      setMotivation("");
      onApplied(application);
      ref.current?.close();
    } catch (error) {
      setFailure(error instanceof StoreError ? error.message : "Pendaftaran gagal dikirim. Periksa koneksimu lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const titleId = `${id}-title`;
  const err = (key: keyof Errors) =>
    errors[key] ? (
      <span id={`${id}-${key}-error`} className="mt-1.5 flex items-center gap-1.5 text-sm font-emphasis text-danger">
        <AlertIcon className="size-4 shrink-0" />
        {errors[key]}
      </span>
    ) : null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-full overflow-y-auto overscroll-contain rounded-t-[1.75rem] bg-surface p-0 text-ink backdrop:bg-ink/45 sm:m-auto sm:max-w-lg sm:rounded-[1.75rem]"
    >
      {opportunity && (
        <form noValidate onSubmit={submit} className="px-5 pt-3 pb-6 sm:px-7 sm:pt-6">
          <span aria-hidden="true" className="mx-auto mb-4 block h-1.5 w-12 rounded-full bg-line sm:hidden" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="font-display text-2xl leading-tight font-heading tracking-display text-balance">
                Daftar: {opportunity.title}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">{opportunity.orgName}</p>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Tutup form pendaftaran"
              className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <CloseIcon className="size-5" />
            </button>
          </div>

          <p className="mt-3 rounded-2xl bg-sky-soft px-4 py-3 text-sm leading-relaxed">
            Tim TitikNol mengecek pendaftaranmu dulu, lalu meneruskannya ke mitra. Kontakmu baru terlihat oleh mitra setelah
            diteruskan.
          </p>

          <label className="mt-5 block text-sm font-emphasis">
            WhatsApp atau email
            <input
              className={field}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              inputMode="email"
              autoComplete="email"
              placeholder="08123456789 atau nama@gmail.com"
              aria-invalid={!!errors.contact || undefined}
              aria-describedby={errors.contact ? `${id}-contact-error` : undefined}
            />
            {err("contact")}
          </label>

          <label className="mt-4 block text-sm font-emphasis">
            Kenapa kamu cocok untuk posisi ini?
            <textarea
              className={`${field} min-h-28`}
              value={motivation}
              maxLength={600}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder="Mis. aku sudah belajar Figma 3 bulan dan pernah membuat poster untuk OSIS."
              aria-invalid={!!errors.motivation || undefined}
              aria-describedby={errors.motivation ? `${id}-motivation-error` : undefined}
            />
            <span className="mt-1 block text-right text-xs text-ink-muted tabular-nums">{motivation.length}/600</span>
            {err("motivation")}
          </label>

          <label className="mt-2 block text-sm font-emphasis">
            Link portofolio <span className="font-medium text-ink-muted">(opsional)</span>
            <input
              className={field}
              type="url"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              placeholder="https://behance.net/… atau Google Drive"
              aria-invalid={!!errors.portfolioUrl || undefined}
              aria-describedby={errors.portfolioUrl ? `${id}-portfolioUrl-error` : undefined}
            />
            {err("portfolioUrl")}
          </label>

          <label className="mt-4 block text-sm font-emphasis">
            Link CV <span className="font-medium text-ink-muted">(opsional)</span>
            <input
              className={field}
              type="url"
              value={cvUrl}
              onChange={(e) => setCvUrl(e.target.value)}
              placeholder="https://drive.google.com/…"
              aria-invalid={!!errors.cvUrl || undefined}
              aria-describedby={errors.cvUrl ? `${id}-cvUrl-error` : undefined}
            />
            <span className="mt-1 block text-xs text-ink-muted">Pastikan link bisa dibuka siapa saja yang punya link-nya.</span>
            {err("cvUrl")}
          </label>

          {roadmap && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-line px-4 py-3">
              <input
                type="checkbox"
                checked={attachRoadmap}
                onChange={(e) => setAttachRoadmap(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[var(--color-leaf)]"
              />
              <span className="text-sm leading-relaxed">
                <span className="font-emphasis">Lampirkan ringkasan roadmap-ku</span>
                <span className="block text-ink-muted">“{roadmap.title}” membantu admin memahami tujuanmu.</span>
              </span>
            </label>
          )}

          {failure && (
            <p role="alert" className="mt-4 flex gap-2 rounded-2xl border-2 border-danger/40 bg-danger-soft px-4 py-3 text-sm">
              <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
              {failure}
            </p>
          )}

          <button type="submit" disabled={busy} className={`${buttonClass("primary", "lg")} mt-6 w-full`}>
            {busy ? "Mengirim…" : "Kirim pendaftaran"}
          </button>
        </form>
      )}
    </dialog>
  );
}
