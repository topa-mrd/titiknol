import { expect, test, type Page } from "@playwright/test";
import { createRoadmap } from "./helpers";

/** Biaya besar (kuliah, hidup, perjalanan) di kalkulator. E2E berjalan di mode demo; pencarian web disimulasikan. */
const EXTRAS = [
  {
    id: "kuliah-tuition-1",
    label: "Tuition fee S2 Data Science, Utrecht University",
    category: "pendidikan",
    min: 180_000_000,
    max: 500_000_000,
    unit: "per tahun",
    qty: 2,
    included: true,
    amount: null,
    note: "Tarif mahasiswa non-EU/EEA. Dikonversi dari EUR dengan kurs perkiraan.",
    sourceUrl: "https://www.uu.nl/en/masters/tuition-fees",
    sourceTitle: "Utrecht University",
    checkedAt: "2026-10-16",
  },
  {
    id: "hidup-biaya-hidup-1",
    label: "Biaya hidup mahasiswa di Belanda",
    category: "hidup",
    min: 17_500_000,
    max: 28_600_000,
    unit: "per bulan",
    qty: 24,
    included: true,
    amount: null,
    note: "Termasuk sewa kamar, makan, transportasi.",
    sourceUrl: "https://education.ec.europa.eu/study-in-europe/netherlands",
    sourceTitle: "Study in Europe",
    checkedAt: "2026-10-16",
  },
];

async function realAi(page: Page) {
  const calls: unknown[] = [];
  await page.route("**/api/status", (route) => route.fulfill({ json: { ai: "openrouter", supabase: false } }));
  await page.route("**/api/costs", async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ json: { extras: EXTRAS, status: "selesai", provider: "openrouter", fallback: false } });
  });
  return calls;
}

const rupiah = (text: string | null) => Number((text ?? "").split("–")[0].replace(/\D/g, ""));

test.describe("Kalkulator: biaya besar lainnya", () => {
  test("mode demo: tidak mengarang angka, hanya keterangan", async ({ page }) => {
    await createRoadmap(page);
    const big = page.getByRole("region", { name: "Biaya besar lainnya" });
    await expect(big).toContainText("Di mode demo bagian ini belum aktif.");
    await expect(big.getByRole("listitem")).toHaveCount(0);
  });

  test("AI aktif: kuliah & biaya hidup dicari otomatis, masuk total, bisa diatur, tersimpan tanpa dicari ulang", async ({ page }, testInfo) => {
    const calls = await realAi(page);
    await createRoadmap(page);
    const total = page.locator("#cost-total");
    const big = page.getByRole("region", { name: "Biaya besar lainnya" });
    const tuition = big.getByRole("listitem").filter({ hasText: "Tuition fee S2" });
    await expect(tuition).toBeVisible();
    expect(calls).toHaveLength(1);
    const sent = calls[0] as { plan: { title: string }; steps: string[]; existing: string[] };
    expect(sent.steps.length).toBeGreaterThan(0);
    expect(Array.isArray(sent.existing)).toBe(true);

    // Rp180–500 jt × 2 tahun + Rp17,5–28,6 jt × 24 bulan ⊂ total.
    await expect(tuition).toContainText("perkiraan AI");
    await expect(tuition).toContainText("× 2");
    await expect(tuition.getByRole("link", { name: /uu\.nl/ })).toHaveAttribute("href", EXTRAS[0].sourceUrl);
    expect(rupiah(await total.textContent())).toBeGreaterThanOrEqual(180_000_000 * 2 + 17_500_000 * 24);
    await expect(total.locator("xpath=following-sibling::p[1]")).toContainText("2 biaya besar");
    await big.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("biaya-besar.png"), fullPage: true });

    // Lama kuliah 1 tahun saja → total turun.
    const before = rupiah(await total.textContent());
    await tuition.getByRole("spinbutton", { name: /Lama \(tahun\)/ }).fill("1");
    await expect.poll(async () => rupiah(await total.textContent())).toBe(before - 180_000_000);

    // Tidak diambil (misal dapat beasiswa penuh) → keluar dari total.
    const living = big.getByRole("listitem").filter({ hasText: "Biaya hidup mahasiswa" });
    await living.getByRole("checkbox", { name: "Biaya hidup mahasiswa di Belanda" }).uncheck();
    await expect.poll(async () => rupiah(await total.textContent())).toBe(before - 180_000_000 - 17_500_000 * 24);
    await expect(page.getByRole("region", { name: "Kalkulator biaya" }).getByText("Tersimpan", { exact: true })).toBeVisible();

    await page.reload();
    await expect(big.getByRole("listitem").filter({ hasText: "Tuition fee S2" })).toBeVisible();
    await expect(big.getByRole("listitem").filter({ hasText: "Tuition fee S2" }).getByRole("spinbutton", { name: /Lama/ })).toHaveValue("1");
    await expect(big.getByRole("checkbox", { name: "Biaya hidup mahasiswa di Belanda" })).not.toBeChecked();
    expect(calls).toHaveLength(1);
  });

  test("pencarian gagal: pesan jelas + Coba lagi", async ({ page }) => {
    await page.route("**/api/status", (route) => route.fulfill({ json: { ai: "openrouter", supabase: false } }));
    let fail = true;
    await page.route("**/api/costs", (route) =>
      fail
        ? route.fulfill({ status: 503, json: { error: "Biaya kuliah dan biaya hidup belum bisa dicari sekarang. Coba lagi nanti, atau isi perkiraanmu sendiri." } })
        : route.fulfill({ json: { extras: EXTRAS.slice(0, 1), status: "selesai", provider: "openrouter", fallback: false } }),
    );
    await createRoadmap(page);
    const big = page.getByRole("region", { name: "Biaya besar lainnya" });
    await expect(big.getByRole("alert")).toContainText("belum bisa dicari");
    fail = false;
    await big.getByRole("button", { name: "Coba lagi" }).click();
    await expect(big.getByRole("listitem").filter({ hasText: "Tuition fee S2" })).toBeVisible();
  });
});
