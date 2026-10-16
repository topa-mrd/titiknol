"use client";

import { useSyncExternalStore } from "react";

/**
 * Efek suara ala pelajaran Duolingo, disintesis dengan Web Audio API:
 * tanpa file audio (tidak menambah kuota), dan hanya berbunyi sebagai respons
 * atas tindakan pengguna. Pengguna bisa mematikannya dari header; pilihan
 * disimpan di perangkat.
 *
 * Kosakata (sedikit dan konsisten supaya tetap enak didengar berulang kali):
 * - pilih:   memilih kartu/opsi (klik kecil)
 * - maju:    pindah ke langkah berikutnya dalam alur
 * - benar:   to-do dicentang, isian terkirim, revisi diterima
 * - selesai: pencapaian (roadmap jadi, langkah selesai, tulisan terbit)
 * - galat:   isian belum bisa diterima (lembut, tidak menghukum)
 * - rekam / berhenti: mikrofon mulai / berhenti
 */
export type SoundName = "pilih" | "maju" | "benar" | "selesai" | "galat" | "rekam" | "berhenti";

const STORAGE_KEY = "titiknol:sound";
const CHANGE_EVENT = "titiknol:sound-change";
const MASTER_VOLUME = 0.32;

type Note = {
  /** Frekuensi awal → akhir (Hz); sama berarti nada datar. */
  from: number;
  to?: number;
  /** Mulai (detik) relatif terhadap pemutaran. */
  at: number;
  /** Lama (detik). */
  dur: number;
  type?: OscillatorType;
  gain?: number;
};

/** Do-mi-sol: nada cerah dari tangga C mayor, satu keluarga dengan warna oranye-kuning. */
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const E6 = 1318.5;

const SOUNDS: Record<SoundName, Note[]> = {
  pilih: [{ from: 1200, to: 900, at: 0, dur: 0.05, type: "sine", gain: 0.5 }],
  maju: [
    { from: G5, at: 0, dur: 0.08, type: "triangle", gain: 0.7 },
    { from: C6, at: 0.07, dur: 0.12, type: "triangle", gain: 0.7 },
  ],
  benar: [
    { from: E6, at: 0, dur: 0.1, type: "sine", gain: 0.6 },
    { from: E6 * 1.335, at: 0.09, dur: 0.22, type: "sine", gain: 0.6 },
    { from: E6 * 2, at: 0.09, dur: 0.16, type: "sine", gain: 0.12 },
  ],
  selesai: [
    { from: C5, at: 0, dur: 0.1, type: "triangle", gain: 0.6 },
    { from: E5, at: 0.09, dur: 0.1, type: "triangle", gain: 0.6 },
    { from: G5, at: 0.18, dur: 0.1, type: "triangle", gain: 0.6 },
    { from: C6, at: 0.27, dur: 0.38, type: "triangle", gain: 0.7 },
    { from: E6, at: 0.27, dur: 0.38, type: "sine", gain: 0.2 },
  ],
  galat: [
    { from: 330, at: 0, dur: 0.11, type: "triangle", gain: 0.45 },
    { from: 262, at: 0.1, dur: 0.18, type: "triangle", gain: 0.45 },
  ],
  rekam: [{ from: 520, to: 880, at: 0, dur: 0.12, type: "sine", gain: 0.5 }],
  berhenti: [{ from: 880, to: 520, at: 0, dur: 0.12, type: "sine", gain: 0.5 }],
};

// Preferensi nyala/mati

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // penyimpanan diblokir: pilihan berlaku sampai halaman ditutup
  }
  memoryEnabled = enabled;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

let memoryEnabled: boolean | null = null;
const isEnabled = () => memoryEnabled ?? readEnabled();

function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      memoryEnabled = null;
      callback();
    }
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

/** Status suara untuk tombol di header (server: dianggap nyala, tanpa hydration mismatch karena tombol baru tampil setelah hidrasi). */
export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, isEnabled, () => true);
}

// Pemutar

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  context ??= new AudioContext();
  // Browser menahan audio sampai ada interaksi; play() selalu dipanggil dari tindakan pengguna.
  if (context.state === "suspended") void context.resume();
  return context;
}

/** Putar satu efek. Diam bila dimatikan, tab tersembunyi, atau browser tidak mendukung Web Audio. */
export function play(name: SoundName) {
  if (typeof document === "undefined" || document.hidden || !isEnabled()) return;
  let ctx: AudioContext | null;
  try {
    ctx = audio();
  } catch {
    return;
  }
  if (!ctx) return;
  // Penanda untuk pengujian dan analitik ringan; tidak berpengaruh pada bunyi.
  window.dispatchEvent(new CustomEvent("titiknol:sound", { detail: name }));

  schedule(ctx, ctx.destination, name, ctx.currentTime + 0.01);
}

/**
 * Jadwalkan nada satu efek ke `destination` mulai `when`. Dipakai play() dan
 * bisa dipakai OfflineAudioContext untuk merender efek ke berkas (pratinjau).
 * Mengembalikan lama efek (detik).
 */
export function schedule(ctx: BaseAudioContext, destination: AudioNode, name: SoundName, when: number): number {
  const master = ctx.createGain();
  master.gain.value = MASTER_VOLUME;
  master.connect(destination);

  for (const note of SOUNDS[name]) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const start = when + note.at;
    const end = start + note.dur;
    osc.type = note.type ?? "sine";
    osc.frequency.setValueAtTime(note.from, start);
    if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, end);
    // Serangan cepat lalu meluruh: bunyi "pop" yang bulat, tanpa klik di awal/akhir.
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(note.gain ?? 0.5, start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(end + 0.02);
    osc.onended = () => env.disconnect();
  }
  const length = Math.max(...SOUNDS[name].map((n) => n.at + n.dur));
  if (ctx instanceof AudioContext) setTimeout(() => master.disconnect(), (length + 0.2) * 1000);
  return length;
}

/** Untuk test: kosakata suara yang tersedia. */
export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];
