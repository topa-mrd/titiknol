"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Web Speech API (id-ID) dengan:
 * - sambung ulang otomatis saat Chrome berhenti sendiri karena hening,
 *   selama pengguna belum menekan stop;
 * - rem bila mikrofon terus berhenti seketika (mencegah putaran tanpa akhir);
 * - pesan error yang menjelaskan apa yang terjadi dan apa yang bisa dilakukan.
 */

type RecognitionAlternative = { transcript: string };
type RecognitionResult = ArrayLike<RecognitionAlternative> & { isFinal: boolean };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined" || !window.isSecureContext) return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

/** Dukungan browser, dibaca tanpa hydration mismatch (server selalu false). */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => getRecognitionCtor() !== null,
    () => false,
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed":
    "Izin mikrofon ditolak. Izinkan mikrofon lewat ikon gembok di samping alamat situs, atau ketik saja ceritamu.",
  "service-not-allowed":
    "Browser tidak mengizinkan input suara di sini. Coba Chrome atau Edge, atau ketik saja ceritamu.",
  "audio-capture": "Mikrofon tidak terdeteksi. Pastikan mikrofon tersambung, atau ketik saja ceritamu.",
  network: "Input suara butuh koneksi internet yang stabil. Coba lagi sebentar, atau ketik saja ceritamu.",
  "language-not-supported":
    "Browser ini belum mendukung suara bahasa Indonesia. Coba Chrome atau Edge, atau ketik saja ceritamu.",
};
const GENERIC_ERROR = "Input suara berhenti karena kendala teknis. Tekan tombol mikrofon lagi, atau ketik saja ceritamu.";
const FLAPPING_ERROR =
  "Mikrofon terus berhenti sendiri. Cek apakah mikrofon dipakai aplikasi lain, lalu coba lagi atau ketik saja.";

/**
 * Error yang berarti layanan suara browser memang tidak tersedia (mis. Brave
 * tidak tersambung ke layanan suara Google). Pemanggil bisa beralih ke mode rekam.
 */
export const UNAVAILABLE_ERRORS = new Set(["network", "service-not-allowed", "language-not-supported"]);

/** Error yang bukan masalah: hening sejenak atau dihentikan oleh kode kita sendiri. */
const BENIGN_ERRORS = new Set(["no-speech", "aborted"]);

/** Maks sambung ulang beruntun yang terjadi kurang dari RAPID_MS setelah mulai. */
const MAX_RAPID_RESTARTS = 4;
const RAPID_MS = 1_500;

export function useSpeechRecognition({
  onFinal,
  onUnavailable,
  lang = "id-ID",
}: {
  onFinal: (text: string) => void;
  /** Dipanggil saat layanan suara browser tidak tersedia; kembalikan true bila sudah ditangani (pesan error tidak ditampilkan). */
  onUnavailable?: (code: string) => boolean;
  lang?: string;
}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<Recognition | null>(null);
  const wantedRef = useRef(false);
  const startedAtRef = useRef(0);
  const rapidRestartsRef = useRef(0);
  const onFinalRef = useRef(onFinal);
  const onUnavailableRef = useRef(onUnavailable);

  useEffect(() => {
    onFinalRef.current = onFinal;
    onUnavailableRef.current = onUnavailable;
  }, [onFinal, onUnavailable]);

  const finish = useCallback((message: string | null) => {
    wantedRef.current = false;
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
    if (message) setError(message);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    // Chrome Android mengulang hasil final pada mode continuous; di sana kita
    // pakai mode per-kalimat dan mengandalkan sambung ulang otomatis.
    recognition.continuous = !/Android/i.test(navigator.userAgent);
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          if (text.trim()) onFinalRef.current(text.trim());
          rapidRestartsRef.current = 0;
        } else {
          pending += text;
        }
      }
      setInterim(pending.trim());
    };

    recognition.onerror = (event) => {
      if (BENIGN_ERRORS.has(event.error)) return;
      const handled = UNAVAILABLE_ERRORS.has(event.error) && onUnavailableRef.current?.(event.error) === true;
      finish(handled ? null : (ERROR_MESSAGES[event.error] ?? GENERIC_ERROR));
      recognition.abort();
    };

    recognition.onend = () => {
      setInterim("");
      if (!wantedRef.current || recognitionRef.current !== recognition) return;

      const rapid = Date.now() - startedAtRef.current < RAPID_MS;
      rapidRestartsRef.current = rapid ? rapidRestartsRef.current + 1 : 0;
      if (rapidRestartsRef.current > MAX_RAPID_RESTARTS) {
        finish(FLAPPING_ERROR);
        return;
      }
      try {
        startedAtRef.current = Date.now();
        recognition.start();
      } catch {
        finish(GENERIC_ERROR);
      }
    };

    recognitionRef.current = recognition;
    wantedRef.current = true;
    rapidRestartsRef.current = 0;
    startedAtRef.current = Date.now();
    setError(null);
    try {
      recognition.start();
      setListening(true);
    } catch {
      finish(GENERIC_ERROR);
    }
  }, [finish, lang]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    wantedRef.current = false;
    recognitionRef.current = null;
    setListening(false);
    // stop() (bukan abort()) agar kalimat terakhir yang sedang diproses tetap masuk.
    recognition?.stop();
  }, []);

  useEffect(
    () => () => {
      wantedRef.current = false;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [],
  );

  return { listening, interim, error, start, stop, clearError: () => setError(null) };
}

/** Gabungkan transkrip ke teks yang ada: spasi rapi dan huruf kapital di awal kalimat. */
export function appendTranscript(current: string, addition: string, maxLength: number): string {
  const text = addition.trim();
  if (!text) return current;
  const base = current.replace(/\s+$/, "");
  const startsSentence = base === "" || /[.!?]$/.test(base);
  const piece = startsSentence ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  const joined = base ? `${base} ${piece}` : piece;
  return joined.slice(0, maxLength);
}
