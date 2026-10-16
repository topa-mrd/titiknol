"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { MATCH_STATUS_LABEL, matchPlaceLabel } from "@/lib/opportunities";
import { PROVINCES } from "@/lib/regions";
import { loginHref } from "@/lib/safe-next";
import { play } from "@/lib/sound";
import { StoreError, acceptMatchOffer, cancelMatchRequest, declineMatchOffer, requestMatch } from "@/lib/store";
import { ContactSchema, type Application, type MatchPlace, type MatchRequest, type MatchRequestInput, type Opportunity } from "@/lib/types";
import { AlertIcon, ArrowRightIcon } from "../icons";
import { Mascot } from "../Mascot";
import { buttonClass } from "../ui";
import { fieldClass } from "./form";
import { OpportunityCard } from "./OpportunityCard";

type RoadmapChoice = { id: string; title: string; planTitle: string };

type Props = {
  signedIn: boolean;
  roadmaps: RoadmapChoice[];
  request: MatchRequest | null;
  /** Lowongan yang sedang ditawarkan (dicari dari daftar lowongan terbuka). */
  offered: Opportunity | null;
  onChange: (request: MatchRequest | null) => void;
  onAccepted: (application: Application) => void;
};

/**
 * "Biar kami yang carikan": talenta meminta tim TitikNol mencarikan proyek sesuai
 * roadmap yang dipilih. Memilih lowongan sendiri di bawahnya tetap bisa.
 */
export function MatchRequestPanel({ signedIn, roadmaps, request, offered, onChange, onAccepted }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      play("galat");
      setError(e instanceof StoreError ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const headingId = `${id}-title`;
  const alert = error && (
    <p role="alert" className="mt-4 flex gap-2 rounded-2xl border-2 border-danger/40 bg-danger-soft px-4 py-3 text-sm">
      <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
      {error}
    </p>
  );

  let body;
  if (!signedIn) {
    body = (
      <>
        <Intro />
        <Link href={loginHref("/experience")} className={`${buttonClass("primary")} mt-5`}>
          Masuk untuk minta dicarikan
        </Link>
      </>
    );
  } else if (roadmaps.length === 0) {
    body = (
      <>
        <p className="mt-2 max-w-prose leading-relaxed text-ink-muted">
          Kami mencarikan proyek sesuai jalan yang kamu pilih. Simpan roadmap dulu, lalu kembali ke sini.
        </p>
        <Link href="/start" className={`${buttonClass("secondary")} mt-5`}>
          Ceritakan mimpimu
          <ArrowRightIcon className="size-4" />
        </Link>
      </>
    );
  } else if (request?.status === "ditawarkan") {
    body = (
      <>
        <p className="mt-2 max-w-prose leading-relaxed">
          Tim TitikNol menemukan proyek yang cocok dengan roadmap “{request.planTitle}”. Kalau kamu terima, pendaftaranmu
          langsung diteruskan ke mitra beserta kontakmu.
        </p>
        {request.adminNote && (
          <p className="mt-3 rounded-xl bg-sky-soft px-3 py-2 text-sm leading-relaxed">
            <span className="font-emphasis">Pesan tim TitikNol:</span> {request.adminNote}
          </p>
        )}
        <div className="mt-4">
          {offered ? (
            <OpportunityCard opportunity={offered} headingLevel={3} />
          ) : (
            <p className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">
              Lowongan yang ditawarkan sudah ditutup. Tolak tawaran ini supaya kami carikan yang lain.
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {offered && (
            <button
              type="button"
              disabled={busy}
              className={buttonClass("primary")}
              onClick={() =>
                void run(async () => {
                  const application = await acceptMatchOffer(request.id);
                  play("benar");
                  onAccepted(application);
                }, "Tawaran gagal diterima. Coba lagi.")
              }
            >
              {busy ? "Menyimpan…" : "Terima tawaran"}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            className={buttonClass("secondary")}
            onClick={() => void run(async () => onChange(await declineMatchOffer(request.id)), "Tawaran gagal ditolak. Coba lagi.")}
          >
            Tolak, carikan yang lain
          </button>
        </div>
      </>
    );
  } else if (request?.status === "menunggu") {
    body = (
      <>
        <p className="mt-2 max-w-prose leading-relaxed">
          Tim TitikNol sedang mencarikan proyek yang cocok dengan roadmap “{request.planTitle}”. Tawarannya muncul di sini,
          dan kami juga bisa mengabarimu lewat {request.contact}.
        </p>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-ink-muted">Daerah</dt>
            <dd className="font-emphasis">{matchPlaceLabel(request.place)}</dd>
          </div>
          {request.declined.length > 0 && (
            <div className="flex gap-1.5">
              <dt className="text-ink-muted">Sudah kamu tolak</dt>
              <dd className="font-emphasis">{request.declined.join(", ")}</dd>
            </div>
          )}
        </dl>
        {request.adminNote && (
          <p className="mt-3 rounded-xl bg-sky-soft px-3 py-2 text-sm leading-relaxed">
            <span className="font-emphasis">Pesan tim TitikNol:</span> {request.adminNote}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          className={`${buttonClass("ghost")} mt-3 -ml-3`}
          onClick={() =>
            void run(async () => {
              await cancelMatchRequest(request.id);
              onChange(null);
            }, "Permintaan gagal dibatalkan. Coba lagi.")
          }
        >
          Batalkan permintaan
        </button>
      </>
    );
  } else if (open) {
    body = (
      <RequestForm
        roadmaps={roadmaps}
        busy={busy}
        onCancel={() => {
          setOpen(false);
          setError(null);
        }}
        onSubmit={(input) =>
          run(async () => {
            const created = await requestMatch(input);
            play("benar");
            setOpen(false);
            onChange(created);
          }, "Permintaan gagal dikirim. Periksa koneksimu lalu coba lagi.")
        }
      />
    );
  } else {
    body = (
      <>
        <Intro />
        <button type="button" className={`${buttonClass("primary")} mt-5`} onClick={() => setOpen(true)}>
          Carikan untukku
          <ArrowRightIcon className="size-4" />
        </button>
      </>
    );
  }

  return (
    <section id="dicarikan" aria-labelledby={headingId} className="mt-8 scroll-mt-24 rounded-card border-2 border-b-4 border-brand/40 bg-brand-soft/40 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <Mascot pose={request?.status === "ditawarkan" ? "cheer" : "think"} idle={false} className="hidden h-20 w-auto shrink-0 sm:block" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={headingId} className="font-display text-xl font-heading tracking-display">
              {request?.status === "ditawarkan" ? "Ada tawaran untukmu" : "Biar kami yang carikan"}
            </h2>
            {request && (
              <span className="rounded-full bg-surface px-3 py-1 text-xs font-heading text-brand-ink">{MATCH_STATUS_LABEL[request.status]}</span>
            )}
          </div>
          {body}
          {alert}
        </div>
      </div>
    </section>
  );
}

function Intro() {
  return (
    <p className="mt-2 max-w-prose leading-relaxed text-ink-muted">
      Bingung memilih? Tim TitikNol mencarikan proyek yang sesuai roadmap dan tingkatmu, lalu menawarkannya ke kamu. Kamu tetap
      bisa memilih sendiri di bawah.
    </p>
  );
}

type FormErrors = Partial<Record<"contact" | "note", string>>;

function RequestForm({
  roadmaps,
  busy,
  onCancel,
  onSubmit,
}: {
  roadmaps: RoadmapChoice[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: MatchRequestInput) => Promise<void>;
}) {
  const id = useId();
  const [roadmapId, setRoadmapId] = useState(roadmaps[0].id);
  const [contact, setContact] = useState("");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: FormErrors = {};
    if (!ContactSchema.safeParse(contact).success) next.contact = "Isi nomor WhatsApp (08…) atau email yang valid.";
    setErrors(next);
    if (Object.keys(next).length > 0) {
      play("galat");
      return;
    }
    // Nilai daerah berasal dari daftar pilihan; store memvalidasinya lagi.
    void onSubmit({ roadmapId, contact, place: (place || null) as MatchPlace, note: note.trim() });
  };

  const chosen = roadmaps.find((r) => r.id === roadmapId) ?? roadmaps[0];

  return (
    <form noValidate onSubmit={submit} aria-label="Minta dicarikan proyek" className="mt-3 grid gap-4">
      {roadmaps.length > 1 ? (
        <label className="text-sm font-emphasis">
          Roadmap yang dipakai
          <select className={fieldClass} value={roadmapId} onChange={(e) => setRoadmapId(e.target.value)}>
            {roadmaps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <p className="rounded-xl bg-surface px-3 py-2 text-sm leading-relaxed">
        Kami mencarikan sesuai plan <span className="font-emphasis">“{chosen.planTitle}”</span>. Ringkasan roadmap ini dan
        kontakmu hanya dilihat tim TitikNol; mitra baru melihatnya setelah kamu menerima tawaran.
      </p>
      <label className="text-sm font-emphasis">
        WhatsApp atau email
        <input
          className={fieldClass}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          inputMode="email"
          autoComplete="email"
          placeholder="08123456789 atau nama@gmail.com"
          aria-invalid={!!errors.contact || undefined}
          aria-describedby={errors.contact ? `${id}-contact-error` : undefined}
        />
        {errors.contact && (
          <span id={`${id}-contact-error`} className="mt-1.5 flex items-center gap-1.5 text-sm font-emphasis text-danger">
            <AlertIcon className="size-4 shrink-0" />
            {errors.contact}
          </span>
        )}
      </label>
      <label className="text-sm font-emphasis">
        Daerah yang kamu mau
        <select className={fieldClass} value={place} onChange={(e) => setPlace(e.target.value)}>
          <option value="">{matchPlaceLabel(null)}</option>
          <option value="online">{matchPlaceLabel("online")}</option>
          {PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-emphasis">
        Catatan untuk tim TitikNol <span className="font-medium text-ink-muted">(opsional)</span>
        <textarea
          className={`${fieldClass} min-h-20`}
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Mis. bisa kerja sore hari, punya laptop sendiri."
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className={buttonClass("primary")}>
          {busy ? "Mengirim…" : "Kirim permintaan"}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass("ghost")}>
          Batal
        </button>
      </div>
    </form>
  );
}
