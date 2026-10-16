import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_OPPORTUNITIES } from "../../src/lib/opportunities";
import { createRoadmap, loginDemo } from "./helpers";

const cards = (page: Page) => page.getByRole("main").getByRole("list").last().getByRole("listitem");
const applyButton = (page: Page, title: string) => page.getByRole("button", { name: `Daftar ke ${title}` });

async function fillApplication(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "WhatsApp atau email" }).fill("081234567890");
  await dialog.getByRole("textbox", { name: "Kenapa kamu cocok untuk posisi ini?" }).fill("Aku sudah belajar Canva tiga bulan dan pernah membuat poster OSIS.");
  await dialog.getByRole("textbox", { name: /Link portofolio/ }).fill("https://behance.net/rina");
  await dialog.getByRole("button", { name: "Kirim pendaftaran" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("Experience: talenta", () => {
  test("lowongan diurutkan sesuai roadmap, filter daerah & posisi, daftar, lalu batalkan", async ({ page }, testInfo) => {
    await createRoadmap(page); // cerita desainer grafis
    await page.getByRole("link", { name: "Experience" }).first().click();
    await expect(page).toHaveURL(/\/experience$/);
    await expect(page.getByRole("heading", { level: 1, name: "Cari pengalaman nyata" })).toBeVisible();
    await expect(page.getByText("Data contoh.")).toBeVisible();
    await expect(page.getByText(/Diurutkan berdasarkan kecocokan dengan roadmap/)).toBeVisible();
    await expect(cards(page)).toHaveCount(SAMPLE_OPPORTUNITIES.length);
    await expect(cards(page).first()).toContainText("Cocok untukmu");
    await page.screenshot({ path: testInfo.outputPath("experience.png"), fullPage: true });

    // Filter daerah: online saja.
    await page.getByRole("combobox", { name: "Daerah" }).selectOption("online");
    const online = SAMPLE_OPPORTUNITIES.filter((o) => o.remote).length;
    await expect(cards(page)).toHaveCount(online);
    await expect(page.getByText(`${online} lowongan`)).toBeVisible();
    // Filter provinsi + bidang tanpa hasil → pesan kosong yang jelas.
    await page.getByRole("combobox", { name: "Daerah" }).selectOption("Papua");
    await expect(page.getByText(/Belum ada lowongan yang cocok dengan filter ini/)).toBeVisible();
    await page.getByRole("button", { name: "Hapus filter" }).click();
    await page.getByRole("searchbox", { name: "Cari posisi" }).fill("magang IT");
    await expect(cards(page)).toHaveCount(1);
    await page.getByRole("button", { name: "Hapus filter" }).click();

    // Daftar: validasi dulu, lalu kirim.
    const target = SAMPLE_OPPORTUNITIES.find((o) => o.id === "contoh-desain-menu-kedai-kopi")!;
    await applyButton(page, target.title).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: `Daftar: ${target.title}` })).toBeVisible();
    await dialog.getByRole("button", { name: "Kirim pendaftaran" }).click();
    await expect(dialog.getByText("Isi nomor WhatsApp (08…) atau email yang valid.")).toBeVisible();
    await expect(dialog.getByText(/minimal 20 karakter/)).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: /Lampirkan ringkasan roadmap-ku/ })).toBeChecked();
    await fillApplication(page);

    await expect(page.getByRole("status").filter({ hasText: "Pendaftaran terkirim" })).toBeVisible();
    const mine = page.getByRole("region", { name: "Lamaranku" }).getByRole("listitem").filter({ hasText: target.title });
    await expect(mine).toContainText("Terkirim");
    await expect(applyButton(page, target.title)).toHaveCount(0);
    await expect(cards(page).filter({ hasText: target.title })).toContainText("Sudah daftar");

    await page.reload();
    const again = page.getByRole("region", { name: "Lamaranku" }).getByRole("listitem").filter({ hasText: target.title });
    await expect(again).toContainText("Terkirim");
    await again.getByRole("button", { name: `Batalkan lamaran ${target.title}` }).click();
    await expect(again).toContainText("Dibatalkan");
    await expect(applyButton(page, target.title)).toBeVisible();

    // Berubah pikiran: daftar ulang berhasil, dan Lamaranku hanya menampilkan lamaran yang aktif.
    await applyButton(page, target.title).click();
    await fillApplication(page);
    await expect(page.getByRole("status").filter({ hasText: "Pendaftaran terkirim" })).toBeVisible();
    const active = page.getByRole("region", { name: "Lamaranku" }).getByRole("listitem").filter({ hasText: target.title });
    await expect(active).toHaveCount(1);
    await expect(active).toContainText("Terkirim");
  });

  test("belum login → Daftar mengarah ke login lalu kembali", async ({ page }) => {
    await page.goto("/experience");
    await expect(page.getByText("Masuk dan buat roadmap supaya lowongan diurutkan")).toBeVisible();
    await page.getByRole("button", { name: /^Daftar ke / }).first().click();
    await expect(page).toHaveURL(/\/login\?next=%2Fexperience$/);
    await page.getByRole("button", { name: "Masuk dengan akun demo" }).click();
    await expect(page).toHaveURL(/\/experience$/);
    await expect(page.getByText("Buat roadmap dulu supaya lowongan diurutkan")).toBeVisible();
  });
});

test.describe("Experience: mitra ↔ admin ↔ talenta", () => {
  test("mitra buka lowongan → admin setujui → talenta daftar → admin teruskan → mitra kelola talenta", async ({ page }, testInfo) => {
    const TITLE = "Magang desain kemasan keripik";
    await loginDemo(page, "/mitra", "Bu Sri");
    await expect(page.getByRole("heading", { level: 1, name: "Ruang mitra" })).toBeVisible();

    // Data mitra (sekali).
    await page.getByRole("button", { name: "Daftar sebagai mitra" }).click();
    await expect(page.getByText("Tulis nama usaha/organisasi (2–120 karakter).")).toBeVisible();
    await page.getByRole("textbox", { name: "Nama usaha atau organisasi" }).fill("Keripik Tempe Bu Sri");
    await page.getByRole("combobox", { name: "Provinsi" }).selectOption("Jawa Timur");
    await page.getByRole("textbox", { name: "Kota atau kabupaten" }).fill("Malang");
    await page.getByRole("textbox", { name: "Nama kontak" }).fill("Bu Sri");
    await page.getByRole("textbox", { name: "WhatsApp atau email kontak" }).fill("081298765432");
    await page.getByRole("button", { name: "Daftar sebagai mitra" }).click();

    // Lowongan baru → menunggu verifikasi.
    const form = page.getByRole("form", { name: "Buat lowongan" });
    await form.getByRole("textbox", { name: "Posisi" }).fill(TITLE);
    await form.getByRole("combobox", { name: "Bidang" }).selectOption("desain");
    await form.getByRole("textbox", { name: "Apa yang dikerjakan" }).fill("Merancang ulang kemasan keripik supaya menarik di rak toko oleh-oleh.");
    await form.getByRole("textbox", { name: "Imbalan" }).fill("Rp1.000.000 per bulan");
    await form.getByRole("textbox", { name: "Durasi" }).fill("2 bulan");
    await form.getByRole("button", { name: "Kirim untuk diverifikasi" }).click();
    const myCard = page.getByRole("region", { name: "Lowongan saya" }).getByRole("listitem").filter({ hasText: TITLE });
    await expect(myCard).toContainText("Menunggu verifikasi");
    await page.screenshot({ path: testInfo.outputPath("mitra.png"), fullPage: true });

    // Belum tampil ke talenta.
    await page.goto("/experience");
    await expect(page.getByRole("heading", { level: 1, name: "Cari pengalaman nyata" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: TITLE })).toHaveCount(0);

    // Admin (mode demo) menyetujui.
    await page.goto("/admin");
    await expect(page.getByRole("main").getByText("Mode demo.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Setujui lowongan ${TITLE}` }).click();
    await expect(page.getByRole("status").filter({ hasText: "disetujui dan tayang" })).toBeVisible();

    // Talenta mendaftar.
    await page.goto("/experience");
    await applyButton(page, TITLE).click();
    await fillApplication(page);

    // Admin meneruskan ke mitra dengan catatan.
    await page.goto("/admin");
    await page.getByRole("tab", { name: "Pendaftar" }).click();
    const applicant = page.getByRole("region", { name: "Pendaftar" }).getByRole("listitem").filter({ hasText: TITLE });
    await applicant.getByRole("combobox", { name: "Status" }).selectOption("diteruskan");
    await applicant.getByRole("textbox", { name: "Catatan untuk talenta" }).fill("Kami teruskan ke mitra, tunggu kabar 3 hari.");
    await applicant.getByRole("button", { name: /^Simpan status/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "diteruskan ke mitra" })).toBeVisible();

    // Mitra melihat talenta (dengan kontak) lalu menandai sedang bekerja.
    await page.goto("/mitra");
    await page.getByRole("tab", { name: /Talenta/ }).click();
    const talent = page.getByRole("region", { name: "Talenta" }).getByRole("listitem").first();
    await expect(talent).toContainText("081234567890");
    await expect(talent).toContainText("Kami teruskan ke mitra");
    await talent.getByRole("combobox", { name: "Status" }).selectOption("bekerja");
    await talent.getByRole("textbox", { name: /Catatan untuk talenta/ }).fill("Mulai Senin pukul 09.00.");
    await talent.getByRole("button", { name: /^Simpan status/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "sedang bekerja" })).toBeVisible();

    // Talenta melihat status terbaru + catatan.
    await page.goto("/experience");
    const mine = page.getByRole("region", { name: "Lamaranku" }).getByRole("listitem").filter({ hasText: TITLE });
    await expect(mine).toContainText("Sedang bekerja");
    await expect(mine).toContainText("Mulai Senin pukul 09.00.");
    await expect(mine.getByRole("button", { name: /Batalkan lamaran/ })).toHaveCount(0);
  });
});
