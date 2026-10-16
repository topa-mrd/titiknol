import type { CostItem, Price, PriceUnit, ResolvedStep, ResourceLink, RoadmapCosts } from "./types";

/**
 * Kalkulator biaya roadmap. Harga satuan: koreksi pengguna → harga katalog
 * (kurasi/perkiraan AI tersimpan) → perkiraan AI di roadmap ini → belum ada.
 * Total selalu rentang (min–maks) karena harga resmi sering berupa rentang.
 */

export type Range = { min: number; max: number };
export type PriceOrigin = "koreksi" | "kurasi" | "ai" | null;

export type CostLine = {
  resource: ResourceLink;
  /** Langkah pertama yang memakai sumber ini (0-based). */
  stepIndex: number;
  item: CostItem;
  unit: PriceUnit;
  price: Price | null;
  unitRange: Range | null;
  total: Range | null;
  origin: PriceOrigin;
};

/** "per bulan" mengikuti durasi langkah (dibulatkan ke atas per 4 minggu); lainnya 1×. */
export function defaultQty(unit: PriceUnit, weeks: number): number {
  return unit === "per bulan" ? Math.max(1, Math.ceil(weeks / 4)) : 1;
}

export function costLines(steps: ResolvedStep[], costs: RoadmapCosts): CostLine[] {
  const seen = new Set<string>();
  const lines: CostLine[] = [];
  steps.forEach((step, stepIndex) => {
    for (const resource of step.resources) {
      if (seen.has(resource.id)) continue;
      seen.add(resource.id);
      const saved = costs.items[resource.id];
      const price = resource.price ?? saved?.estimate ?? null;
      const unit = price?.unit ?? "sekali";
      const item: CostItem = saved ?? { included: true, amount: null, qty: defaultQty(unit, step.weeks), estimate: null };
      const unitRange: Range | null =
        item.amount !== null ? { min: item.amount, max: item.amount } : price ? { min: price.min, max: price.max } : null;
      const origin: PriceOrigin = item.amount !== null ? "koreksi" : price ? price.source : null;
      lines.push({
        resource,
        stepIndex,
        item,
        unit,
        price,
        unitRange,
        total: unitRange ? { min: unitRange.min * item.qty, max: unitRange.max * item.qty } : null,
        origin,
      });
    }
  });
  return lines;
}

export function summarize(lines: CostLine[]) {
  const taken = lines.filter((l) => l.item.included);
  const priced = taken.filter((l) => l.total);
  return {
    min: priced.reduce((sum, l) => sum + l.total!.min, 0),
    max: priced.reduce((sum, l) => sum + l.total!.max, 0),
    taken: taken.length,
    free: taken.filter((l) => l.total && l.total.max === 0).length,
    unknown: taken.filter((l) => !l.total).length,
    hasAiEstimate: taken.some((l) => l.origin === "ai"),
  };
}

/** Perbarui satu item tanpa mengubah item lain. */
export function withItem(costs: RoadmapCosts, line: CostLine, patch: Partial<CostItem>): RoadmapCosts {
  return { items: { ...costs.items, [line.resource.id]: { ...line.item, ...patch } } };
}

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
export const formatIdr = (n: number) => idr.format(n).replace(/\s/g, "");

export function formatRange(range: Range): string {
  if (range.max === 0) return "Gratis";
  return range.min === range.max ? formatIdr(range.min) : `${formatIdr(range.min)}–${formatIdr(range.max)}`;
}
