import type { Plan } from "@/lib/types";
import { COST_LABEL, COST_TONE } from "@/lib/labels";
import { CheckIcon, ChevronDownIcon } from "./icons";

type PlanCardProps = {
  plan: Plan;
  name: string;
  checked: boolean;
  updated: boolean;
  onSelect: (id: Plan["id"]) => void;
};

/** Kartu plan sebagai radio: seluruh kartu bisa diklik, detail bisa dibuka terpisah. */
export function PlanCard({ plan, name, checked, updated, onSelect }: PlanCardProps) {
  const inputId = `plan-${plan.id}`;
  return (
    <li
      className={`flex flex-col rounded-card border-2 border-b-4 bg-surface transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-sky ${
        checked ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-muted"
      }`}
    >
      <label htmlFor={inputId} className="flex flex-1 cursor-pointer flex-col gap-3 p-5 sm:p-6">
        <input
          id={inputId}
          type="radio"
          name={name}
          value={plan.id}
          checked={checked}
          onChange={() => onSelect(plan.id)}
          className="sr-only"
        />
        <span className="text-lg leading-snug font-display font-heading tracking-display text-balance sm:text-xl xl:text-lg">
          <span className="text-ink-muted">Plan {plan.id}</span> {plan.title}
        </span>
        <span className="leading-relaxed text-ink-muted">{plan.tagline}</span>
        <span className="mt-auto flex items-center justify-between gap-3">
          <span className="flex flex-wrap gap-2 text-sm font-medium">
            <span className="rounded-full bg-surface-muted px-2.5 py-1">{plan.duration}</span>
            <span className={`rounded-full px-2.5 py-1 ${COST_TONE[plan.costLevel]}`}>{COST_LABEL[plan.costLevel]}</span>
            {updated && <span className="rounded-full border border-line-strong px-2.5 py-1 text-ink">Diperbarui</span>}
          </span>
          <span
            aria-hidden="true"
            className={`grid size-7 shrink-0 place-items-center rounded-full border transition-colors ${
              checked ? "border-brand-lip bg-brand text-on-brand" : "border-line-strong bg-surface"
            }`}
          >
            {checked && <CheckIcon className="size-4 motion-safe:animate-[pop_380ms_var(--ease-out-expo)]" strokeWidth={3} />}
          </span>
        </span>
      </label>

      <details className="group mt-auto border-t border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-b-card px-5 py-3 text-sm font-heading tracking-wide text-link uppercase sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Lihat detail Plan {plan.id}</span>
          <span className="hidden group-open:inline">Sembunyikan detail</span>
          <ChevronDownIcon aria-hidden="true" className="size-4 text-ink-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 px-5 pb-5 text-sm leading-relaxed sm:px-6">
          <Detail title="Cara menjalaninya">{plan.approach}</Detail>
          <Detail title="Kenapa cocok untukmu">{plan.whyFits}</Detail>
          <div>
            <p className="font-emphasis">Tonggak</p>
            <ol className="mt-1.5 space-y-1.5">
              {plan.milestones.map((m, i) => (
                <li key={m} className="flex gap-2 text-ink-muted">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-muted text-xs font-emphasis text-ink">
                    {i + 1}
                  </span>
                  {m}
                </li>
              ))}
            </ol>
          </div>
          <Detail title="Yang perlu kamu tahu">{plan.tradeoff}</Detail>
        </div>
      </details>
    </li>
  );
}

function Detail({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <p className="font-emphasis">{title}</p>
      <p className="mt-1 text-ink-muted">{children}</p>
    </div>
  );
}
