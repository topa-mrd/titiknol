import { expect, test, type Page } from "@playwright/test";
import { createRoadmap, stepNode } from "./helpers";

/**
 * Efek suara: setiap play() memancarkan event "titiknol:sound" berisi nama
 * efeknya; test mencatatnya. Web Audio tetap berjalan sungguhan di Chromium.
 */
async function tapAudio(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __sounds: string[] };
    w.__sounds = [];
    window.addEventListener("titiknol:sound", (e) => w.__sounds.push((e as CustomEvent<string>).detail));
  });
}

const heard = (page: Page) => page.evaluate(() => (window as unknown as { __sounds: string[] }).__sounds.slice());
const count = async (page: Page, name: string) => (await heard(page)).filter((n) => n === name).length;

test.describe("Efek suara", () => {
  test("tidak berbunyi saat halaman dibuka; galat/maju di Tell me your dream; tombol mati membungkam dan diingat", async ({ page }) => {
    await tapAudio(page);
    await page.goto("/start");
    const toggle = page.getByRole("button", { name: "Efek suara" });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(await heard(page)).toEqual([]);

    await page.getByRole("button", { name: "Lanjut" }).click();
    await expect.poll(() => heard(page)).toContain("galat");

    await page.getByRole("textbox", { name: "Apa mimpimu?" }).fill("Aku ingin jadi desainer grafis yang punya klien sendiri.");
    await page.getByRole("button", { name: "Lanjut" }).click();
    await expect.poll(() => heard(page)).toContain("maju");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    const before = (await heard(page)).length;
    await page.getByRole("button", { name: "Susun rencanaku" }).click();
    await expect(page.getByText(/minimal 10 karakter/)).toBeVisible();
    expect((await heard(page)).length).toBe(before);

    await page.reload();
    await expect(page.getByRole("button", { name: "Efek suara" })).toHaveAttribute("aria-pressed", "false");
  });

  test("roadmap: jadi = selesai, centang to-do = benar, tandai langkah selesai = selesai lagi", async ({ page }) => {
    await tapAudio(page);
    await createRoadmap(page);
    const finishes = () => count(page, "selesai");
    // Roadmap pertama jadi = momen utama.
    await expect.poll(finishes).toBe(1);
    await stepNode(page, 1).click();
    const sheet = page.getByRole("dialog");
    // "benar" sudah berbunyi sekali saat tiga plan tiba di Drafting.
    const correct = await count(page, "benar");
    await sheet.getByRole("checkbox").first().check();
    await expect.poll(() => count(page, "benar")).toBe(correct + 1);
    // Membatalkan centang tidak berbunyi.
    const total = (await heard(page)).length;
    await sheet.getByRole("checkbox").first().uncheck();
    expect((await heard(page)).length).toBe(total);

    await sheet.getByRole("button", { name: "Tandai selesai" }).click();
    await expect.poll(finishes).toBe(2);
  });
});
