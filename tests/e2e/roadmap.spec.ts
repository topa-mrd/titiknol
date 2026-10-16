import { expect, test } from "@playwright/test";
import { createRoadmap, stepNode } from "./helpers";

const progressOf = (page: import("@playwright/test").Page, id: string) =>
  page.evaluate((roadmapId) => {
    const rows = JSON.parse(localStorage.getItem("titiknol:demo:roadmaps") ?? "[]") as {
      id: string;
      progress: { doneSteps: string[]; doneTodos: string[] };
    }[];
    return rows.find((r) => r.id === roadmapId)?.progress;
  }, id);

test.describe("Roadmap", () => {
  test("centang to-do & tandai selesai; refresh → progres tetap", async ({ page }, testInfo) => {
    const id = await createRoadmap(page);
    const steps = page.getByRole("list", { name: "Langkah roadmap" }).getByRole("listitem");
    const total = await steps.count();
    expect(total).toBeGreaterThanOrEqual(4);
    await expect(stepNode(page, 1)).toHaveAccessibleName(/sedang kamu kerjakan/);
    await expect(page.getByText("Kamu di sini")).toBeVisible();
    await expect(page.getByText(`0 dari ${total} langkah selesai`)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("roadmap.png"), fullPage: true });

    // Buka langkah 1 → bottom sheet berisi to-do, sumber katalog, skill.
    await stepNode(page, 1).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(sheet.getByRole("link", { name: /buka di tab baru/ }).first()).toHaveAttribute("rel", "noopener noreferrer");
    const todos = sheet.getByRole("checkbox");
    await todos.first().check();
    await expect(todos.first()).toBeChecked();
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("roadmap-sheet.png") });

    // Tandai selesai → node 1 hijau, "Kamu di sini" pindah ke langkah 2.
    await sheet.getByRole("button", { name: "Tandai selesai" }).click();
    await expect(sheet).toBeHidden();
    await expect(stepNode(page, 1)).toHaveAccessibleName(/selesai/);
    await expect(stepNode(page, 2)).toHaveAccessibleName(/sedang kamu kerjakan/);
    await expect(page.getByText(`1 dari ${total} langkah selesai`)).toBeVisible();

    // Centang satu to-do di langkah 2 tanpa menandai selesai.
    await stepNode(page, 2).click();
    await page.getByRole("dialog").getByRole("checkbox").nth(1).check();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(stepNode(page, 2)).toBeFocused(); // fokus kembali ke node

    const saved = await progressOf(page, id);
    expect(saved?.doneSteps).toEqual(["s1"]);
    expect(saved?.doneTodos).toEqual(expect.arrayContaining(["s1#0", "s2#1"]));

    // Refresh → progres tetap.
    await page.reload();
    await expect(stepNode(page, 1)).toHaveAccessibleName(/selesai/);
    await expect(stepNode(page, 2)).toHaveAccessibleName(/sedang kamu kerjakan/);
    await expect(page.getByText(`1 dari ${total} langkah selesai`)).toBeVisible();
    await stepNode(page, 2).click();
    await expect(page.getByRole("dialog").getByRole("checkbox").nth(1)).toBeChecked();
    await expect(page.getByRole("dialog").getByRole("checkbox").first()).not.toBeChecked();
  });

  test("semua langkah selesai → ajakan ke Experience", async ({ page }, testInfo) => {
    await createRoadmap(page, "C");
    const total = await page.getByRole("list", { name: "Langkah roadmap" }).getByRole("listitem").count();
    for (let n = 1; n <= total; n++) {
      await stepNode(page, n).click();
      await page.getByRole("dialog").getByRole("button", { name: "Tandai selesai" }).click();
      await expect(stepNode(page, n)).toHaveAccessibleName(/selesai/);
    }
    await expect(page.getByRole("heading", { name: /Semua langkah selesai/ })).toBeVisible();
    await expect(page.getByText("Kamu di sini")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Cari proyek di Experience/ })).toHaveAttribute("href", "/experience");
    await page.screenshot({ path: testInfo.outputPath("roadmap-complete.png"), fullPage: true });

    // Batalkan satu langkah → kembali jadi langkah "sekarang".
    await stepNode(page, 2).click();
    await page.getByRole("dialog").getByRole("button", { name: "Tandai belum selesai" }).click();
    await expect(stepNode(page, 2)).toHaveAccessibleName(/sedang kamu kerjakan/);
  });

  test("gagal menyimpan → tampilan kembali ke progres tersimpan dan ada pesan", async ({ page }) => {
    await createRoadmap(page);
    // Simulasikan penyimpanan penuh/diblokir.
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      };
    });
    await stepNode(page, 1).click();
    await page.getByRole("dialog").getByRole("button", { name: "Tandai selesai" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Progres belum tersimpan" })).toBeVisible();
    await expect(stepNode(page, 1)).toHaveAccessibleName(/sedang kamu kerjakan/);
  });

  test("daftar roadmap: progres, lanjutkan, dan hapus", async ({ page }, testInfo) => {
    const id = await createRoadmap(page);
    await stepNode(page, 1).click();
    await page.getByRole("dialog").getByRole("button", { name: "Tandai selesai" }).click();
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Semua roadmap saya" }).click();
    await expect(page).toHaveURL(/\/roadmap$/);
    await expect(page.getByRole("link", { name: "Roadmap", exact: true }).first()).toHaveAttribute("aria-current", "page");
    const card = page.getByRole("listitem").filter({ hasText: "langkah" });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(/1\/\d+ langkah/);
    await page.screenshot({ path: testInfo.outputPath("roadmap-list.png"), fullPage: true });

    await card.getByRole("link", { name: "Lanjutkan" }).click();
    await expect(page).toHaveURL(new RegExp(`/roadmap/view\\?id=${id}$`));

    await page.goBack();
    await page.getByRole("button", { name: /^Hapus / }).click();
    await page.getByRole("button", { name: "Ya, hapus" }).click();
    await expect(page.getByRole("heading", { name: "Belum ada roadmap" })).toBeVisible();
  });

  test("/roadmap tanpa login → diarahkan ke login", async ({ page }) => {
    await page.goto("/roadmap");
    await expect(page).toHaveURL(/\/login\?next=%2Froadmap$/);
  });
});
