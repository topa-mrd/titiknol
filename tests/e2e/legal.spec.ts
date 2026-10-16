import { expect, test } from "@playwright/test";

test.describe("Syarat Layanan & Kebijakan Privasi", () => {
  test("bisa dibuka dari footer landing, punya daftar isi dan kontak", async ({ page }, testInfo) => {
    await page.goto("/");
    const footer = page.getByRole("navigation", { name: "Informasi" });
    await footer.getByRole("link", { name: "Syarat Layanan" }).click();
    await expect(page).toHaveURL(/\/syarat$/);
    await expect(page).toHaveTitle(/^Syarat Layanan · TitikNol/);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: "Syarat Layanan" })).toBeVisible();
    await expect(main.getByText("Berlaku sejak 16 Oktober 2026")).toBeVisible();
    await expect(main.getByRole("heading", { level: 2, name: /Saran dari AI/ })).toBeVisible();
    await expect(main.getByRole("link", { name: "musthafarafii.d@gmail.com" }).first()).toHaveAttribute("href", "mailto:musthafarafii.d@gmail.com");
    await page.screenshot({ path: testInfo.outputPath("syarat.png"), fullPage: true });

    await main.getByRole("link", { name: "Kebijakan Privasi" }).last().click();
    await expect(page).toHaveURL(/\/privasi$/);
    await expect(main.getByRole("heading", { level: 1, name: "Kebijakan Privasi" })).toBeVisible();
    await expect(main.getByText(/termasuk persyaratan Limited Use/)).toBeVisible();
    // Daftar isi melompat ke bagian yang dipilih.
    await main.getByRole("navigation", { name: "Isi" }).getByRole("link", { name: /Data dari akun Google/ }).click();
    await expect(page).toHaveURL(/\/privasi#google$/);
  });

  test("halaman login menautkan kedua dokumen", async ({ page }) => {
    await page.goto("/login");
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: "Syarat Layanan" })).toHaveAttribute("href", "/syarat");
    await expect(main.getByRole("link", { name: "Kebijakan Privasi" })).toHaveAttribute("href", "/privasi");
  });
});
