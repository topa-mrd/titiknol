import { describe, expect, it } from "vitest";
import { RESOURCES } from "@/lib/resources";
import { RESOURCE_TYPES, ResourceSchema } from "@/lib/types";

describe("katalog sumber", () => {
  it("berisi minimal 25 sumber yang lolos skema", () => {
    expect(RESOURCES.length).toBeGreaterThanOrEqual(25);
    for (const resource of RESOURCES) {
      const result = ResourceSchema.safeParse(resource);
      expect(result.success, `${resource.id}: ${result.error?.message}`).toBe(true);
    }
  });

  it("id dan URL unik", () => {
    const ids = RESOURCES.map((r) => r.id);
    const urls = RESOURCES.map((r) => r.url);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("mencakup semua jenis sumber", () => {
    const types = new Set(RESOURCES.map((r) => r.type));
    for (const type of RESOURCE_TYPES) expect(types, `jenis "${type}" belum ada`).toContain(type);
  });

  it("tidak mencantumkan angka biaya pasti yang cepat basi", () => {
    const pricey = /rp\s?\d|\$\s?\d|\d+\s?(ribu|juta|rb|jt)\b/i;
    for (const r of RESOURCES) expect(r.note, r.id).not.toMatch(pricey);
  });
});
