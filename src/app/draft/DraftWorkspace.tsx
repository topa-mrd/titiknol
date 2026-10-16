"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ChatPanel } from "@/components/draft/ChatPanel";
import { ProfileCard } from "@/components/draft/ProfileCard";
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon } from "@/components/icons";
import { PlanCard } from "@/components/PlanCard";
import { buttonClass } from "@/components/ui";
import { readDraftSession, updateDraftSession, type DraftSession } from "@/lib/draft-session";
import { postJson } from "@/lib/http-client";
import { RefineSchema, type ChatMessage, type Draft, type PlanId, type Profile } from "@/lib/types";
import { useHydrated } from "@/lib/use-hydrated";
import { StageRail } from "@/components/StageRail";
import { play } from "@/lib/sound";

type Ready = DraftSession & { draft: Draft };

export function DraftWorkspace({ onBuild }: { onBuild: (session: Ready) => void }) {
  const hydrated = useHydrated();
  if (!hydrated) return <DraftSkeleton />;
  const session = readDraftSession();
  if (!session?.draft) return <EmptyDraft />;
  return <Workspace initial={session as Ready} onBuild={onBuild} />;
}

function Workspace({ initial, onBuild }: { initial: Ready; onBuild: (session: Ready) => void }) {
  const [session, setSession] = useState<Ready>(initial);
  const [updatedIds, setUpdatedIds] = useState<Set<PlanId>>(new Set());
  const [pending, setPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [planError, setPlanError] = useState(false);
  const plansRef = useRef<HTMLFieldSetElement>(null);

  /** Simpan ke state dan localStorage. Perubahan isi draf membatalkan roadmapId lama. */
  const save = (patch: Partial<Ready>) => {
    setSession((prev) => ({ ...prev, ...patch }));
    updateDraftSession(patch);
  };

  const { draft, selectedPlanId } = session;
  const selected = draft.plans.find((p) => p.id === selectedPlanId) ?? null;

  const selectPlan = (id: PlanId) => {
    setPlanError(false);
    if (id !== selectedPlanId) {
      play("pilih");
      save({ selectedPlanId: id, roadmapId: null });
    }
  };

  const saveProfile = (profile: Profile) => save({ draft: { ...draft, profile }, roadmapId: null });

  const sendChat = async (text: string) => {
    const userMessage: ChatMessage = { role: "user", content: text };
    const before = session.messages;
    const history = [...before, userMessage].slice(-20);
    setSession((prev) => ({ ...prev, messages: [...before, userMessage] }));
    setChatInput("");
    setChatError(null);
    setPending(true);

    const result = await postJson("/api/refine", { profile: draft.profile, plans: draft.plans, messages: history }, RefineSchema);
    setPending(false);

    if (!result.ok) {
      play("galat");
      setSession((prev) => ({ ...prev, messages: before }));
      setChatInput(text);
      setChatError(result.error);
      return;
    }

    const { reply, profile, plans } = result.data;
    const changed = plans.filter((p, i) => JSON.stringify(p) !== JSON.stringify(draft.plans[i])).map((p) => p.id);
    setUpdatedIds(new Set(changed));
    play("benar");
    save({
      draft: { ...draft, profile, plans },
      messages: [...before, userMessage, { role: "assistant" as const, content: reply }].slice(-40),
      meta: result.meta,
      roadmapId: null,
    });
  };

  const build = () => {
    if (!selected) {
      play("galat");
      setPlanError(true);
      plansRef.current?.querySelector("input")?.focus();
      return;
    }
    play("maju");
    onBuild(session);
  };

  return (
    <div className="mx-auto w-full max-w-6xl pb-28 lg:pb-8">
      <StageRail current={1} />
      <h1 className="font-display text-[2rem] leading-[1.15] font-heading tracking-display text-balance sm:text-[2.625rem]">Tiga jalur untukmu</h1>
      <p className="mt-3 max-w-prose text-lg leading-relaxed text-pretty text-ink-muted">
        Cek profilmu, bandingkan ketiga plan, lalu pilih satu. Belum pas? Minta revisi lewat chat.
      </p>
      {session.meta?.fallback && (
        <p className="mt-4 flex max-w-prose gap-2 rounded-2xl bg-sun-soft px-4 py-3 text-sm leading-relaxed">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          AI sedang sibuk, jadi jawaban terakhir disusun oleh mode cadangan. Kamu tetap bisa merevisi dan memakainya.
        </p>
      )}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <ProfileCard profile={draft.profile} onSave={saveProfile} />

          <fieldset ref={plansRef} aria-describedby={planError ? "plan-error" : undefined}>
            <legend className="text-lg font-display font-heading tracking-display">Pilih satu plan</legend>
            {planError && (
              <p id="plan-error" className="mt-2 flex items-center gap-2 text-sm font-medium text-danger">
                <AlertIcon className="size-4 shrink-0" />
                Pilih salah satu plan dulu sebelum membuat roadmap.
              </p>
            )}
            <ul className="mt-3 grid gap-4 xl:grid-cols-3">
              {draft.plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  name="plan"
                  checked={plan.id === selectedPlanId}
                  updated={updatedIds.has(plan.id)}
                  onSelect={selectPlan}
                />
              ))}
            </ul>
          </fieldset>

          <Link href="/start" className={`${buttonClass("ghost")} -ml-3`}>
            <ArrowLeftIcon className="size-5" />
            Ubah ceritaku
          </Link>
        </div>

        <div className="lg:sticky lg:top-6">
          <ChatPanel
            intro={draft.message}
            messages={session.messages}
            pending={pending}
            error={chatError}
            draftInput={chatInput}
            onDraftInput={setChatInput}
            onSend={sendChat}
          />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 transform-gpu border-t border-line bg-canvas px-4 py-3 lg:static lg:mt-8 lg:transform-none lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <p
            id="build-hint"
            className="hidden text-sm font-emphasis text-ink-muted sm:block"
            aria-live="polite"
          >
            {selected ? `Plan ${selected.id} dipilih: ${selected.title}` : "Pilih satu plan di atas dulu"}
          </p>
          <button
            type="button"
            onClick={build}
            aria-describedby={selected ? undefined : "build-hint"}
            className={`${buttonClass(selected ? "primary" : "inactive", "lg")} w-full sm:ml-auto sm:w-auto`}
          >
            {selected ? `Buat roadmap Plan ${selected.id}` : "Pilih plan dulu"}
            {selected && <ArrowRightIcon className="size-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyDraft() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="font-display text-[2rem] leading-[1.15] font-heading tracking-display">Belum ada draf</h1>
      <p className="mt-3 text-lg text-ink-muted">Ceritakan mimpimu dulu, lalu kami susun tiga pilihan rencana.</p>
      <Link href="/start" className={`${buttonClass("primary", "lg")} mt-8`}>
        Ceritakan mimpimu
      </Link>
    </div>
  );
}

function DraftSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-6xl animate-pulse">
      <div className="h-4 w-24 rounded-full bg-line" />
      <div className="mt-3 h-9 w-72 rounded-xl bg-line" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className="h-48 rounded-card bg-line" />
          <div className="h-64 rounded-card bg-line" />
        </div>
        <div className="h-96 rounded-card bg-line" />
      </div>
    </div>
  );
}
