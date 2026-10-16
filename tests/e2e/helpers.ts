import { expect, type Page } from "@playwright/test";

export const STORY = {
  dream: "Aku ingin jadi desainer grafis yang punya klien sendiri.",
  background: "Lulusan SMA di Medan, suka menggambar dan sudah coba belajar Canva.",
};

/** Jalankan tahap Tell me your dream lewat UI sampai halaman Drafting terbuka. */
export async function createDraft(page: Page, story = STORY) {
  await page.goto("/start");
  await page.getByRole("textbox", { name: "Apa mimpimu?" }).fill(story.dream);
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("textbox", { name: "Ceritakan kondisimu sekarang" }).fill(story.background);
  await page.getByRole("button", { name: "Susun rencanaku" }).click();
  await expect(page).toHaveURL(/\/draft$/);
  await expect(page.getByRole("heading", { level: 1, name: "Tiga jalur untukmu" })).toBeVisible();
}

export const planRadio = (page: Page, id: "A" | "B" | "C") =>
  page.getByRole("radio", { name: new RegExp(`^Plan ${id}\\b`) });

/** Kartu plan (li) yang berisi radio tertentu. */
export const planCard = (page: Page, id: "A" | "B" | "C") =>
  page.getByRole("listitem").filter({ has: planRadio(page, id) });

export const readSession = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("titiknol:draft:v1") ?? "null"));

/** Draf → pilih plan → login demo → roadmap tersimpan dan terbuka. */
export async function createRoadmap(page: Page, plan: "A" | "B" | "C" = "A") {
  await createDraft(page);
  await planCard(page, plan).getByText(`Plan ${plan}`, { exact: true }).click();
  await page.getByRole("button", { name: `Buat roadmap Plan ${plan}` }).click();
  await page.getByRole("button", { name: "Masuk dengan akun demo" }).click();
  await expect(page).toHaveURL(/\/roadmap\/view\?id=/, { timeout: 20_000 });
  await expect(page.getByRole("list", { name: "Langkah roadmap" })).toBeVisible();
  return new URL(page.url()).searchParams.get("id")!;
}

/** Tombol node pada jalur roadmap (nomor langkah mulai dari 1). */
export const stepNode = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^Langkah ${n}:`) });

/** Masuk dengan akun demo lewat halaman login, lalu kembali ke `next`. */
export const loginDemo = async (page: Page, next: string, name = "Rina") => {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole("textbox", { name: /Nama panggilan/ }).fill(name);
  await page.getByRole("button", { name: "Masuk dengan akun demo" }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/?]/g, "\\$&")}$`));
};
