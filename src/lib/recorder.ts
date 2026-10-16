"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { postJson } from "./http-client";
import { MAX_RECORDING_SEC, TranscriptSchema } from "./types";
import { blobToWavBase64 } from "./wav";

/**
 * Mode rekam: untuk browser tanpa pengenal suara bawaan (Brave, Firefox) atau
 * yang pengenal suaranya gagal. Suara direkam, diubah ke WAV 16 kHz, lalu
 * dituliskan AI lewat /api/transcribe. Teks baru masuk setelah tombol stop.
 */

function recorderAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof MediaRecorder !== "undefined" &&
    typeof AudioContext !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

const noopSubscribe = () => () => {};

export function useRecorderSupported(): boolean {
  return useSyncExternalStore(noopSubscribe, recorderAvailable, () => false);
}

const MIC_ERRORS: Record<string, string> = {
  NotAllowedError:
    "Izin mikrofon ditolak. Izinkan mikrofon lewat ikon gembok di samping alamat situs, atau ketik saja ceritamu.",
  NotFoundError: "Mikrofon tidak terdeteksi. Pastikan mikrofon tersambung, atau ketik saja ceritamu.",
  NotReadableError: "Mikrofon sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi, atau ketik saja.",
};
const UNCLEAR = "Suaramu tidak terdengar jelas. Coba bicara lebih dekat ke mikrofon, atau ketik saja ceritamu.";
const TOO_SHORT = "Rekamannya terlalu pendek. Tekan mikrofon, bicara beberapa kalimat, lalu tekan stop.";
const BROKEN = "Rekaman gagal diproses. Coba rekam lagi, atau ketik saja ceritamu.";

export function useAudioRecorder({ onFinal }: { onFinal: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const release = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    setTranscribing(true);
    try {
      let audio: { base64: string; seconds: number };
      try {
        audio = await blobToWavBase64(blob);
      } catch {
        if (mountedRef.current) setError(BROKEN);
        return;
      }
      if (audio.seconds < 1) {
        if (mountedRef.current) setError(TOO_SHORT);
        return;
      }
      const result = await postJson("/api/transcribe", { audio: audio.base64, mime: "audio/wav" }, TranscriptSchema);
      if (!mountedRef.current) return;
      if (!result.ok) setError(result.error);
      else if (!result.data.text) setError(UNCLEAR);
      else onFinalRef.current(result.data.text);
    } finally {
      if (mountedRef.current) setTranscribing(false);
    }
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current || transcribing) return;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setError(MIC_ERRORS[name] ?? "Mikrofon tidak bisa dibuka. Coba lagi, atau ketik saja ceritamu.");
      return;
    }
    if (!mountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      release();
      if (!mountedRef.current) return;
      setRecording(false);
      void transcribe(new Blob(chunks, { type: recorder.mimeType }));
    };

    streamRef.current = stream;
    recorderRef.current = recorder;
    recorder.start(1000);
    setSeconds(0);
    setRecording(true);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SEC) stop();
    }, 250);
  }, [release, stop, transcribe, transcribing]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      release();
    };
  }, [release]);

  return { recording, transcribing, seconds, error, start, stop };
}
