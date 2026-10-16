"use client";

import { useEffect, useRef, useState } from "react";
import { LIMITS, type ChatMessage } from "@/lib/types";
import { AlertIcon, ArrowRightIcon } from "../icons";
import { Mascot } from "../Mascot";

export const SUGGESTIONS = ["Cari opsi yang lebih murah", "Aku harus sambil kerja", "Aku mau tetap di kotaku"] as const;

type ChatPanelProps = {
  intro: string;
  messages: ChatMessage[];
  pending: boolean;
  error: string | null;
  draftInput: string;
  onDraftInput: (value: string) => void;
  onSend: (text: string) => void;
};

export function ChatPanel({ intro, messages, pending, error, draftInput, onDraftInput, onSend }: ChatPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (touched) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, pending, touched]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setTouched(true);
    onSend(trimmed);
  };

  return (
    <section
      aria-labelledby="chat-title"
      className="flex flex-col card lg:max-h-[calc(100dvh-7rem)]"
    >
      <div className="flex items-center gap-3 border-b-2 border-line px-5 py-3">
        <Mascot pose="talk" idle={false} className="h-12 w-auto shrink-0" />
        <div>
          <h2 id="chat-title" className="font-display font-heading tracking-display">
            Revisi bareng AI
          </h2>
          <p className="text-xs text-ink-muted">Minta plan diubah sesuai kondisimu</p>
        </div>
      </div>

      <div role="log" aria-live="polite" aria-label="Percakapan revisi" className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        <Bubble role="assistant">{intro}</Bubble>
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role}>
            {m.content}
          </Bubble>
        ))}
        {pending && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <span aria-hidden="true" className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 rounded-full bg-ink-muted motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </span>
            Merevisi plan…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line px-4 pt-3 pb-4">
        <ul aria-label="Saran permintaan" className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                disabled={pending}
                onClick={() => send(s)}
                className="rounded-full border border-line bg-surface-muted px-3 py-1.5 text-sm font-medium transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="mt-3 flex gap-2 rounded-2xl bg-danger-soft px-3 py-2 text-sm leading-relaxed">
            <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draftInput);
          }}
          className="mt-3 flex items-end gap-2"
        >
          <label htmlFor="chat-input" className="sr-only">
            Tulis permintaan revisi
          </label>
          <textarea
            id="chat-input"
            rows={1}
            maxLength={LIMITS.message}
            value={draftInput}
            onChange={(e) => onDraftInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(draftInput);
              }
            }}
            placeholder="Mis. aku lebih suka belajar online…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border-2 border-line-strong bg-surface px-4 py-2.5 leading-snug focus:border-sky focus:outline-none [field-sizing:content]"
          />
          <button
            type="submit"
            disabled={pending || !draftInput.trim()}
            aria-label="Kirim permintaan"
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-link text-white shadow-[0_4px_0_var(--color-link-lip)] transition-[transform,box-shadow] active:translate-y-1 active:shadow-none disabled:opacity-40"
          >
            <ArrowRightIcon className="size-5" />
          </button>
        </form>
      </div>
    </section>
  );
}

function Bubble({ role, children }: { role: ChatMessage["role"]; children: string }) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <p
        className={`max-w-[85%] rounded-3xl px-4 py-2.5 leading-relaxed whitespace-pre-line ${
          mine ? "rounded-br-lg bg-sun-soft text-on-sun" : "rounded-bl-lg border-2 border-line bg-surface"
        }`}
      >
        <span className="sr-only">{mine ? "Kamu: " : "Mentor: "}</span>
        {children}
      </p>
    </div>
  );
}
