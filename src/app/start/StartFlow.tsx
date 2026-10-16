"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DraftingLoader } from "@/components/DraftingLoader";
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon, SparkIcon } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { ThreadNode, ThreadSegment, type ThreadState } from "@/components/Thread";
import { buttonClass } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { readDraftSession, updateDraftSession, type DraftSession } from "@/lib/draft-session";
import { postJson } from "@/lib/http-client";
import { DraftSchema, INPUT_LIMIT } from "@/lib/types";
import { STAGES } from "@/lib/site";
import { useHydrated } from "@/lib/use-hydrated";
import { play } from "@/lib/sound";

type Answers = DraftSession["answers"];

const MIN_LENGTH = 10;

const QUESTIONS = [
  {
    key: "dream",
    title: "Apa mimpimu?",
    hint: "Ceritakan dengan bahasamu sendiri: ingin jadi apa, bekerja di mana, atau hidup seperti apa.",
    placeholder: "Contoh: Aku ingin jadi desainer UI/UX yang bisa kerja remote untuk perusahaan teknologi…",
    tooShort: "Ceritakan mimpimu sedikit lebih panjang, minimal 10 karakter.",
    example:
      "Aku ingin jadi desainer UI/UX yang bisa kerja remote untuk perusahaan teknologi, supaya bisa bantu ekonomi keluarga tanpa harus pindah dari kotaku.",
  },
  {
    key: "background",
    title: "Ceritakan kondisimu sekarang",
    hint: "Pendidikan terakhir, kota tempat tinggal, dan kendala yang kamu hadapi: biaya, waktu, keluarga, atau hal lain. Semakin jujur, semakin pas rencananya.",
    placeholder: "Contoh: Aku lulusan SMK multimedia di Kediri, sekarang kerja paruh waktu di percetakan…",
    tooShort: "Ceritakan sedikit kondisimu supaya rencananya pas, minimal 10 karakter.",
    example:
      "Aku lulusan SMK multimedia di Kediri. Sekarang kerja paruh waktu di percetakan, jadi cuma bisa belajar malam. Biaya terbatas dan belum punya laptop sendiri, biasanya pinjam punya kakak. Sudah coba belajar Figma dari YouTube.",
  },
] as const satisfies readonly { key: keyof Answers; [k: string]: string }[];

type Phase = { kind: "form" } | { kind: "loading" } | { kind: "error"; message: string };

export function StartFlow() {
  // localStorage hanya ada di browser: form dirender setelah hidrasi agar
  // jawaban tersimpan bisa langsung jadi nilai awal tanpa hydration mismatch.
  const hydrated = useHydrated();
  if (!hydrated) return <StartSkeleton />;
  return <StartForm initial={readDraftSession()} />;
}

function StartForm({ initial }: { initial: DraftSession | null }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initial?.answers ?? { dream: "", background: "" });
  const [step, setStep] = useState<0 | 1>(
    initial && initial.answers.dream.trim().length >= MIN_LENGTH && initial.answers.background.trim() ? 1 : 0,
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const movedRef = useRef(false);

  const question = QUESTIONS[step];
  const value = answers[question.key];

  // Simpan otomatis supaya cerita tidak hilang saat refresh atau pindah halaman.
  useEffect(() => {
    updateDraftSession({ answers });
  }, [answers]);

  // Pindahkan fokus ke pertanyaan baru (bukan saat halaman pertama dibuka).
  useEffect(() => {
    if (movedRef.current) textareaRef.current?.focus();
  }, [step]);

  const setValue = (next: string) => {
    setAnswers((prev) => ({ ...prev, [question.key]: next }));
    if (fieldError && next.trim().length >= MIN_LENGTH) setFieldError(null);
  };

  const validate = (): boolean => {
    if (value.trim().length >= MIN_LENGTH) return true;
    play("galat");
    setFieldError(question.tooShort);
    textareaRef.current?.focus();
    return false;
  };

  const goTo = (next: 0 | 1) => {
    movedRef.current = true;
    setFieldError(null);
    if (next > step) play("maju");
    setStep(next);
  };

  const submit = async () => {
    if (answers.dream.trim().length < MIN_LENGTH) {
      goTo(0);
      play("galat");
      setFieldError(QUESTIONS[0].tooShort);
      return;
    }
    if (!validate()) return;

    // Cerita tidak berubah sejak draf terakhir → langsung lanjut tanpa memanggil AI lagi.
    const saved = readDraftSession();
    if (
      saved?.draft &&
      saved.answers.dream.trim() === answers.dream.trim() &&
      saved.answers.background.trim() === answers.background.trim()
    ) {
      router.push("/draft");
      return;
    }

    play("maju");
    setPhase({ kind: "loading" });
    const result = await postJson("/api/draft", answers, DraftSchema);
    if (!result.ok) {
      play("galat");
      setPhase({ kind: "error", message: result.error });
      return;
    }
    const stored = updateDraftSession({
      answers,
      draft: result.data,
      meta: result.meta,
      selectedPlanId: null,
      messages: [],
      roadmapId: null,
    });
    if (!stored) {
      setPhase({
        kind: "error",
        message:
          "Browser tidak mengizinkan penyimpanan data. Matikan mode penyamaran atau izinkan penyimpanan situs, lalu coba lagi.",
      });
      return;
    }
    play("benar");
    router.push("/draft");
  };

  if (phase.kind === "loading") return <DraftingLoader />;

  const questionId = `q-${question.key}`;
  const hintId = `${questionId}-hint`;
  const errorId = `${questionId}-error`;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-x-14 lg:grid-cols-[14rem_minmax(0,40rem)] lg:justify-center">
      <JourneyRail step={step} dream={answers.dream} />

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (step === 0) {
            if (validate()) goTo(1);
          } else {
            void submit();
          }
        }}
        className="min-w-0"
      >
        <LessonBar step={step} />

        <div key={question.key} className="mt-8 flex items-end gap-3 sm:gap-5">
          <Mascot
            pose="talk"
            idle={false}
            className="h-24 w-auto shrink-0 motion-safe:animate-[nod_700ms_ease-in-out] sm:h-32"
          />
          <div className="relative mb-4 min-w-0 flex-1 rounded-2xl border-2 border-b-4 border-line bg-surface px-4 py-3 motion-safe:animate-[rise_500ms_var(--ease-out-expo)_both] sm:px-5 sm:py-4">
            <span
              aria-hidden="true"
              className="absolute bottom-5 -left-[9px] size-4 rotate-45 border-b-2 border-l-2 border-line bg-surface"
            />
            <h1
              id={questionId}
              className="font-display text-2xl leading-tight font-heading tracking-display text-balance sm:text-[2rem]"
            >
              {question.title}
            </h1>
          </div>
        </div>

        <div key={`${question.key}-body`} className="motion-safe:animate-[rise_550ms_var(--ease-out-expo)_120ms_both]">
          <p id={hintId} className="mt-4 max-w-[60ch] text-base leading-relaxed text-pretty text-ink-muted sm:text-lg">
            {question.hint}
          </p>

          <div className="mt-6">
            <VoiceInput
              key={question.key}
              id={`answer-${question.key}`}
              value={value}
              onChange={setValue}
              maxLength={INPUT_LIMIT}
              placeholder={question.placeholder}
              labelledBy={questionId}
              describedBy={fieldError ? `${hintId} ${errorId}` : hintId}
              invalid={!!fieldError}
              textareaRef={textareaRef}
              onSubmitShortcut={() => (step === 0 ? validate() && goTo(1) : void submit())}
            />
            {fieldError && (
              <p id={errorId} className="mt-3 flex items-center gap-2 text-sm font-emphasis text-danger">
                <AlertIcon className="size-4 shrink-0" />
                {fieldError}
              </p>
            )}
            {!value.trim() && (
              <button
                type="button"
                onClick={() => setValue(question.example)}
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-1 text-sm font-heading tracking-wide text-link uppercase hover:underline"
              >
                <SparkIcon className="size-4" />
                Isi dengan contoh cerita
              </button>
            )}
          </div>
        </div>

        {phase.kind === "error" && (
          <div role="alert" className="mt-8 flex gap-3 rounded-2xl border-2 border-b-4 border-danger/40 bg-danger-soft p-5">
            <AlertIcon className="mt-0.5 size-5 shrink-0 text-danger" />
            <div>
              <p className="font-heading">Rencanamu belum berhasil disusun</p>
              <p className="mt-1 text-sm leading-relaxed">{phase.message}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">Ceritamu tetap tersimpan di perangkat ini.</p>
            </div>
          </div>
        )}

        <div className="sticky bottom-0 z-10 -mx-4 mt-10 border-t-2 border-line bg-canvas px-4 py-4 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            {step === 1 ? (
              <button type="button" onClick={() => goTo(0)} className={buttonClass("ghost")}>
                <ArrowLeftIcon className="size-5" />
                Kembali
              </button>
            ) : (
              <span className="hidden sm:block" />
            )}
            <button type="submit" className={`${buttonClass("primary", "lg")} w-full sm:w-auto sm:min-w-48`}>
              {step === 0 ? "Lanjut" : phase.kind === "error" ? "Coba lagi" : "Susun rencanaku"}
              <ArrowRightIcon className="size-5" />
            </button>
          </div>
          <p className="mt-4 hidden text-right text-sm text-ink-muted sm:block">
            <kbd className="rounded-md border-2 border-b-4 border-line bg-surface px-1.5 font-sans text-xs font-heading text-ink">Ctrl</kbd> +{" "}
            <kbd className="rounded-md border-2 border-b-4 border-line bg-surface px-1.5 font-sans text-xs font-heading text-ink">Enter</kbd> untuk lanjut
          </p>
        </div>
      </form>
    </div>
  );
}

/** Bar pelajaran ala Duolingo: tebal, terisi sesuai pertanyaan yang sudah dijawab. */
function LessonBar({ step }: { step: 0 | 1 }) {
  const filled = step === 0 ? 8 : 55;
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Kemajuan pertanyaan"
        aria-valuemin={1}
        aria-valuemax={2}
        aria-valuenow={step + 1}
        aria-valuetext={`Pertanyaan ${step + 1} dari 2`}
        className="h-4 flex-1 overflow-hidden rounded-full bg-line"
      >
        <div
          className="relative h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
          style={{ width: `${filled}%` }}
        >
          <span className="absolute inset-x-2 top-1 h-1 rounded-full bg-white/45" />
        </div>
      </div>
      <span aria-hidden="true" className="shrink-0 text-sm font-heading text-ink-muted tabular-nums">
        {step + 1}/2
      </span>
    </div>
  );
}

/**
 * Jalur lima tahap di layar lebar. Jawaban yang sudah selesai "mendarat" di
 * bawah node-nya, jadi ceritamu terlihat tersambung ke rencana.
 */
function JourneyRail({ step, dream }: { step: 0 | 1; dream: string }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-8">
        <h2 className="text-sm font-heading tracking-wide text-ink-muted uppercase">Perjalananmu</h2>
        <ol aria-label="Tahapan TitikNol" className="mt-5">
          {STAGES.map((stage, i) => {
            const current = i === 0;
            return (
              <li key={stage} aria-current={current ? "step" : undefined} className="relative min-h-10 pb-6 pl-14 last:pb-0">
                {i < STAGES.length - 1 && (
                  <ThreadSegment done={false} axis="y" className="absolute top-12 -bottom-0.5 left-[17px] w-1.5!" />
                )}
                <ThreadNode state={current ? "current" : "pending"} size="lg" label={String(i + 1)} className="absolute top-0 left-0" />
                <p lang="en" className={`pt-2 text-sm leading-6 ${current ? "font-heading text-ink" : "font-emphasis text-ink-muted"}`}>
                  {stage}
                </p>
                {current && (
                  <div className="card mt-3 space-y-4 p-4">
                    {QUESTION_RAIL.slice(0, 2).map((label, q) => {
                      const state: ThreadState = q < step ? "done" : q === step ? "current" : "pending";
                      return (
                        <div key={label} className="relative pl-8">
                          {q === 0 && <ThreadSegment done={step > 0} axis="y" className="absolute top-6 -bottom-4 left-[8px]" />}
                          <ThreadNode state={state} size="sm" className="absolute top-0 left-0" />
                          <p className={`text-sm leading-5 ${state === "current" ? "font-heading text-ink" : "font-medium text-ink-muted"}`}>
                            {label}
                          </p>
                          {state === "done" && dream.trim() && (
                            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-ink-muted motion-safe:animate-[settle_500ms_var(--ease-out-expo)]">
                              “{dream.trim()}”
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}

const QUESTION_RAIL = ["Mimpi", "Kondisi"] as const;

function StartSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto grid w-full max-w-5xl gap-x-16 motion-safe:animate-pulse lg:grid-cols-[15rem_minmax(0,40rem)] lg:justify-center">
      <div className="hidden h-80 rounded-card bg-surface-muted lg:block" />
      <div>
        <div className="h-5 rounded-full bg-surface lg:hidden" />
        <div className="mt-10 h-10 w-2/3 rounded-xl bg-surface lg:mt-0" />
        <div className="mt-4 h-5 w-full rounded-lg bg-surface" />
        <div className="mt-8 h-64 rounded-card bg-surface-muted" />
      </div>
    </div>
  );
}
