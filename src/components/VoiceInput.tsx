"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent, type Ref } from "react";
import { appendTranscript } from "@/lib/speech";
import { MAX_RECORDING_SEC } from "@/lib/types";
import { useVoiceInput } from "@/lib/voice";
import { useHydrated } from "@/lib/use-hydrated";
import { AlertIcon, MicIcon, MicOffIcon, StopIcon } from "./icons";
import { play } from "@/lib/sound";

type VoiceInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
  /** id elemen judul pertanyaan yang menjadi label textarea. */
  labelledBy: string;
  /** id elemen yang mendeskripsikan textarea (petunjuk, pesan error). */
  describedBy?: string;
  invalid?: boolean;
  onSubmitShortcut?: () => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
};

export function VoiceInput({
  id,
  value,
  onChange,
  maxLength,
  placeholder,
  labelledBy,
  describedBy,
  invalid,
  onSubmitShortcut,
  textareaRef,
}: VoiceInputProps) {
  const hydrated = useHydrated();
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const handleFinal = useCallback(
    (text: string) => {
      const next = appendTranscript(valueRef.current, text, maxLength);
      valueRef.current = next;
      onChange(next);
    },
    [maxLength, onChange],
  );

  const voice = useVoiceInput({ onFinal: handleFinal });
  const { listening, interim, error, start, stop, busy, engine } = voice;
  // Sebelum hidrasi/cek server, dukungan belum diketahui: jangan tampilkan tombol maupun pesan "tidak didukung".
  const supported = hydrated && voice.supported === true;
  const unsupported = hydrated && voice.supported === false;
  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && onSubmitShortcut) {
      event.preventDefault();
      onSubmitShortcut();
    }
  };

  const statusId = `${id}-status`;
  const countId = `${id}-count`;
  const nearLimit = value.length > maxLength * 0.9;

  return (
    <div>
      <div
        className={`rounded-card border-2 border-b-4 bg-surface transition-colors duration-200 focus-within:border-sky ${
          invalid ? "border-danger" : listening ? "border-danger/60" : "border-line-strong"
        }`}
      >
        <textarea
          id={id}
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={maxLength}
          rows={6}
          placeholder={placeholder}
          aria-labelledby={labelledBy}
          aria-invalid={invalid || undefined}
          aria-describedby={[describedBy, statusId, countId].filter(Boolean).join(" ")}
          className="block max-h-[60vh] min-h-44 w-full resize-none rounded-t-card [field-sizing:content] bg-transparent px-5 pt-5 pb-3 text-base leading-relaxed text-ink placeholder:text-ink-muted focus:outline-none sm:min-h-52 sm:text-lg"
        />

        <p
          aria-live="polite"
          className={`px-5 text-base leading-relaxed text-ink-muted italic ${interim ? "pb-3" : "sr-only"}`}
        >
          {interim ? `${interim}…` : ""}
        </p>

        <div className="flex items-center justify-between gap-3 border-t-2 border-line px-3 pt-3 pb-4 sm:gap-4 sm:px-4">
          {supported ? (
            <button
              type="button"
              onClick={() => {
                play(listening ? "berhenti" : "rekam");
                if (listening) stop();
                else start();
              }}
              disabled={busy}
              aria-pressed={listening}
              className={`relative grid size-16 shrink-0 place-items-center rounded-full text-white transition-[transform,box-shadow,background-color] duration-100 active:translate-y-1 active:shadow-none ${
                listening
                  ? "bg-danger shadow-[0_5px_0_var(--color-danger-lip)]"
                  : "bg-link shadow-[0_5px_0_var(--color-link-lip)] hover:brightness-110 disabled:opacity-60"
              }`}
            >
              {listening && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-danger/40 motion-safe:animate-[halo_1.6s_ease-out_infinite] motion-reduce:hidden"
                />
              )}
              {listening ? <StopIcon className="relative size-7" /> : <MicIcon className="relative size-7" strokeWidth={2.25} />}
              <span className="sr-only">{listening ? "Berhenti" : "Bicara"}</span>
            </button>
          ) : unsupported ? (
            <span className="inline-flex items-center gap-2 px-2 text-sm text-ink-muted">
              <MicOffIcon className="size-5 shrink-0" />
              Ketik ceritamu di sini
            </span>
          ) : (
            <span aria-hidden="true" className="size-16" />
          )}

          {/* Jam rekaman berubah tiap detik; pembaca layar cukup diberi tahu perubahan keadaannya. */}
          <span aria-live="polite" className="sr-only">
            {listening && engine === "rekam" ? "Merekam." : busy ? "Menuliskan suaramu." : ""}
          </span>
          <span id={statusId} className="flex min-w-0 flex-1 items-center gap-2 text-sm font-emphasis">
            {listening && engine === "rekam" ? (
              <span className="text-danger">
                Merekam {clock(voice.seconds)} / {clock(MAX_RECORDING_SEC)} · tekan stop kalau selesai
              </span>
            ) : listening ? (
              <span className="text-danger">Mendengarkan… bicara dengan santai</span>
            ) : busy ? (
              <span className="text-link motion-safe:animate-pulse">Menuliskan suaramu…</span>
            ) : supported ? (
              <span aria-hidden="true" className="text-ink-muted">
                Ketuk mikrofon untuk bercerita
              </span>
            ) : null}
          </span>

          <span id={countId} className={`shrink-0 text-xs tabular-nums ${nearLimit ? "font-medium text-danger" : "text-ink-muted"}`}>
            <span className="sr-only">Jumlah karakter: </span>
            {value.length.toLocaleString("id-ID")}/{maxLength.toLocaleString("id-ID")}
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 flex gap-2 rounded-2xl border-2 border-danger/40 bg-danger-soft px-4 py-3 text-sm leading-relaxed text-ink">
          <AlertIcon className="mt-0.5 size-5 shrink-0 text-danger" />
          {error}
        </p>
      )}
      {unsupported && (
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Input suara belum didukung di browser ini. Pakai Chrome atau Edge kalau ingin bercerita lewat suara.
        </p>
      )}
    </div>
  );
}
