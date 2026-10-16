import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_OPPORTUNITIES } from "../../src/lib/opportunities";
import { loginDemo } from "./helpers";

/**
 * Tangga proyek + squad di mode demo. Akun demo disimpan di localStorage; test
 * berganti peran (mitra/admin, dua talenta) dengan menukar akun tersimpan.
 */
const USER_KEY = "titiknol:demo:user";
const TITLE = "Katalog produk batik tulis";
const SEDANG = SAMPLE_OPPORTUNITIES.find((o) => o.level === "sedang")!;
const KECIL_SAMPLE = SAMPLE_OPPORTUNITIES.find((o) => o.level === "kecil")!;

const becomes = async (page: Page, user: { id: string; name: string }) => {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [USER_KEY, JSON.stringify(user)] as const);
};
const card = (page: Page, title: string) => page.getByRole("main").getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2, name: title }) });

async function apply(page: Page) {
  await page.goto("/experience");
  await page.getByRole("button", { name: `Daftar ke ${TITLE}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "WhatsApp atau email" }).fill("081234567890");
  await dialog.getByRole("textbox", { name: "Kenapa kamu cocok untuk posisi ini?" }).fill("Aku suka fotografi produk dan sudah membantu toko saudara membuat katalog.");
  await dialog.getByRole("button", { name: "Kirim pendaftaran" }).click();
  await expect(dialog).toBeHidden();
}

test("tangga proyek & squad: admin mencocokkan, anggota izin terlihat teman & mitra, proyek selesai membuka tingkat sedang", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  // Mitra (juga admin di mode demo) membuka lowongan tingkat kecil
  await loginDemo(page, "/mitra", "Bu Ayu");
  const mitra = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), USER_KEY);
  await page.getByRole("button", { name: "Daftar sebagai mitra" }).click();
  await page.getByRole("textbox", { name: "Nama usaha atau organisasi" }).fill("Batik Ayu");
  await page.getByRole("combobox", { name: "Provinsi" }).selectOption("Jawa Timur");
  await page.getByRole("textbox", { name: "Kota atau kabupaten" }).fill("Kediri");
  await page.getByRole("textbox", { name: "Nama kontak" }).fill("Bu Ayu");
  await page.getByRole("textbox", { name: "WhatsApp atau email kontak" }).fill("081298765432");
  await page.getByRole("button", { name: "Daftar sebagai mitra" }).click();
  const form = page.getByRole("form", { name: "Buat lowongan" });
  await expect(form.getByRole("combobox", { name: "Tingkat proyek" })).toHaveValue("kecil");
  await form.getByRole("textbox", { name: "Posisi" }).fill(TITLE);
  await form.getByRole("combobox", { name: "Bidang" }).selectOption("desain");
  await form.getByRole("textbox", { name: "Apa yang dikerjakan" }).fill("Memotret dan menyusun katalog 30 motif batik untuk dikirim ke reseller.");
  await form.getByRole("textbox", { name: "Imbalan" }).fill("Rp300.000 per orang");
  await form.getByRole("textbox", { name: "Durasi" }).fill("2 minggu");
  await form.getByRole("button", { name: "Kirim untuk diverifikasi" }).click();
  await page.goto("/admin");
  await page.getByRole("button", { name: `Setujui lowongan ${TITLE}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "disetujui dan tayang" })).toBeVisible();

  // Dua talenta baru: proyek sedang terkunci, mereka mendaftar proyek kecil
  const rina = { id: "11111111-1111-4111-8111-111111111111", name: "Rina" };
  const bayu = { id: "22222222-2222-4222-8222-222222222222", name: "Bayu" };
  await becomes(page, rina);
  await page.goto("/experience");
  const ladder = page.getByRole("region", { name: "Tangga proyek" });
  await expect(ladder).toContainText("Mulai dari proyek kecil");
  await expect(ladder.getByRole("listitem").first()).toHaveAttribute("aria-current", "step");
  const locked = card(page, SEDANG.title);
  await expect(locked).toContainText("Proyek sedang masih terkunci.");
  await expect(locked).toContainText("Terbuka setelah kamu menyelesaikan satu proyek kecil.");
  await expect(locked.getByRole("button", { name: /^Daftar ke/ })).toHaveCount(0);
  await expect(card(page, KECIL_SAMPLE.title).getByRole("button", { name: `Daftar ke ${KECIL_SAMPLE.title}` })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("tangga.png"), fullPage: true });
  await apply(page);
  await becomes(page, bayu);
  await apply(page);

  // Admin meneruskan keduanya lalu membentuk squad
  await becomes(page, mitra);
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Pendaftar" }).click();
  const pendaftar = page.getByRole("region", { name: "Pendaftar" });
  for (const name of ["Rina", "Bayu"]) {
    const item = pendaftar.getByRole("listitem").filter({ hasText: name }).filter({ hasText: TITLE });
    await item.getByRole("combobox", { name: "Status" }).selectOption("diteruskan");
    await item.getByRole("button", { name: /^Simpan status/ }).click();
    await expect(page.getByRole("status").filter({ hasText: `${name}: diteruskan ke mitra` })).toBeVisible();
  }
  await page.getByRole("tab", { name: "Squad" }).click();
  const squadArea = page.getByRole("region", { name: "Squad" });
  const newSquad = squadArea.getByRole("form", { name: `Squad baru untuk ${TITLE}` });
  await newSquad.getByRole("textbox", { name: "Nama squad" }).fill("Squad Katalog A");
  await newSquad.getByRole("textbox", { name: "Link grup (https)" }).fill("https://chat.whatsapp.com/contohsquad");
  await newSquad.getByRole("button", { name: "Buat squad" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Squad “Squad Katalog A” dibuat." })).toBeVisible();
  await squadArea.getByRole("combobox", { name: "Squad untuk Rina" }).selectOption({ label: "Squad Katalog A (0/4)" });
  await expect(page.getByRole("status").filter({ hasText: "Rina masuk Squad Katalog A." })).toBeVisible();
  await squadArea.getByRole("combobox", { name: "Squad untuk Bayu" }).selectOption({ label: "Squad Katalog A (1/4)" });
  await expect(page.getByRole("status").filter({ hasText: "Bayu masuk Squad Katalog A." })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("admin-squad.png"), fullPage: true });

  // Rina melihat squad + link grup, lalu izin
  await becomes(page, rina);
  await page.goto("/experience");
  const mine = page.getByRole("region", { name: "Lamaranku" }).getByRole("listitem").filter({ hasText: TITLE }).first();
  const squad = mine.getByRole("region", { name: "Squad: Squad Katalog A" });
  await expect(squad.getByRole("list", { name: "Anggota Squad Katalog A" })).toContainText("Rina (kamu)");
  await expect(squad).toContainText("Bayu");
  await expect(squad.getByRole("link", { name: /Buka grup squad/ })).toHaveAttribute("href", "https://chat.whatsapp.com/contohsquad");
  await squad.getByRole("button", { name: "Aku izin" }).click();
  await squad.getByRole("textbox", { name: /Alasan izin/ }).fill("Sakit sampai Kamis");
  await squad.getByRole("button", { name: "Simpan izin" }).click();
  await expect(squad).toContainText("Izin: Sakit sampai Kamis");
  await page.screenshot({ path: testInfo.outputPath("squad-talenta.png"), fullPage: true });

  // Bayu dan mitra melihat izin Rina
  await becomes(page, bayu);
  await page.goto("/experience");
  await expect(page.getByRole("region", { name: "Squad: Squad Katalog A" })).toContainText("Izin: Sakit sampai Kamis");
  await becomes(page, mitra);
  await page.goto("/mitra");
  await page.getByRole("tab", { name: /Talenta/ }).click();
  const mitraSquad = page.getByRole("region", { name: "Squad di lowonganmu" });
  await expect(mitraSquad).toContainText("Izin: Sakit sampai Kamis");
  await expect(mitraSquad.getByRole("button", { name: "Aku izin" })).toHaveCount(0);

  // Mitra menandai Rina selesai → tingkat sedang terbuka untuk Rina
  const rinaCard = page.getByRole("region", { name: "Talenta" }).getByRole("listitem").filter({ hasText: "Rina" }).filter({ hasText: "081234567890" }).first();
  await rinaCard.getByRole("combobox", { name: "Status" }).selectOption("selesai");
  await rinaCard.getByRole("button", { name: /^Simpan status/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Status Rina sekarang: selesai." })).toBeVisible();
  await becomes(page, rina);
  await page.goto("/experience");
  await expect(page.getByRole("region", { name: "Tangga proyek" })).toContainText("proyek sedang sekarang terbuka");
  await expect(card(page, SEDANG.title).getByRole("button", { name: `Daftar ke ${SEDANG.title}` })).toBeVisible();
});
