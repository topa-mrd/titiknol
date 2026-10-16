"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { fieldClass, fieldErrors } from "@/components/experience/form";
import { AlertIcon, CheckIcon, CloseIcon, PenIcon, SparkIcon } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { Sep } from "@/components/Sep";
import { StageRail } from "@/components/StageRail";
import { ShareBar, StoryDate, storyHref } from "@/components/story/StoryBits";
import { buttonClass } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { postJson } from "@/lib/http-client";
import { loginHref } from "@/lib/safe-next";
import {
  StoreError,
  deleteStory,
  getUser,
  listMyStories,
  saveStory,
  setStoryStatus,
  type AppUser,
} from "@/lib/store";
import { STORY_KIND_HINT, STORY_KIND_LABEL, STORY_STATUS_LABEL, cleanTags, toTag, type Story } from "@/lib/stories";
import { LIMITS, StoryDraftSchema, StoryInputSchema, type StoryKind } from "@/lib/types";
import { useJourneyCompleted } from "@/lib/use-journey";

const TRANSCRIPT_MAX = 4000;
const TRANSCRIPT_MIN = 20;
const MAX_TAGS = 6;

const KINDS: { value: StoryKind; label: string; where: string }[] = [
  { value: "artikel", label: "Artikel", where: "Cerita perjalananmu, tampil di Blog" },
  { value: "mentor", label: "Jadi mentor", where: "Tawarkan bantuan, tampil di Komunitas" },
  { value: "komunitas", label: "Komunitas", where: "Kenalkan komunitasmu, tampil di Komunitas" },
];

const isKind = (v: string | null): v is StoryKind => v === "artikel" || v === "mentor" || v === "komunitas";

type Editor = {
  id: string | null;
  kind: StoryKind;
  author_name: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  contact: string;
  /** Status tersimpan (untuk tulisan lama), menentukan label tombol. */
  saved: Story["status"] | null;
};

type Step =
  | { name: "cerita" }
  | { name: "olah" }
  | { name: "edit"; editor: Editor; aiNote: string | null }
  | { name: "selesai"; story: Story };

type Field = "author_name" | "title" | "summary" | "body" | "tags" | "contact";
const FIELD_ORDER: Field[] = ["title", "summary", "body", "tags", "contact", "author_name"];
const FIELD_MESSAGES: Record<Field, string> = {
  author_name: `Tulis nama yang ingin ditampilkan (maksimal ${LIMITS.story.author} karakter).`,
  title: `Judul ${LIMITS.story.titleMin}–${LIMITS.story.title} karakter.`,
  summary: "Ringkasan maksimal 200 karakter.",
  body: `Isi tulisan minimal ${LIMITS.story.bodyMin} karakter, maksimal ${LIMITS.story.body.toLocaleString("id-ID")}.`,
  tags: "Tag hanya huruf, angka, dan tanda hubung.",
  contact: "Isi link https (mis. Instagram/LinkedIn) atau nomor WhatsApp (08…).",
};

const editorFrom = (story: Story): Editor => ({
  id: story.id,
  kind: story.kind,
  author_name: story.author_name,
  title: story.title,
  summary: story.summary,
  body: story.body,
  tags: story.tags,
  contact: story.contact ?? "",
  saved: story.status,
});

export function StoryStudio() {
  const params = useSearchParams();
  const router = useRouter();
  const journey = useJourneyCompleted();
  const [user, setUser] = useState<AppUser | null | undefined>(undefined);
  const [mine, setMine] = useState<Story[] | null>(null);
  const [mineError, setMineError] = useState<string | null>(null);
  const [kind, setKind] = useState<StoryKind>(() => {
    const jenis = params.get("jenis");
    return isKind(jenis) ? jenis : "artikel";
  });
  const [transcript, setTranscript] = useState("");
  const [step, setStep] = useState<Step>({ name: "cerita" });
  const [tellError, setTellError] = useState<string | null>(null);
  const editId = params.get("edit");
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const u = await getUser().catch(() => null);
      if (!active) return;
      setUser(u);
      if (!u) return;
      try {
        const list = await listMyStories();
        if (active) setMine(list);
      } catch (e) {
        if (active) setMineError(e instanceof StoreError ? e.message : "Tulisanmu gagal dimuat. Muat ulang halaman.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ?edit=<id> dari halaman baca: buka tulisan itu di editor.
  const openedEdit = useRef<string | null>(null);
  useEffect(() => {
    if (!editId || !mine || openedEdit.current === editId) return;
    openedEdit.current = editId;
    const story = mine.find((s) => s.id === editId);
    if (story) {
      const t = setTimeout(() => setStep({ name: "edit", editor: editorFrom(story), aiNote: null }), 0);
      return () => clearTimeout(t);
    }
  }, [editId, mine]);

  const focusComposer = () =>
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      composerRef.current?.querySelector<HTMLElement>("h2, [data-autofocus]")?.focus();
    });

  const upsertMine = (story: Story) =>
    setMine((list) => [story, ...(list ?? []).filter((s) => s.id !== story.id)]);

  const startFresh = () => {
    setTranscript("");
    setStep({ name: "cerita" });
    if (editId) router.replace("/share", { scroll: false });
    focusComposer();
  };

  const editStory = (story: Story) => {
    setStep({ name: "edit", editor: editorFrom(story), aiNote: null });
    focusComposer();
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <StageRail current={4} completed={journey} />
      <h1 lang="en" className="font-display text-[2rem] leading-[1.15] font-heading tracking-display text-balance sm:text-[2.625rem]">
        Share your story
      </h1>
      <p className="mt-3 max-w-prose text-lg leading-relaxed text-pretty text-ink-muted">
        Ceritakan lewat suara. AI merapikannya jadi tulisan, kamu periksa dan ubah sesukamu, lalu terbitkan ke{" "}
        <Link href="/blog" className="font-emphasis text-link underline decoration-link/40 underline-offset-4 hover:decoration-link">
          Blog
        </Link>{" "}
        atau{" "}
        <Link href="/komunitas" className="font-emphasis text-link underline decoration-link/40 underline-offset-4 hover:decoration-link">
          Komunitas
        </Link>
        .
      </p>

      {user === undefined ? (
        <div aria-hidden="true" className="mt-8 h-96 animate-pulse rounded-card bg-surface-muted" />
      ) : !user ? (
        <div className="card mt-8 flex max-w-xl flex-col items-center p-8 text-center">
          <Mascot pose="wave" idle={false} className="h-24 w-auto" />
          <h2 className="mt-4 text-xl font-display font-heading">Mau ikut berbagi?</h2>
          <p className="mt-2 leading-relaxed text-ink-muted">Masuk dulu supaya tulisanmu tercatat atas namamu dan bisa kamu edit lagi.</p>
          <Link href={loginHref("/share")} className={`${buttonClass("primary", "lg")} mt-5`}>
            Masuk untuk menulis
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div ref={composerRef} className="scroll-mt-6">
            {step.name === "cerita" && (
              <TellStep
                user={user}
                kind={kind}
                onKind={setKind}
                transcript={transcript}
                onTranscript={setTranscript}
                error={tellError}
                onError={setTellError}
                onBusy={() => setStep({ name: "olah" })}
                onDrafted={(editor, aiNote) => {
                  setStep({ name: "edit", editor, aiNote });
                  focusComposer();
                }}
                onFailed={(message) => {
                  setTellError(message);
                  setStep({ name: "cerita" });
                }}
              />
            )}
            {step.name === "olah" && <ThinkingStep />}
            {step.name === "edit" && (
              <EditStep
                key={step.editor.id ?? "baru"}
                initial={step.editor}
                aiNote={step.aiNote}
                onBack={step.editor.id ? startFresh : () => setStep({ name: "cerita" })}
                backLabel={step.editor.id ? "Batal" : "Kembali ke cerita"}
                onSaved={(story) => {
                  upsertMine(story);
                  setTranscript("");
                  setStep({ name: "selesai", story });
                  focusComposer();
                }}
              />
            )}
            {step.name === "selesai" && <DoneStep story={step.story} onAgain={startFresh} />}
          </div>

          <MyStories
            stories={mine}
            error={mineError}
            onEdit={editStory}
            onChanged={upsertMine}
            onDeleted={(id) => {
              setMine((list) => list?.filter((s) => s.id !== id) ?? null);
              if (step.name === "edit" && step.editor.id === id) startFresh();
            }}
          />
        </div>
      )}
    </div>
  );
}

// ───────────────────────── 1. Bercerita ─────────────────────────

function TellStep({
  user,
  kind,
  onKind,
  transcript,
  onTranscript,
  error,
  onError: setError,
  onBusy,
  onDrafted,
  onFailed,
}: {
  user: AppUser;
  kind: StoryKind;
  onKind: (k: StoryKind) => void;
  transcript: string;
  onTranscript: (v: string) => void;
  error: string | null;
  onError: (message: string | null) => void;
  onBusy: () => void;
  onDrafted: (editor: Editor, aiNote: string | null) => void;
  onFailed: (message: string) => void;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const blank = (body: string): Editor => ({
    id: null,
    kind,
    author_name: user.name,
    title: "",
    summary: "",
    body,
    tags: [],
    contact: "",
    saved: null,
  });

  const tooShort = transcript.trim().length < TRANSCRIPT_MIN;

  const draftWithAi = async () => {
    if (tooShort) {
      setError(`Ceritakan sedikit lebih panjang, minimal ${TRANSCRIPT_MIN} karakter.`);
      textareaRef.current?.focus();
      return;
    }
    setError(null);
    onBusy();
    const result = await postJson("/api/story", { kind, transcript, authorName: user.name }, StoryDraftSchema);
    if (!result.ok) return onFailed(result.error);
    onDrafted(
      { ...blank(result.data.body), title: result.data.title, summary: result.data.summary, tags: result.data.tags },
      result.meta.fallback
        ? "AI sedang tidak tersedia, jadi ceritamu dirapikan otomatis tanpa AI. Periksa judul dan paragrafnya."
        : result.meta.provider === "mock"
          ? "Mode demo: ceritamu dirapikan otomatis tanpa AI. Periksa judul dan paragrafnya."
          : "AI hanya merapikan kata-katamu. Periksa lagi dan ubah apa pun yang kurang pas sebelum terbit.",
    );
  };

  const onKindKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.preventDefault();
  };

  return (
    <section aria-labelledby={`${id}-title`} className="card p-5 sm:p-7">
      <fieldset>
        <legend className="text-sm font-emphasis">Mau menulis apa?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className={`cursor-pointer rounded-2xl border-2 border-b-4 p-3 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky ${
                kind === k.value ? "border-brand border-b-brand-lip bg-brand-soft" : "border-line hover:bg-surface-muted"
              }`}
            >
              <input
                type="radio"
                name={`${id}-kind`}
                value={k.value}
                checked={kind === k.value}
                onChange={() => onKind(k.value)}
                onKeyDown={onKindKey}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-2 font-emphasis">
                {k.label}
                {kind === k.value && (
                  <span className="grid size-5 place-items-center rounded-full bg-brand text-on-brand motion-safe:animate-[pop_300ms_var(--ease-out-expo)_both]">
                    <CheckIcon className="size-3" strokeWidth={3.5} />
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{k.where}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 flex items-end gap-3 sm:gap-4">
        <Mascot pose="talk" idle={false} className="h-20 w-auto shrink-0 sm:h-24" />
        <div className="relative mb-3 min-w-0 flex-1 rounded-2xl border-2 border-b-4 border-line bg-surface px-4 py-3 sm:px-5">
          <span aria-hidden="true" className="absolute bottom-5 -left-[9px] size-4 rotate-45 border-b-2 border-l-2 border-line bg-surface" />
          <h2 id={`${id}-title`} tabIndex={-1} className="font-display text-xl leading-tight font-heading tracking-display text-balance focus:outline-none sm:text-2xl">
            Ceritakan dengan suaramu
          </h2>
          <p id={`${id}-hint`} className="mt-1 text-sm leading-relaxed text-pretty text-ink-muted sm:text-base">
            {STORY_KIND_HINT[kind]}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <VoiceInput
          id={`${id}-cerita`}
          value={transcript}
          onChange={(v) => {
            onTranscript(v);
            if (error) setError(null);
          }}
          maxLength={TRANSCRIPT_MAX}
          labelledBy={`${id}-title`}
          describedBy={[`${id}-hint`, error ? `${id}-error` : ""].filter(Boolean).join(" ")}
          invalid={!!error}
          placeholder="Ketuk mikrofon lalu bercerita santai, atau ketik di sini…"
          onSubmitShortcut={() => void draftWithAi()}
          textareaRef={textareaRef}
        />
      </div>

      {error && (
        <p id={`${id}-error`} role="alert" className="mt-3 flex gap-2 text-sm font-medium text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => onDrafted(blank(transcript.trim()), null)}
          className={`${buttonClass("ghost")} normal-case`}
        >
          Tulis sendiri tanpa AI
        </button>
        <button type="button" onClick={() => void draftWithAi()} className={buttonClass("primary", "lg")}>
          <SparkIcon className="size-5" strokeWidth={2.25} />
          Olah jadi tulisan
        </button>
      </div>
    </section>
  );
}

function ThinkingStep() {
  return (
    <section className="card flex flex-col items-center px-6 py-12 text-center" aria-busy="true">
      <Mascot pose="think" className="h-28 w-auto" />
      <p role="status" className="mt-5 font-display text-xl font-heading tracking-display">
        Titik sedang merapikan ceritamu…
      </p>
      <p className="mt-2 max-w-sm leading-relaxed text-ink-muted">Biasanya kurang dari setengah menit. Kata-katamu tetap dipakai, tidak ada fakta yang ditambah.</p>
    </section>
  );
}

// ───────────────────────── 2. Edit ─────────────────────────

function EditStep({
  initial,
  aiNote,
  onBack,
  backLabel,
  onSaved,
}: {
  initial: Editor;
  aiNote: string | null;
  onBack: () => void;
  backLabel: string;
  onSaved: (story: Story) => void;
}) {
  const id = useId();
  const [form, setForm] = useState(initial);
  const [tagDraft, setTagDraft] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState<"draf" | "terbit" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const needsContact = form.kind !== "artikel";
  const takenDown = form.saved === "diturunkan";

  const set = <K extends keyof Editor>(key: K, value: Editor[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key in FIELD_MESSAGES) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const addTags = useCallback(
    (raw: string) => {
      const next = cleanTags([...form.tags, ...raw.split(",")], MAX_TAGS);
      setForm((f) => ({ ...f, tags: next }));
      setTagDraft("");
    },
    [form.tags],
  );

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (tagDraft.trim()) addTags(tagDraft);
    } else if (e.key === "Backspace" && !tagDraft && form.tags.length > 0) {
      setForm((f) => ({ ...f, tags: f.tags.slice(0, -1) }));
    }
  };

  const save = async (status: "draf" | "terbit") => {
    setFailure(null);
    const tags = tagDraft.trim() ? cleanTags([...form.tags, ...tagDraft.split(",")], MAX_TAGS) : form.tags;
    const parsed = StoryInputSchema.safeParse({
      author_name: form.author_name,
      kind: form.kind,
      title: form.title,
      summary: form.summary,
      body: form.body,
      tags,
      contact: form.contact.trim() || null,
      status,
    });
    if (!parsed.success) {
      const next = fieldErrors<Field>(parsed.error.issues, FIELD_MESSAGES);
      setErrors(next);
      const first = FIELD_ORDER.find((f) => next[f]);
      if (first) document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    setErrors({});
    setBusy(status);
    try {
      onSaved(await saveStory(parsed.data, form.id ?? undefined));
    } catch (e) {
      setFailure(e instanceof StoreError ? e.message : "Tulisan gagal disimpan. Coba lagi.");
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save("terbit");
  };

  const fieldProps = (field: Field) => ({
    id: `${id}-${field}`,
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": [errors[field] ? `${id}-${field}-error` : "", `${id}-${field}-hint`].filter(Boolean).join(" ") || undefined,
  });
  const fieldError = (field: Field) =>
    errors[field] && (
      <p id={`${id}-${field}-error`} className="mt-1.5 text-sm font-medium text-danger">
        {errors[field]}
      </p>
    );

  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby={`${id}-heading`} className="card p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-heading`} tabIndex={-1} className="font-display text-xl font-heading tracking-display focus:outline-none sm:text-2xl">
          {form.id ? "Edit tulisan" : "Periksa tulisanmu"}
        </h2>
        <span className="inline-flex items-center rounded-full bg-brand-soft px-3 py-1 text-xs font-heading text-brand-ink">
          {STORY_KIND_LABEL[form.kind]}
        </span>
      </div>

      {aiNote && (
        <p className="mt-4 flex gap-2 rounded-2xl bg-sky-soft px-4 py-3 text-sm leading-relaxed">
          <SparkIcon className="mt-0.5 size-4 shrink-0 text-link" />
          {aiNote}
        </p>
      )}
      {takenDown && (
        <p className="mt-4 flex gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm leading-relaxed">
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          Tulisan ini diturunkan admin. Kamu tetap bisa memperbaiki isinya, tapi hanya admin yang bisa menayangkannya lagi.
        </p>
      )}

      <div className="mt-5">
        <label htmlFor={`${id}-title`} className="text-sm font-emphasis">
          Judul
        </label>
        <input
          {...fieldProps("title")}
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          maxLength={LIMITS.story.title}
          placeholder={form.kind === "artikel" ? "Mis. Klien pertamaku dari warung tetangga" : "Mis. Siap bantu review CV dan latihan wawancara"}
          className={`${fieldClass} font-emphasis`}
        />
        {fieldError("title")}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${id}-summary`} className="text-sm font-emphasis">
            Ringkasan <span className="font-normal text-ink-muted">(tampil di kartu)</span>
          </label>
          <span className="text-xs text-ink-muted tabular-nums">{form.summary.length}/200</span>
        </div>
        <textarea
          {...fieldProps("summary")}
          value={form.summary}
          onChange={(e) => set("summary", e.target.value)}
          maxLength={200}
          rows={2}
          className={`${fieldClass} min-h-20 resize-none [field-sizing:content] leading-relaxed`}
        />
        {fieldError("summary")}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${id}-body`} className="text-sm font-emphasis">
            Isi tulisan
          </label>
          <span className="text-xs text-ink-muted tabular-nums">
            {form.body.length.toLocaleString("id-ID")}/{LIMITS.story.body.toLocaleString("id-ID")}
          </span>
        </div>
        <textarea
          {...fieldProps("body")}
          value={form.body}
          onChange={(e) => set("body", e.target.value)}
          maxLength={LIMITS.story.body}
          rows={12}
          className={`${fieldClass} min-h-64 resize-y [field-sizing:content] leading-relaxed`}
        />
        <p id={`${id}-body-hint`} className="mt-1.5 text-xs text-ink-muted">
          Pisahkan paragraf dengan satu baris kosong.
        </p>
        {fieldError("body")}
      </div>

      <div className="mt-4">
        <label htmlFor={`${id}-tags`} className="text-sm font-emphasis">
          Tag <span className="font-normal text-ink-muted">(maks. {MAX_TAGS})</span>
        </label>
        <div
          className={`mt-1.5 flex flex-wrap items-center gap-1.5 rounded-2xl border-2 bg-surface px-2.5 py-2 focus-within:border-sky ${
            errors.tags ? "border-danger" : "border-line-strong"
          }`}
        >
          <ul aria-label="Tag terpilih" className="contents">
            {form.tags.map((t) => (
              <li key={t} className="inline-flex items-center gap-0.5 rounded-full bg-sky-soft py-0.5 pr-0.5 pl-2.5 text-sm font-emphasis text-link">
                #{t}
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))}
                  className="grid size-7 place-items-center rounded-full hover:bg-sky/20"
                >
                  <CloseIcon className="size-3.5" strokeWidth={2.5} />
                  <span className="sr-only">Hapus tag {t}</span>
                </button>
              </li>
            ))}
          </ul>
          {form.tags.length < MAX_TAGS && (
            <input
              {...fieldProps("tags")}
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={onTagKey}
              onBlur={() => tagDraft.trim() && addTags(tagDraft)}
              placeholder={form.tags.length ? "Tambah tag" : "Mis. beasiswa, belajar-dari-hp"}
              className="min-h-9 min-w-32 flex-1 bg-transparent px-1.5 text-base focus:outline-none"
            />
          )}
        </div>
        <p id={`${id}-tags-hint`} className="mt-1.5 text-xs text-ink-muted">
          Tekan Enter atau koma untuk menambah. {tagDraft.trim() && toTag(tagDraft) ? `Akan ditambahkan: #${toTag(tagDraft)}` : ""}
        </p>
        {fieldError("tags")}
      </div>

      {needsContact && (
        <div className="mt-4">
          <label htmlFor={`${id}-contact`} className="text-sm font-emphasis">
            Kontak publik
          </label>
          <input
            {...fieldProps("contact")}
            value={form.contact}
            onChange={(e) => set("contact", e.target.value)}
            maxLength={200}
            inputMode="url"
            placeholder="https://instagram.com/… atau 0812…"
            className={fieldClass}
          />
          <p id={`${id}-contact-hint`} className="mt-1.5 flex gap-1.5 text-xs leading-relaxed text-ink-muted">
            <AlertIcon className="mt-px size-3.5 shrink-0" />
            Kontak ini tampil untuk semua orang. Pakai nomor atau akun yang memang untuk dihubungi publik.
          </p>
          {fieldError("contact")}
        </div>
      )}

      <div className="mt-4">
        <label htmlFor={`${id}-author_name`} className="text-sm font-emphasis">
          Nama yang ditampilkan
        </label>
        <input
          {...fieldProps("author_name")}
          value={form.author_name}
          onChange={(e) => set("author_name", e.target.value)}
          maxLength={LIMITS.story.author}
          autoComplete="nickname"
          className={fieldClass}
        />
        {fieldError("author_name")}
      </div>

      {failure && (
        <p role="alert" className="mt-5 flex gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm">
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          {failure}
        </p>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 border-t-2 border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onBack} className={`${buttonClass("ghost")} normal-case`}>
          {backLabel}
        </button>
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button type="button" disabled={busy !== null} onClick={() => void save("draf")} className={buttonClass("secondary", "lg")}>
            {busy === "draf" ? "Menyimpan…" : form.saved === "terbit" ? "Jadikan draf" : "Simpan draf"}
          </button>
          {!takenDown && (
            <button type="submit" disabled={busy !== null} className={buttonClass("primary", "lg")}>
              {busy === "terbit" ? "Menerbitkan…" : form.saved === "terbit" ? "Simpan perubahan" : "Terbitkan"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

// ───────────────────────── 3. Selesai ─────────────────────────

function DoneStep({ story, onAgain }: { story: Story; onAgain: () => void }) {
  const published = story.status === "terbit";
  const id = useId();
  return (
    <section aria-labelledby={`${id}-done`} className="card flex flex-col items-center px-6 py-10 text-center sm:px-10">
      <Mascot pose={published ? "cheer" : "wave"} className="h-28 w-auto" />
      <h2 id={`${id}-done`} tabIndex={-1} role="status" className="mt-4 font-display text-2xl font-heading tracking-display focus:outline-none">
        {published ? "Tulisanmu sudah terbit!" : story.status === "diturunkan" ? "Perubahan tersimpan" : "Draf tersimpan"}
      </h2>
      <p className="mt-2 max-w-md leading-relaxed text-ink-muted">
        {published
          ? story.kind === "artikel"
            ? "Sekarang tampil di Blog. Bagikan ke teman yang mungkin butuh cerita ini."
            : "Sekarang tampil di Komunitas, lengkap dengan kontakmu."
          : "Hanya kamu yang bisa melihatnya. Terbitkan kapan saja dari daftar Tulisanku."}
      </p>
      <div className="mt-6 flex flex-col items-center gap-4">
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={storyHref(story.id)} className={buttonClass(published ? "secondary" : "primary")}>
            {published ? "Lihat tulisan" : "Pratinjau"}
          </Link>
          <button type="button" onClick={onAgain} className={buttonClass("secondary")}>
            <PenIcon className="size-4" />
            Tulis cerita lain
          </button>
        </div>
        {published && <ShareBar title={story.title} path={storyHref(story.id)} />}
      </div>
    </section>
  );
}

// ───────────────────────── Tulisanku ─────────────────────────

const STATUS_TONE: Record<Story["status"], string> = {
  draf: "bg-sun-soft text-on-sun",
  terbit: "bg-leaf-soft text-leaf-ink",
  diturunkan: "bg-danger-soft text-ink",
};

function MyStories({
  stories,
  error,
  onEdit,
  onChanged,
  onDeleted,
}: {
  stories: Story[] | null;
  error: string | null;
  onEdit: (story: Story) => void;
  onChanged: (story: Story) => void;
  onDeleted: (id: string) => void;
}) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-mine`} className="lg:sticky lg:top-6">
      <h2 id={`${id}-mine`} className="font-display text-lg font-heading tracking-display">
        Tulisanku
      </h2>
      {error && (
        <p role="alert" className="mt-3 flex gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm">
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          {error}
        </p>
      )}
      {!stories && !error && <div aria-hidden="true" className="mt-3 h-32 animate-pulse rounded-card bg-surface-muted" />}
      {stories && stories.length === 0 && (
        <p className="mt-3 rounded-card border-2 border-dashed border-line px-5 py-6 text-center text-sm leading-relaxed text-ink-muted">
          Belum ada tulisan. Draf dan tulisan yang sudah terbit muncul di sini.
        </p>
      )}
      {stories && stories.length > 0 && (
        <ul className="mt-3 space-y-3">
          {stories.map((s) => (
            <MyStoryItem key={s.id} story={s} onEdit={() => onEdit(s)} onChanged={onChanged} onDeleted={() => onDeleted(s.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MyStoryItem({
  story,
  onEdit,
  onChanged,
  onDeleted,
}: {
  story: Story;
  onEdit: () => void;
  onChanged: (story: Story) => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<void>, failMessage: string) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof StoreError ? e.message : failMessage);
    } finally {
      setBusy(false);
    }
  };

  const toggle = () =>
    run(async () => onChanged(await setStoryStatus(story.id, story.status === "terbit" ? "draf" : "terbit")), "Status gagal diubah. Coba lagi.");
  const remove = () =>
    run(async () => {
      await deleteStory(story.id);
      onDeleted();
    }, "Tulisan gagal dihapus. Coba lagi.");

  const small = "min-h-10 rounded-full px-3 text-sm font-emphasis transition-colors";

  return (
    <li>
      <article className="rounded-card border-2 border-line bg-surface p-4">
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-heading ${STATUS_TONE[story.status]}`}>
            {STORY_STATUS_LABEL[story.status]}
          </span>
          <span className="text-ink-muted">
            {STORY_KIND_LABEL[story.kind]}
            <Sep />
            <StoryDate story={story} />
          </span>
        </div>
        <h3 className="mt-2 leading-snug font-emphasis text-balance">{story.title}</h3>
        {confirming ? (
          <div role="group" aria-label="Konfirmasi hapus tulisan" className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Hapus tulisan ini?</span>
            <button type="button" disabled={busy} onClick={() => void remove()} className={`${small} bg-danger text-white`}>
              Ya, hapus
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={`${small} text-ink-muted hover:bg-surface-muted`}>
              Batal
            </button>
          </div>
        ) : (
          <div className="mt-2 -ml-3 flex flex-wrap items-center gap-1">
            <Link href={storyHref(story.id)} className={`${small} inline-flex items-center text-link hover:bg-sky-soft`}>
              Lihat<span className="sr-only"> {story.title}</span>
            </Link>
            <button type="button" onClick={onEdit} className={`${small} text-link hover:bg-sky-soft`}>
              Edit<span className="sr-only"> {story.title}</span>
            </button>
            {story.status !== "diturunkan" && (
              <button type="button" disabled={busy} onClick={() => void toggle()} className={`${small} text-link hover:bg-sky-soft`}>
                {story.status === "terbit" ? "Jadikan draf" : "Terbitkan"}
                <span className="sr-only"> {story.title}</span>
              </button>
            )}
            <button type="button" onClick={() => setConfirming(true)} className={`${small} text-ink-muted hover:bg-surface-muted hover:text-danger`}>
              Hapus<span className="sr-only"> {story.title}</span>
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </article>
    </li>
  );
}
