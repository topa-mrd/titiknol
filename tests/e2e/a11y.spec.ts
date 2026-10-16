import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createDraft, createRoadmap, loginDemo, stepNode } from "./helpers";

/**
 * Audit aksesibilitas otomatis (axe, WCAG 2.2 A/AA) di setiap halaman dan
 * state penting: dialog, panel langkah, kalkulator, editor tulisan.
 * Animasi dimatikan agar elemen yang sedang memudar tidak terbaca kontras palsu.
 */
async function audit(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.slice(0, 5).map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`),
  }));
  expect(summary, `Pelanggaran a11y di ${label}`).toEqual([]);
}

test.use({ reducedMotion: "reduce" });

test.describe("Aksesibilitas (axe)", () => {
  test("halaman publik", async ({ page }) => {
    for (const path of ["/", "/start", "/login", "/blog", "/komunitas", "/komunitas?tab=komunitas", "/experience", "/mitra", "/share", "/admin", "/syarat", "/privasi", "/halaman-yang-tidak-ada"]) {
      await page.goto(path);
      await audit(page, path);
    }
    await page.goto("/blog/baca?id=00000000-0000-4000-a000-0000000000a1");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await audit(page, "/blog/baca (contoh)");
  });

  test("Drafting", async ({ page }) => {
    await createDraft(page);
    await audit(page, "/draft");
  });

  test("roadmap: jalur, panel langkah, kalkulator, daftar roadmap", async ({ page }) => {
    await createRoadmap(page);
    await audit(page, "/roadmap/view");
    await stepNode(page, 1).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await audit(page, "panel langkah");
    await page.keyboard.press("Escape");
    await page.goto("/roadmap");
    await audit(page, "/roadmap");
  });

  test("Experience: dialog daftar; Share: editor dan Tulisanku; admin", async ({ page }) => {
    await loginDemo(page, "/experience");
    await page.getByRole("button", { name: /^Daftar ke / }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await audit(page, "dialog daftar");
    await page.keyboard.press("Escape");

    await page.goto("/share");
    const main = page.getByRole("main");
    await main.getByRole("textbox", { name: "Ceritakan dengan suaramu" }).fill("Aku belajar desain dari HP sampai dapat klien pertama dari warung tetangga.");
    await main.getByRole("button", { name: "Olah jadi tulisan" }).click();
    await expect(main.getByRole("heading", { name: "Periksa tulisanmu" })).toBeVisible();
    await audit(page, "editor tulisan");
    await main.getByRole("button", { name: "Terbitkan", exact: true }).click();
    await expect(main.getByText("Tulisanmu sudah terbit!")).toBeVisible();
    await audit(page, "tulisan terbit");

    await page.goto("/mitra");
    await audit(page, "/mitra (masuk)");
    await page.goto("/admin");
    await audit(page, "/admin");
    await main.getByRole("tab", { name: "Blog & komunitas" }).click();
    await audit(page, "/admin blog");
  });
});
