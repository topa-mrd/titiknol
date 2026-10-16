import { todoKey, type Progress, type ResolvedStep } from "./types";

export type StepStatus = "done" | "current" | "upcoming";

/** Langkah "sekarang" = langkah pertama yang belum selesai; -1 bila semua selesai. */
export function currentIndex(steps: ResolvedStep[], progress: Progress): number {
  return steps.findIndex((s) => !progress.doneSteps.includes(s.id));
}

export function stepStatus(steps: ResolvedStep[], progress: Progress, index: number): StepStatus {
  if (progress.doneSteps.includes(steps[index].id)) return "done";
  return index === currentIndex(steps, progress) ? "current" : "upcoming";
}

export function toggleTodo(progress: Progress, stepId: string, index: number): Progress {
  const key = todoKey(stepId, index);
  const doneTodos = progress.doneTodos.includes(key)
    ? progress.doneTodos.filter((k) => k !== key)
    : [...progress.doneTodos, key];
  return { ...progress, doneTodos };
}

/** Menandai selesai sekaligus mencentang semua to-do langkah itu. Membatalkan tidak menghapus centang. */
export function setStepDone(progress: Progress, step: ResolvedStep, done: boolean): Progress {
  if (!done) return { ...progress, doneSteps: progress.doneSteps.filter((id) => id !== step.id) };
  const keys = step.todos.map((_, i) => todoKey(step.id, i));
  return {
    doneSteps: progress.doneSteps.includes(step.id) ? progress.doneSteps : [...progress.doneSteps, step.id],
    doneTodos: [...new Set([...progress.doneTodos, ...keys])],
  };
}

export function todoCount(step: ResolvedStep, progress: Progress): { done: number; total: number } {
  const done = step.todos.filter((_, i) => progress.doneTodos.includes(todoKey(step.id, i))).length;
  return { done, total: step.todos.length };
}

export function stats(steps: ResolvedStep[], progress: Progress) {
  const ids = new Set(steps.map((s) => s.id));
  const doneSteps = progress.doneSteps.filter((id) => ids.has(id)).length;
  const totalWeeks = steps.reduce((sum, s) => sum + s.weeks, 0);
  const weeksLeft = steps.filter((s) => !progress.doneSteps.includes(s.id)).reduce((sum, s) => sum + s.weeks, 0);
  return {
    doneSteps,
    totalSteps: steps.length,
    percent: steps.length ? Math.round((doneSteps / steps.length) * 100) : 0,
    totalWeeks,
    weeksLeft,
    complete: steps.length > 0 && doneSteps === steps.length,
  };
}
