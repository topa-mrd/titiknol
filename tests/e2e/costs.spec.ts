import { expect, test } from "@playwright/test";
import { createRoadmap, stepNode } from "./helpers";

test.describe("Kalkulator biaya", () => {
  test("total, koreksi, batal ambil, cari harga AI; tersimpan setelah refresh", async ({ page }, testInfo) => {
    await createRoadmap(page);
    const calc = page.getByRole("region", { name: "Kalkulator biaya" });
    await expect(calc).toBeVisible();
    const total = page.locator("#cost-total");
    const initial = await total.textContent();
    expect(initial).toMatch(/^Rp/);
    await calc.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("calculator.png"), fullPage: true });

    // Koreksi harga sumber berbayar.
    const firstPriced = calc.getByRole("listitem").filter({ hasText: "dari situs resmi" }).first();
    const pricedName = (await firstPriced.locator("label").first().textContent())!;
    // Kunci baris berdasarkan nama: label asal harga akan berubah jadi "koreksimu".
    const priced = calc.getByRole("listitem").filter({ hasText: pricedName });
    await priced.getByRole("textbox", { name: `Harga ${pricedName} menurutmu dalam rupiah` }).fill("100000");
    await expect(priced).toContainText("koreksimu");
    await expect(total).not.toHaveText(initial!);
    const corrected = await total.textContent();

    // Tidak diambil → keluar dari total.
    await priced.getByRole("checkbox", { name: pricedName }).uncheck();
    await expect(total).not.toHaveText(corrected!);

    // Sumber tanpa harga: mode demo jujur tidak mengarang angka.
    const firstUnknown = calc.getByRole("listitem").filter({ hasText: "Harga belum ada" }).first();
    const unknownName = (await firstUnknown.locator("label").first().textContent())!;
    const unknown = calc.getByRole("listitem").filter({ hasText: unknownName });
    await unknown.getByRole("button", { name: "Cari perkiraan harga (AI)" }).click();
    await expect(unknown.getByRole("alert")).toContainText("belum aktif");

    // Dengan Gemini aktif (disimulasikan): perkiraan AI tampil dengan label dan link sumber.
    await page.route("**/api/price", (route) =>
      route.fulfill({
        json: {
          method: "ai",
          price: {
            min: 1_000_000,
            max: 1_200_000,
            unit: "sekali",
            note: "Perkiraan AI dari pencarian web.",
            sourceUrl: "https://contoh.example/harga",
            checkedAt: "2026-10-15",
            source: "ai",
          },
        },
      }),
    );
    await unknown.getByRole("button", { name: "Cari perkiraan harga (AI)" }).click();
    const estimated = calc.getByRole("listitem").filter({ hasText: unknownName });
    await expect(estimated).toContainText("perkiraan AI");
    await expect(estimated).toContainText("Rp1.000.000–Rp1.200.000");
    await expect(estimated.getByRole("link", { name: /cek harga/ })).toHaveAttribute("href", "https://contoh.example/harga");
    await expect(calc.getByText("Tersimpan", { exact: true })).toBeVisible();

    // Refresh → semua pilihan tetap.
    await page.reload();
    const calcAgain = page.getByRole("region", { name: "Kalkulator biaya" });
    const pricedAgain = calcAgain.getByRole("listitem").filter({ hasText: pricedName });
    await expect(pricedAgain.getByRole("checkbox", { name: pricedName })).not.toBeChecked();
    await pricedAgain.getByRole("checkbox", { name: pricedName }).check();
    await expect(pricedAgain.getByRole("textbox", { name: /menurutmu/ })).toHaveValue("100.000");
    await expect(calcAgain.getByRole("listitem").filter({ hasText: unknownName })).toContainText("perkiraan AI");
  });

  test("detail langkah menampilkan alasan pemilihan sumber dan harganya", async ({ page }) => {
    await createRoadmap(page);
    await stepNode(page, 1).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(/^Sesuai kebutuhan /).first()).toBeVisible();
  });
});
