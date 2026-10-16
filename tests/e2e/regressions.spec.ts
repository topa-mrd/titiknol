import { expect, test } from "@playwright/test";
import { createRoadmap, loginDemo } from "./helpers";

test.describe("Regresi", () => {
  test("Kembali ke draf setelah roadmap jadi → draf tampil (bukan loader), roadmap tidak dibuat ganda", async ({ page }) => {
    const id = await createRoadmap(page);
    await page.getByRole("link", { name: "Kembali ke draf" }).click();
    await expect(page).toHaveURL(/\/draft$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tiga jalur untukmu" })).toBeVisible();
    await expect(page.getByText("Menyimpan roadmapmu")).toHaveCount(0);

    await page.getByRole("button", { name: /^Buat roadmap Plan/ }).click();
    await expect(page).toHaveURL(new RegExp(`/roadmap/view\\?id=${id}$`));
    await page.goto("/roadmap");
    await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: /Plan [ABC]/ })).toHaveCount(1);
  });

  for (const width of [768, 900, 1100]) {
    test(`header tidak bertumpuk dan tidak membuat scroll horizontal di lebar ${width}px (masuk)`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop", "cukup sekali");
      await page.setViewportSize({ width, height: 800 });
      await loginDemo(page, "/blog", "Rafii Musthafa Panjang Sekali");
      await expect(page.getByRole("button", { name: "Keluar" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // Nav ada di baris kedua dan semua tautannya terlihat.
      const nav = page.getByRole("navigation", { name: "Navigasi utama" }).locator("visible=true");
      await expect(nav.getByRole("link", { name: "Komunitas" })).toBeVisible();
      // Tombol tulis, akun, dan suara tidak saling menimpa.
      const boxes = await Promise.all(
        [page.locator("header").getByRole("link", { name: "Tulis cerita" }).locator("visible=true"), page.locator("header").getByRole("button", { name: "Keluar" }), page.locator("header").getByRole("button", { name: "Efek suara" })].map((l) => l.boundingBox()),
      );
      for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.x).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width - 1);
    });
  }
});
