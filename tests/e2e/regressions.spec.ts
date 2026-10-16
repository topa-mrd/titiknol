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
      const overlaps = (a: NonNullable<(typeof boxes)[number]>, b: NonNullable<(typeof boxes)[number]>) =>
        a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!), `kotak ${i} dan ${j} bertumpuk`).toBe(false);
    });
  }

  test("HP: navigasi di bar tab bawah, tersembunyi di Drafting, tidak menutupi konten", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "khusus layar HP");
    await page.goto("/blog");
    const tabs = page.locator("[data-tabbar]");
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Blog" })).toHaveAttribute("aria-current", "page");
    for (const name of ["Roadmap", "Experience", "Tulis", "Komunitas"]) await expect(tabs.getByRole("link", { name })).toBeVisible();
    // Baris nav atas tidak tampil di HP.
    await expect(page.locator("header").getByRole("link", { name: "Komunitas" })).toBeHidden();

    // Konten terbawah tetap bisa digulir ke atas bar.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastCard = page.getByRole("main").getByRole("article").last();
    const card = (await lastCard.boundingBox())!;
    const bar = (await tabs.boundingBox())!;
    expect(card.y + card.height).toBeLessThanOrEqual(bar.y + 1);

    await tabs.getByRole("link", { name: "Komunitas" }).click();
    await expect(page).toHaveURL(/\/komunitas/);
    await expect(page.locator("[data-tabbar]").getByRole("link", { name: "Komunitas" })).toHaveAttribute("aria-current", "page");

    await page.goto("/draft");
    await expect(page.locator("[data-tabbar]")).toHaveCount(0);
  });

  test("tablet: tanpa bar tab bawah, nav di baris kedua header", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "cukup sekali");
    await page.setViewportSize({ width: 820, height: 900 });
    await page.goto("/komunitas");
    await expect(page.locator("[data-tabbar]")).toBeHidden();
    await expect(page.locator("header").getByRole("link", { name: "Tulis cerita" })).toBeVisible();
  });
});
