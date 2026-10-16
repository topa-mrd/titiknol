import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_OPPORTUNITIES } from "../../src/lib/opportunities";
import { createRoadmap } from "./helpers";

/**
 * "Carikan untukku" di mode demo: talenta meminta dari roadmap-nya, admin menawarkan,
 * talenta menolak lalu menerima tawaran kedua (langsung diteruskan ke mitra).
 * Peran berganti dengan menukar akun demo tersimpan.
 */
const USER_KEY = "titiknol:demo:user";
const [FIRST, SECOND] = SAMPLE_OPPORTUNITIES.filter((o) => o.level === "kecil");
const ADMIN = { id: "33333333-3333-4333-8333-333333333333", name: "Admin TitikNol" };

const becomes = (page: Page, user: { id: string; name: string }) =>
  page.evaluate(([k, v]) => localStorage.setItem(k, v), [USER_KEY, JSON.stringify(user)] as const);

async function offerAs(page: Page, talentName: string, opportunityId: string, note = "") {
  await becomes(page, ADMIN);
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Dicarikan" }).click();
  const card = page.getByRole("region", { name: "Dicarikan" }).getByRole("listitem").filter({ hasText: talentName });
  await card.getByRole("combobox", { name: "Lowongan yang ditawarkan" }).selectOption(opportunityId);
  if (note) await card.getByRole("textbox", { name: "Pesan untuk talenta" }).fill(note);
  await card.getByRole("button", { name: `Tawarkan lowongan ke ${talentName}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tawaran dikirim" })).toBeVisible();
}

test("carikan untukku: minta dari roadmap → admin menawarkan → tolak → terima → langsung diteruskan", async ({ page }) => {
  test.setTimeout(90_000);
  await createRoadmap(page);
  const talent = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), USER_KEY) as { id: string; name: string };

  // Dari roadmap ke panel "Biar kami yang carikan".
  await page.getByRole("link", { name: "Carikan proyek untukku" }).click();
  await expect(page).toHaveURL(/\/experience#dicarikan$/);
  const panel = page.getByRole("region", { name: "Biar kami yang carikan" });
  await panel.getByRole("button", { name: "Carikan untukku" }).click();
  const form = panel.getByRole("form", { name: "Minta dicarikan proyek" });
  await form.getByRole("button", { name: "Kirim permintaan" }).click();
  await expect(form.getByText("Isi nomor WhatsApp (08…) atau email yang valid.")).toBeVisible();
  await form.getByRole("textbox", { name: "WhatsApp atau email" }).fill("081234567890");
  await form.getByRole("combobox", { name: "Daerah yang kamu mau" }).selectOption("online");
  await form.getByRole("textbox", { name: /Catatan untuk tim TitikNol/ }).fill("Bisa kerja sore hari.");
  await form.getByRole("button", { name: "Kirim permintaan" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Permintaan terkirim" })).toBeVisible();
  await expect(panel).toContainText("Sedang dicarikan");
  await expect(panel).toContainText("Online / jarak jauh");

  // Admin melihat roadmap talenta dan menawarkan lowongan pertama.
  await offerAs(page, talent.name, FIRST.id, "Cocok untuk langkah pertamamu.");

  // Talenta melihat tawaran, lalu menolak.
  await becomes(page, talent);
  await page.goto("/experience");
  const offer = page.getByRole("region", { name: "Ada tawaran untukmu" });
  await expect(offer.getByRole("heading", { name: FIRST.title })).toBeVisible();
  await expect(offer).toContainText("Cocok untuk langkah pertamamu.");
  await offer.getByRole("button", { name: "Tolak, carikan yang lain" }).click();
  await expect(panel).toContainText("Sedang dicarikan");
  await expect(panel).toContainText(`Sudah kamu tolak${FIRST.title}`);

  // Tawaran kedua diterima → lamaran langsung diteruskan ke mitra.
  await offerAs(page, talent.name, SECOND.id);
  await becomes(page, talent);
  await page.goto("/experience");
  await page.getByRole("region", { name: "Ada tawaran untukmu" }).getByRole("button", { name: "Terima tawaran" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tawaran diterima" })).toBeVisible();
  const mine = page.getByRole("region", { name: "Lamaranku" }).getByRole("listitem").filter({ hasText: SECOND.title });
  await expect(mine).toContainText("Diteruskan ke mitra");
  await expect(mine).toContainText("Dicarikan tim TitikNol");
  // Panel kembali siap untuk permintaan baru; kartu lowongannya tercatat sudah daftar.
  await expect(panel.getByRole("button", { name: "Carikan untukku" })).toBeVisible();
  await expect(page.getByRole("button", { name: `Daftar ke ${SECOND.title}` })).toHaveCount(0);

  // Admin melihat pendaftar hasil pencocokan di antara yang diteruskan.
  await becomes(page, ADMIN);
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Pendaftar" }).click();
  await page.getByRole("tab", { name: "Diteruskan" }).click();
  const forwarded = page.getByRole("region", { name: "Pendaftar" }).getByRole("listitem").filter({ hasText: SECOND.title });
  await expect(forwarded).toContainText("Dicocokkan tim TitikNol");
  await page.getByRole("tab", { name: "Dicarikan" }).click();
  await page.getByRole("tab", { name: "Diterima" }).click();
  await expect(page.getByRole("region", { name: "Dicarikan" })).toContainText("Tawaran diterima.");
});
