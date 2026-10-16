"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusChip } from "@/components/experience/ApplicationProgress";
import { SquadPanel } from "@/components/experience/SquadPanel";
import { OpportunityCard } from "@/components/experience/OpportunityCard";
import { fieldClass } from "@/components/experience/form";
import { AlertIcon, ExternalIcon } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { Sep } from "@/components/Sep";
import { buttonClass } from "@/components/ui";
import { APPLICATION_STATUS_LABEL, ORG_KIND_LABEL } from "@/lib/opportunities";
import { loginHref } from "@/lib/safe-next";
import {
  StoreError,
  getMyOrganization,
  getUser,
  listMyOpportunities,
  listOrgApplications,
  listOrgSquads,
  setOpportunityClosed,
  updateApplicationByOrg,
} from "@/lib/store";
import { ORG_APPLICATION_STATUSES, type Application, type ApplicationStatus, type Opportunity, type Organization, type Squad } from "@/lib/types";
import { OpportunityForm } from "./OpportunityForm";
import { OrganizationForm } from "./OrganizationForm";

type Gate = "loading" | "login" | "onboarding" | "ready" | "error";
type Tab = "lowongan" | "talenta";

const REVIEW_BADGE: Record<Opportunity["review"], { label: string; tone: string }> = {
  menunggu: { label: "Menunggu verifikasi", tone: "bg-sky-soft text-link" },
  disetujui: { label: "Tayang", tone: "bg-leaf-soft text-leaf-ink" },
  ditolak: { label: "Ditolak admin", tone: "bg-danger-soft text-danger" },
};

/** Halaman mitra: data organisasi, lowongan (dicek admin), dan talenta yang diteruskan admin. */
export function MitraBoard() {
  const [gate, setGate] = useState<Gate>("loading");
  const [org, setOrg] = useState<Organization | null>(null);
  const [editingOrg, setEditingOrg] = useState(false);
  const [tab, setTab] = useState<Tab>("lowongan");
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null);
  const [talents, setTalents] = useState<Application[] | null>(null);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [form, setForm] = useState<{ initial: Opportunity | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [opps, apps, teams] = await Promise.all([
        listMyOpportunities(),
        listOrgApplications(),
        listOrgSquads().catch(() => [] as Squad[]),
      ]);
      setOpportunities(opps);
      setTalents(apps);
      setSquads(teams);
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Data mitra gagal dimuat. Muat ulang halaman.");
      setOpportunities([]);
      setTalents([]);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const user = await getUser().catch(() => null);
      if (!user) return active && setGate("login");
      let mine: Organization | null;
      try {
        mine = await getMyOrganization();
      } catch (e) {
        // Jangan menampilkan form "daftar mitra" hanya karena koneksi gagal.
        if (!active) return;
        setError(e instanceof StoreError ? e.message : "Data mitra gagal dimuat. Periksa internetmu lalu muat ulang halaman.");
        return setGate("error");
      }
      if (!active) return;
      setOrg(mine);
      setGate(mine ? "ready" : "onboarding");
      if (mine) void loadAll();
    })();
    return () => {
      active = false;
    };
  }, [loadAll]);

  const upsertOpp = (o: Opportunity) =>
    setOpportunities((list) => [o, ...(list ?? []).filter((x) => x.id !== o.id)]);

  const toggleClosed = async (o: Opportunity) => {
    try {
      upsertOpp(await setOpportunityClosed(o.id, !o.closed));
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Status lowongan gagal diubah. Coba lagi.");
    }
  };

  const waiting = (talents ?? []).filter((t) => t.status === "diteruskan").length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-[2rem] leading-[1.15] font-heading tracking-display text-balance sm:text-[2.625rem]">
        Ruang mitra
      </h1>
      <p className="mt-3 max-w-prose text-lg leading-relaxed text-pretty text-ink-muted">
        Buka lowongan magang, proyek, atau kerja untuk anak muda dari berbagai daerah. Tim TitikNol mengecek lowonganmu,
        menyeleksi pendaftar, lalu meneruskan talenta yang cocok ke sini.
      </p>

      {gate === "loading" && <div aria-hidden="true" className="mt-8 h-56 animate-pulse rounded-card bg-surface-muted" />}

      {gate === "error" && (
        <section className="card mt-8 flex flex-col items-center p-8 text-center">
          <Mascot pose="think" idle={false} className="h-24 w-auto" />
          <h2 className="mt-4 font-display text-xl font-heading">Data mitra belum bisa dimuat</h2>
          <p role="alert" className="mt-2 max-w-md text-ink-muted">
            {error}
          </p>
          <button type="button" onClick={() => window.location.reload()} className={`${buttonClass("primary")} mt-5`}>
            Muat ulang
          </button>
        </section>
      )}

      {gate === "login" && (
        <section className="card mt-8 flex flex-col items-center p-8 text-center">
          <Mascot pose="wave" idle={false} className="h-24 w-auto" />
          <h2 className="mt-4 font-display text-xl font-heading">Masuk untuk membuka lowongan</h2>
          <p className="mt-2 max-w-md text-ink-muted">Pakai akun yang sama untuk mengelola lowongan dan talentamu.</p>
          <Link href={loginHref("/mitra")} className={`${buttonClass("primary")} mt-5`}>
            Masuk sebagai mitra
          </Link>
        </section>
      )}

      {gate === "onboarding" && (
        <section className="mt-8" aria-labelledby="onboarding-title">
          <h2 id="onboarding-title" className="font-display text-xl font-heading">
            Kenalkan usaha atau organisasimu
          </h2>
          <p className="mt-1 mb-4 text-ink-muted">Diisi sekali. Nama dan daerah tampil di lowonganmu; kontak hanya untuk tim TitikNol.</p>
          <OrganizationForm
            initial={null}
            onSaved={(saved) => {
              setOrg(saved);
              setGate("ready");
              setOpportunities([]);
              setTalents([]);
              setForm({ initial: null });
            }}
          />
        </section>
      )}

      {gate === "ready" && org && (
        <>
          {editingOrg ? (
            <div className="mt-8">
              <OrganizationForm
                initial={org}
                onSaved={(saved) => {
                  setOrg(saved);
                  setEditingOrg(false);
                  setOpportunities((list) => (list ?? []).map((o) => ({ ...o, orgName: saved.name, orgKind: saved.kind })));
                }}
                onCancel={() => setEditingOrg(false)}
              />
            </div>
          ) : (
            <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-card bg-surface-muted p-5">
              <div>
                <p className="font-display text-lg font-heading">{org.name}</p>
                <p className="text-sm text-ink-muted">
                  {ORG_KIND_LABEL[org.kind]}
                  <Sep />
                  {org.city}, {org.province}
                  <Sep />
                  kontak {org.contactName}
                </p>
              </div>
              <button type="button" onClick={() => setEditingOrg(true)} className={buttonClass("ghost")}>
                Ubah data mitra
              </button>
            </section>
          )}

          {error && (
            <p role="alert" className="mt-4 flex gap-2 rounded-2xl border-2 border-danger/40 bg-danger-soft px-4 py-3 text-sm">
              <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
              {error}
            </p>
          )}
          <p role="status" aria-live="polite" className="mt-4 min-h-5 text-sm font-emphasis text-leaf-ink">
            {notice}
          </p>

          <div role="tablist" aria-label="Bagian mitra" className="mt-2 flex flex-wrap gap-2">
            {(["lowongan", "talenta"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`min-h-11 rounded-full px-5 text-sm font-heading tracking-wide uppercase transition-colors ${
                  tab === t ? "bg-sky-soft text-link ring-2 ring-sky/40 ring-inset" : "text-ink-muted hover:bg-surface-muted"
                }`}
              >
                {t === "lowongan" ? "Lowongan" : "Talenta"}
                {t === "talenta" && waiting > 0 && (
                  <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs text-on-brand">{waiting} baru</span>
                )}
              </button>
            ))}
          </div>

          {tab === "lowongan" && (
            <section className="mt-6" aria-label="Lowongan saya">
              {form ? (
                <OpportunityForm
                  org={org}
                  initial={form.initial}
                  onSaved={(o) => {
                    upsertOpp(o);
                    setForm(null);
                    setNotice("Lowongan dikirim. Tim TitikNol akan mengeceknya sebelum tayang.");
                  }}
                  onCancel={() => setForm(null)}
                />
              ) : (
                <button type="button" onClick={() => { setNotice(null); setForm({ initial: null }); }} className={buttonClass("primary")}>
                  Buat lowongan
                </button>
              )}

              {opportunities === null ? (
                <div aria-hidden="true" className="mt-6 h-64 animate-pulse rounded-card bg-surface-muted" />
              ) : opportunities.length === 0 ? (
                !form && (
                  <p className="mt-6 rounded-card border-2 border-dashed border-line px-6 py-10 text-center font-emphasis text-ink-muted">
                    Belum ada lowongan. Mulai dengan satu posisi yang paling kamu butuhkan.
                  </p>
                )
              ) : (
                <ul className="mt-6 grid gap-4 md:grid-cols-2">
                  {opportunities.map((o) => (
                    <li key={o.id}>
                      <OpportunityCard
                        opportunity={o}
                        badge={
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-heading ${o.closed ? "bg-surface-muted text-ink-muted" : REVIEW_BADGE[o.review].tone}`}>
                            {o.closed ? "Ditutup" : REVIEW_BADGE[o.review].label}
                          </span>
                        }
                      >
                        {o.adminNote && (
                          <p className="mb-3 rounded-xl bg-sky-soft px-3 py-2 text-sm leading-relaxed">
                            <span className="font-emphasis">Catatan admin:</span> {o.adminNote}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-3">
                          <button type="button" onClick={() => { setNotice(null); setForm({ initial: o }); }} className={buttonClass("secondary")} aria-label={`Ubah lowongan ${o.title}`}>
                            Ubah
                          </button>
                          <button type="button" onClick={() => void toggleClosed(o)} className={buttonClass("ghost")} aria-label={`${o.closed ? "Buka lagi" : "Tutup"} lowongan ${o.title}`}>
                            {o.closed ? "Buka lagi" : "Tutup lowongan"}
                          </button>
                        </div>
                      </OpportunityCard>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "talenta" && (
            <section className="mt-6" aria-label="Talenta">
              {squads.length > 0 && (
                <section aria-labelledby="squad-mitra" className="mb-6">
                  <h3 id="squad-mitra" className="font-display text-lg font-heading">
                    Squad di lowonganmu
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                    Tim TitikNol mengelompokkan talenta menjadi squad kecil. Kalau ada yang izin, anggota lain tetap bisa
                    melanjutkan pekerjaan.
                  </p>
                  <ul className="mt-2 grid gap-3 md:grid-cols-2">
                    {squads.map((sq) => (
                      <li key={sq.id} className="card p-4">
                        <p className="text-sm font-emphasis text-ink-muted">
                          {(opportunities ?? []).find((o) => o.id === sq.opportunityId)?.title ?? "Lowongan"}
                        </p>
                        <SquadPanel squad={sq} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {talents === null ? (
                <div aria-hidden="true" className="h-64 animate-pulse rounded-card bg-surface-muted" />
              ) : talents.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line px-6 py-10 text-center font-emphasis text-ink-muted">
                  <Mascot pose="think" idle={false} className="h-20 w-auto" />
                  Belum ada talenta yang diteruskan. Tim TitikNol akan meneruskan pendaftar yang cocok setelah lowonganmu tayang.
                </div>
              ) : (
                <ul className="grid gap-4">
                  {talents.map((t) => (
                    <TalentCard
                      key={t.id}
                      talent={t}
                      onUpdated={(u) => {
                        setTalents((list) => (list ?? []).map((x) => (x.id === u.id ? u : x)));
                        setNotice(`Status ${u.applicantName} sekarang: ${APPLICATION_STATUS_LABEL[u.status].toLowerCase()}.`);
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TalentCard({ talent: t, onUpdated }: { talent: Application; onUpdated: (a: Application) => void }) {
  const [status, setStatus] = useState<ApplicationStatus>(t.status === "diteruskan" ? "diterima" : t.status);
  const [note, setNote] = useState(t.orgNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await updateApplicationByOrg(t.id, status, note));
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Status gagal disimpan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-heading">{t.applicantName || "Talenta TitikNol"}</h3>
          <p className="text-sm text-ink-muted">Untuk posisi {t.opportunityTitle}</p>
        </div>
        <StatusChip status={t.status} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink-muted">Kontak</dt>
          <dd className="font-heading break-all">{t.contact}</dd>
        </div>
        {(t.portfolioUrl || t.cvUrl) && (
          <div>
            <dt className="text-ink-muted">Portofolio & CV</dt>
            <dd className="flex flex-wrap gap-x-4">
              {t.portfolioUrl && (
                <a href={t.portfolioUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-emphasis text-link underline decoration-link/40 underline-offset-4">
                  Portofolio <ExternalIcon aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">(tab baru)</span>
                </a>
              )}
              {t.cvUrl && (
                <a href={t.cvUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-emphasis text-link underline decoration-link/40 underline-offset-4">
                  CV <ExternalIcon aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">(tab baru)</span>
                </a>
              )}
            </dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="text-ink-muted">Alasan mendaftar</dt>
          <dd className="leading-relaxed">{t.motivation}</dd>
        </div>
        {t.profileSummary && (
          <div className="sm:col-span-2">
            <dt className="text-ink-muted">Ringkasan roadmap TitikNol-nya</dt>
            <dd className="leading-relaxed">{t.profileSummary}</dd>
          </div>
        )}
        {t.adminNote && (
          <div className="sm:col-span-2">
            <dt className="text-ink-muted">Catatan tim TitikNol</dt>
            <dd className="leading-relaxed">{t.adminNote}</dd>
          </div>
        )}
      </dl>

      <div className="mt-5 grid gap-3 border-t-2 border-line pt-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
        <label className="text-sm font-emphasis">
          Status
          <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
            {ORG_APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {APPLICATION_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-emphasis">
          Catatan untuk talenta <span className="font-medium text-ink-muted">(opsional)</span>
          <input className={fieldClass} value={note} maxLength={300} placeholder="Mis. mulai Senin, datang jam 09.00" onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="button" disabled={busy} onClick={() => void save()} className={buttonClass("secondary")} aria-label={`Simpan status ${t.applicantName}`}>
          {busy ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 flex gap-2 text-sm font-emphasis text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </li>
  );
}
