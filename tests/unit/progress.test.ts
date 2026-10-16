import { describe, expect, it } from "vitest";
import { currentIndex, setStepDone, stats, stepStatus, toggleTodo, todoCount } from "@/lib/progress";
import { EMPTY_PROGRESS, type ResolvedStep } from "@/lib/types";
import { makeStep } from "../fixtures/data";

const steps: ResolvedStep[] = [1, 2, 3, 4].map((n) => ({ ...makeStep(n, { weeks: n }), resources: [], needs: [] }));

describe("progres roadmap", () => {
  it("langkah sekarang = langkah pertama yang belum selesai", () => {
    expect(currentIndex(steps, EMPTY_PROGRESS)).toBe(0);
    expect(currentIndex(steps, { doneSteps: ["s1", "s2"], doneTodos: [] })).toBe(2);
    // Menyelesaikan langkah di depan tidak melompati langkah yang tertinggal.
    expect(currentIndex(steps, { doneSteps: ["s1", "s3"], doneTodos: [] })).toBe(1);
    expect(currentIndex(steps, { doneSteps: ["s1", "s2", "s3", "s4"], doneTodos: [] })).toBe(-1);
  });

  it("status tiap langkah", () => {
    const progress = { doneSteps: ["s1"], doneTodos: [] };
    expect([0, 1, 2].map((i) => stepStatus(steps, progress, i))).toEqual(["done", "current", "upcoming"]);
  });

  it("centang dan batal centang to-do", () => {
    const once = toggleTodo(EMPTY_PROGRESS, "s1", 1);
    expect(once.doneTodos).toEqual(["s1#1"]);
    expect(toggleTodo(once, "s1", 1).doneTodos).toEqual([]);
    expect(todoCount(steps[0], once)).toEqual({ done: 1, total: 2 });
  });

  it("tandai selesai mencentang semua to-do; membatalkan tidak menghapus centang", () => {
    const done = setStepDone(toggleTodo(EMPTY_PROGRESS, "s1", 0), steps[0], true);
    expect(done.doneSteps).toEqual(["s1"]);
    expect(done.doneTodos.sort()).toEqual(["s1#0", "s1#1"]);
    expect(setStepDone(done, steps[0], true)).toEqual(done); // idempoten
    const undone = setStepDone(done, steps[0], false);
    expect(undone.doneSteps).toEqual([]);
    expect(undone.doneTodos).toHaveLength(2);
  });

  it("statistik: persen, minggu tersisa, dan selesai semua", () => {
    expect(stats(steps, { doneSteps: ["s1", "s2"], doneTodos: [] })).toMatchObject({
      doneSteps: 2,
      totalSteps: 4,
      percent: 50,
      totalWeeks: 10,
      weeksLeft: 7,
      complete: false,
    });
    expect(stats(steps, { doneSteps: ["s1", "s2", "s3", "s4", "s9"], doneTodos: [] }).complete).toBe(true);
  });
});
