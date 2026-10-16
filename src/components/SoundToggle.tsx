"use client";

import { play, setSoundEnabled, useSoundEnabled } from "@/lib/sound";
import { useHydrated } from "@/lib/use-hydrated";
import { SpeakerIcon, SpeakerOffIcon } from "./icons";

/** Nyala/mati efek suara. Baru tampil setelah hidrasi karena pilihannya tersimpan di perangkat. */
export function SoundToggle() {
  const hydrated = useHydrated();
  const enabled = useSoundEnabled();
  if (!hydrated) return <span aria-hidden="true" className="size-10 shrink-0" />;

  const toggle = () => {
    setSoundEnabled(!enabled);
    // Bunyi konfirmasi saat dinyalakan, supaya pengguna tahu seperti apa suaranya.
    if (!enabled) play("pilih");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      title={enabled ? "Matikan efek suara" : "Nyalakan efek suara"}
      className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-surface-muted ${
        enabled ? "text-ink-muted hover:text-ink" : "text-line-strong hover:text-ink-muted"
      }`}
    >
      {enabled ? <SpeakerIcon className="size-5" strokeWidth={2} /> : <SpeakerOffIcon className="size-5" strokeWidth={2} />}
      <span className="sr-only">Efek suara</span>
    </button>
  );
}
