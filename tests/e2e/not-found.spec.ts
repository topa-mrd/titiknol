import { expect, test } from "@playwright/test";

test.describe("Halaman tidak ada", () => {
  test("URL asing → 404 berbahasa Indonesia dengan jalan pulang", async ({ page }, testInfo) => {
    const res = await page.goto("/ini-tidak-ada");
    expect(res?.status()).toBe(404);
    await expect(page).toHaveTitle(/Halaman tidak ditemukan · TitikNol/);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "Halaman ini tidak ditemukan" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigasi utama" }).first()).toBeAttached();
    await page.screenshot({ path: testInfo.outputPath("404.png"), fullPage: true });
    await main.getByRole("link", { name: "Ke beranda" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("id tulisan asing → pesan jelas, bukan layar kosong", async ({ page }) => {
    await page.goto("/blog/baca?id=bukan-id");
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Tulisan tidak ditemukan" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Ke Blog" })).toBeVisible();
  });
});
