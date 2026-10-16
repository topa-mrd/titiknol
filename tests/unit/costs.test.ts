import { describe, expect, it } from "vitest";
import { costLines, defaultQty, formatRange, summarize, withItem } from "@/lib/costs";
import { RESOURCES } from "@/lib/resources";
import { EMPTY_COSTS, type Price, type ResolvedStep, type ResourceLink } from "@/lib/types";
import { makeStep } from "../fixtures/data";

const link = (id: string): ResourceLink => {
  const r = RESOURCES.find((x) => x.id === id)!;
  return { id: r.id, title: r.title, provider: r.provider, type: r.type, url: r.url, cost: r.cost, price: r.price, reason: null, origin: r.origin, review: r.review };
};
const step = (n: number, weeks: number, ids: string[]): ResolvedStep => ({
  ...makeStep(n, { weeks, resourceIds: ids }),
  resources: ids.map(link),
  needs: [],
});

const steps = [
  step(1, 6, ["google-ux-design", "canva-design-school"]), // per bulan, 6 minggu → 2 bulan
  step(2, 2, ["aws-cloud-practitioner", "google-ux-design"]), // duplikat di langkah lain diabaikan
  step(3, 3, ["azure-fundamentals"]), // harga belum ada
];

describe("kalkulator biaya", () => {
  it("jumlah default: per bulan mengikuti durasi langkah", () => {
    expect(defaultQty("per bulan", 6)).toBe(2);
    expect(defaultQty("per bulan", 1)).toBe(1);
    expect(defaultQty("sekali", 12)).toBe(1);
  });

  it("satu baris per sumber, langganan dikali bulan, total berupa rentang", () => {
    const lines = costLines(steps, EMPTY_COSTS);
    expect(lines.map((l) => l.resource.id)).toEqual([
      "google-ux-design",
      "canva-design-school",
      "aws-cloud-practitioner",
      "azure-fundamentals",
    ]);
    expect(lines[0]).toMatchObject({ unit: "per bulan", item: { qty: 2 }, total: { min: 1_560_000, max: 1_720_000 }, origin: "kurasi" });
    expect(lines[1].total).toEqual({ min: 0, max: 0 });
    expect(lines[3]).toMatchObject({ total: null, origin: null });

    const sum = summarize(lines);
    expect(sum).toMatchObject({ min: 1_560_000 + 1_600_000, max: 1_720_000 + 1_750_000, taken: 4, free: 1, unknown: 1 });
  });

  it("koreksi pengguna, sumber tidak diambil, dan perkiraan AI ikut dihitung", () => {
    let costs = EMPTY_COSTS;
    const lines = costLines(steps, costs);
    costs = withItem(costs, lines[2], { amount: 1_700_000 }); // AWS dikoreksi
    costs = withItem(costs, lines[0], { included: false }); // Coursera tidak diambil
    const estimate: Price = { min: 900_000, max: 1_100_000, unit: "sekali", note: "", sourceUrl: "https://a.example", checkedAt: "2026-10-15", source: "ai" };
    costs = withItem(costs, lines[3], { estimate });

    const after = costLines(steps, costs);
    expect(after[2]).toMatchObject({ origin: "koreksi", total: { min: 1_700_000, max: 1_700_000 } });
    expect(after[3]).toMatchObject({ origin: "ai", total: { min: 900_000, max: 1_100_000 } });
    expect(summarize(after)).toMatchObject({ min: 2_600_000, max: 2_800_000, taken: 3, unknown: 0, hasAiEstimate: true });
  });

  it("format rupiah", () => {
    expect(formatRange({ min: 0, max: 0 })).toBe("Gratis");
    expect(formatRange({ min: 200_000, max: 200_000 })).toBe("Rp200.000");
    expect(formatRange({ min: 475_000, max: 750_000 })).toBe("Rp475.000–Rp750.000");
  });
});
