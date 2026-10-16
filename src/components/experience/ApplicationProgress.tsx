import { APPLICATION_FLOW, APPLICATION_STATUS_LABEL } from "@/lib/opportunities";
import type { ApplicationStatus } from "@/lib/types";
import { CheckIcon } from "../icons";

const TONE: Record<ApplicationStatus, string> = {
  dikirim: "bg-sky-soft text-link",
  diproses: "bg-sky-soft text-link",
  diteruskan: "bg-sun-soft text-on-sun",
  diterima: "bg-leaf-soft text-leaf-ink",
  bekerja: "bg-leaf-soft text-leaf-ink",
  selesai: "bg-leaf-soft text-leaf-ink",
  ditolak: "bg-danger-soft text-ink",
  dibatalkan: "bg-surface-muted text-ink-muted",
};

export function StatusChip({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-heading ${TONE[status]}`}>
      {APPLICATION_STATUS_LABEL[status]}
    </span>
  );
}

/** Tahap lamaran sebagai deretan titik: terkirim → dicek admin → diteruskan → diterima → bekerja → selesai. */
export function ApplicationProgress({ status }: { status: ApplicationStatus }) {
  if (status === "ditolak" || status === "dibatalkan") return null;
  const at = APPLICATION_FLOW.indexOf(status);
  return (
    <ol aria-label="Tahap lamaran" className="mt-3 flex items-center gap-1.5">
      {APPLICATION_FLOW.map((step, i) => (
        <li key={step} className="flex flex-1 items-center gap-1.5 last:flex-none">
          <span
            aria-current={i === at ? "step" : undefined}
            title={APPLICATION_STATUS_LABEL[step]}
            className={`grid size-5 shrink-0 place-items-center rounded-full ${
              i < at ? "bg-leaf text-on-leaf" : i === at ? "bg-brand text-on-brand ring-4 ring-brand/20" : "border-2 border-line bg-surface"
            }`}
          >
            {i < at && <CheckIcon className="size-3" strokeWidth={3.5} />}
            <span className="sr-only">
              {APPLICATION_STATUS_LABEL[step]}
              {i < at ? " (selesai)" : i === at ? " (sekarang)" : ""}
            </span>
          </span>
          {i < APPLICATION_FLOW.length - 1 && (
            <span aria-hidden="true" className={`h-1 flex-1 rounded-full ${i < at ? "bg-leaf" : "bg-line"}`} />
          )}
        </li>
      ))}
    </ol>
  );
}
