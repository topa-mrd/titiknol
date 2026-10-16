"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { aiAvailable } from "./ai-status";
import { useAudioRecorder, useRecorderSupported } from "./recorder";
import { useSpeechRecognition, useSpeechSupported } from "./speech";

/**
 * Satu pintu input suara:
 * - "langsung": pengenal suara bawaan browser (Chrome, Edge, Safari), teks muncul sambil bicara;
 * - "rekam": rekam lalu dituliskan AI di server, untuk Brave/Firefox atau saat mode langsung gagal.
 * Mode rekam hanya ditawarkan bila AI server aktif (bukan mode demo).
 */
export type VoiceEngine = "langsung" | "rekam";

const noopSubscribe = () => () => {};
/** Brave menyediakan SpeechRecognition tapi selalu gagal "network" (tidak tersambung ke layanan suara Google). */
const isBrave = () => typeof navigator !== "undefined" && "brave" in navigator;

export function useVoiceInput({ onFinal }: { onFinal: (text: string) => void }) {
  const liveSupported = useSpeechSupported();
  const recorderSupported = useRecorderSupported();
  const brave = useSyncExternalStore(noopSubscribe, isBrave, () => false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [fellBack, setFellBack] = useState(false);

  useEffect(() => {
    if (!recorderSupported) return;
    let active = true;
    void aiAvailable().then((ok) => active && setAiReady(ok));
    return () => {
      active = false;
    };
  }, [recorderSupported]);

  const recorder = useAudioRecorder({ onFinal });
  const recorderUsable = recorderSupported && aiReady === true;
  const engine: VoiceEngine = liveSupported && !brave && !fellBack ? "langsung" : "rekam";

  const onUnavailable = useCallback(() => {
    if (!recorderUsable) return false;
    setFellBack(true);
    void recorder.start();
    return true;
  }, [recorder, recorderUsable]);

  const live = useSpeechRecognition({ onFinal, onUnavailable });

  /** null = masih dicek (jangan tampilkan tombol maupun pesan "tidak didukung"). */
  const supported: boolean | null =
    engine === "langsung" ? liveSupported : !recorderSupported ? false : aiReady === null ? null : aiReady;

  if (engine === "langsung") {
    return {
      engine,
      supported,
      listening: live.listening,
      busy: false,
      seconds: 0,
      interim: live.interim,
      error: live.error ?? recorder.error,
      start: live.start,
      stop: live.stop,
    };
  }
  return {
    engine,
    supported,
    listening: recorder.recording,
    busy: recorder.transcribing,
    seconds: recorder.seconds,
    interim: "",
    error: recorder.error,
    start: () => void recorder.start(),
    stop: recorder.stop,
  };
}
