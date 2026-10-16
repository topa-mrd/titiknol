import { expect, test, type Page } from "@playwright/test";
import { loginDemo } from "./helpers";

const TRANSCRIPT =
  "Aku lulusan SMK di Kebumen dan belajar desain cuma dari HP. Aku tawarkan desain menu gratis ke warung tetangga. " +
  "Dua minggu kemudian toko kue membayarku untuk desain kemasan.";

const main = (page: Page) => page.getByRole("main");
const storyBox = (page: Page) => main(page).getByRole("textbox", { name: "Ceritakan dengan suaramu" });

/** Studio: tulis sendiri tanpa AI lalu isi editor. */
async function writeManually(page: Page, title: string, body = TRANSCRIPT) {
  await storyBox(page).fill(body);
  await main(page).getByRole("button", { name: "Tulis sendiri tanpa AI" }).click();
  await main(page).getByRole("textbox", { name: "Judul" }).fill(title);
}

test.describe("Share your story → Blog & Komunitas", () => {
  test("cerita → diolah AI → diedit → terbit → tampil di Blog dan bisa dibaca", async ({ page }, testInfo) => {
    await loginDemo(page, "/share", "Rina");
    await expect(main(page).getByRole("heading", { level: 1, name: "Share your story" })).toBeVisible();
    await expect(main(page).getByRole("radio", { name: /Artikel/ })).toBeChecked();
    await expect(main(page).getByText("Belum ada tulisan. Draf dan tulisan yang sudah terbit muncul di sini.")).toBeVisible();

    await storyBox(page).fill(TRANSCRIPT);
    await main(page).getByRole("button", { name: "Olah jadi tulisan" }).click();

    await expect(main(page).getByRole("heading", { name: "Periksa tulisanmu" })).toBeVisible();
    await expect(main(page).getByText(/^Mode demo: ceritamu dirapikan otomatis tanpa AI/)).toBeVisible();
    const title = main(page).getByRole("textbox", { name: "Judul" });
    await expect(title).not.toHaveValue("");
    await expect(main(page).getByRole("textbox", { name: "Isi tulisan" })).toHaveValue(/desain menu gratis/);
    const tags = main(page).getByRole("list", { name: "Tag terpilih" });
    await expect(tags).toContainText("#desain");
    await page.screenshot({ path: testInfo.outputPath("studio-edit.png"), fullPage: true });

    await title.fill("Klien pertamaku dari warung tetangga");
    await main(page).getByRole("textbox", { name: /^Tag/ }).fill("Freelance");
    await main(page).getByRole("textbox", { name: /^Tag/ }).press("Enter");
    await expect(tags).toContainText("#freelance");
    await main(page).getByRole("button", { name: "Terbitkan", exact: true }).click();

    await expect(main(page).getByRole("status").filter({ hasText: "Tulisanmu sudah terbit!" })).toBeVisible();
    const mine = main(page).getByRole("region", { name: "Tulisanku" });
    await expect(mine.getByRole("article")).toHaveCount(1);
    await expect(mine.getByRole("article")).toContainText("Terbit");

    await page.getByRole("link", { name: "Blog", exact: true }).first().click();
    await expect(page).toHaveURL(/\/blog$/);
    await expect(main(page).getByText("Belum ada tulisan dari pengguna")).toHaveCount(0);
    await main(page).getByRole("link", { name: "Klien pertamaku dari warung tetangga" }).click();

    await expect(page).toHaveURL(/\/blog\/baca\?id=/);
    await expect(main(page).getByRole("heading", { level: 1, name: "Klien pertamaku dari warung tetangga" })).toBeVisible();
    await expect(main(page).getByText("Rina", { exact: true })).toBeVisible();
    await expect(main(page).getByRole("group", { name: "Bagikan tulisan" })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Edit di studio" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("blog-read.png"), fullPage: true });

    await main(page).getByRole("link", { name: "#freelance" }).click();
    await expect(page).toHaveURL(/\/blog\?tag=freelance$/);
    await expect(main(page).getByRole("button", { name: "#freelance" })).toHaveAttribute("aria-pressed", "true");
    await expect(main(page).getByText("1 tulisan")).toBeVisible();
  });

  test("mentor: draf tanpa kontak boleh, terbit wajib kontak, lalu tampil di Komunitas dengan WhatsApp", async ({ page }, testInfo) => {
    await loginDemo(page, "/share?jenis=mentor", "Nadia");
    await expect(main(page).getByRole("radio", { name: /Jadi mentor/ })).toBeChecked();

    // Validasi editor: kosong → pesan per kolom dan fokus ke judul.
    await main(page).getByRole("button", { name: "Tulis sendiri tanpa AI" }).click();
    await main(page).getByRole("button", { name: "Terbitkan", exact: true }).click();
    await expect(main(page).getByText(/^Judul 3–120 karakter\.$/)).toBeVisible();
    await expect(main(page).getByRole("textbox", { name: "Judul" })).toBeFocused();
    await main(page).getByRole("button", { name: "Kembali ke cerita" }).click();

    await writeManually(page, "Siap bantu review CV", "Aku HR lima tahun dan bisa bantu review CV lewat chat tiap Sabtu.");
    await main(page).getByRole("button", { name: "Terbitkan", exact: true }).click();
    await expect(main(page).getByText("Mentor dan komunitas wajib mencantumkan kontak supaya bisa dihubungi.")).toBeVisible();
    await expect(main(page).getByRole("textbox", { name: "Kontak publik" })).toBeFocused();

    await main(page).getByRole("button", { name: "Simpan draf" }).click();
    await expect(main(page).getByRole("status").filter({ hasText: "Draf tersimpan" })).toBeVisible();

    // Draf tidak tampil di Komunitas: yang ada hanya contoh berlabel.
    await page.goto("/komunitas");
    await expect(main(page).getByRole("tab", { name: "Mentor" })).toHaveAttribute("aria-selected", "true");
    await expect(main(page).getByText("Belum ada mentor yang mendaftar")).toBeVisible();
    await expect(main(page).getByRole("link", { name: /Chat WhatsApp/ })).toHaveCount(0);

    await page.goto("/share");
    const item = main(page).getByRole("region", { name: "Tulisanku" }).getByRole("article");
    await expect(item).toContainText("Draf");
    await item.getByRole("button", { name: /^Edit/ }).click();
    await main(page).getByRole("textbox", { name: "Kontak publik" }).fill("0812 3456 7890");
    await main(page).getByRole("button", { name: "Terbitkan", exact: true }).click();
    await expect(main(page).getByRole("status").filter({ hasText: "Tulisanmu sudah terbit!" })).toBeVisible();

    await page.goto("/komunitas");
    const card = main(page).getByRole("list", { name: "Daftar mentor" }).getByRole("article");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Siap bantu review CV");
    await expect(card.getByRole("link", { name: /Chat WhatsApp/ })).toHaveAttribute("href", "https://wa.me/6281234567890");
    await page.screenshot({ path: testInfo.outputPath("komunitas.png"), fullPage: true });

    await main(page).getByRole("tab", { name: "Komunitas" }).click();
    await expect(page).toHaveURL(/\/komunitas\?tab=komunitas$/);
    await expect(main(page).getByText("Belum ada komunitas yang mendaftar")).toBeVisible();
  });

  test("admin menurunkan tulisan → hilang dari Blog; penulis tidak bisa menerbitkannya lagi", async ({ page }) => {
    await loginDemo(page, "/share", "Rina");
    await writeManually(page, "Tulisan yang akan diturunkan");
    await main(page).getByRole("button", { name: "Terbitkan", exact: true }).click();
    await expect(main(page).getByRole("status").filter({ hasText: "Tulisanmu sudah terbit!" })).toBeVisible();

    await page.goto("/admin");
    await main(page).getByRole("tab", { name: "Blog & komunitas" }).click();
    await main(page).getByRole("button", { name: "Turunkan Tulisan yang akan diturunkan" }).click();
    await expect(main(page).getByText(/diturunkan dan tidak tampil lagi/)).toBeVisible();

    await page.goto("/blog");
    await expect(main(page).getByText("Belum ada tulisan dari pengguna")).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Tulisan yang akan diturunkan" })).toHaveCount(0);

    await page.goto("/share");
    const item = main(page).getByRole("region", { name: "Tulisanku" }).getByRole("article");
    await expect(item).toContainText("Diturunkan admin");
    await expect(item.getByRole("button", { name: /^Terbitkan/ })).toHaveCount(0);
    await item.getByRole("button", { name: /^Edit/ }).click();
    await expect(main(page).getByText(/hanya admin yang bisa menayangkannya lagi/)).toBeVisible();
    await expect(main(page).getByRole("button", { name: "Terbitkan", exact: true })).toHaveCount(0);

    await page.goto("/admin");
    await main(page).getByRole("tab", { name: "Blog & komunitas" }).click();
    await main(page).getByRole("tab", { name: "Diturunkan" }).click();
    await main(page).getByRole("button", { name: "Tayangkan lagi Tulisan yang akan diturunkan" }).click();
    await page.goto("/blog");
    await expect(main(page).getByRole("link", { name: "Tulisan yang akan diturunkan" })).toBeVisible();
  });

  test("AI gagal: pesan jelas, cerita tidak hilang, bisa lanjut tanpa AI", async ({ page }) => {
    await page.route("**/api/story", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "AI sedang sibuk atau tidak bisa dihubungi. Tunggu sebentar lalu coba lagi." }) }),
    );
    await loginDemo(page, "/share");
    await storyBox(page).fill("pendek");
    await main(page).getByRole("button", { name: "Olah jadi tulisan" }).click();
    await expect(main(page).getByRole("alert")).toContainText("minimal 20 karakter");
    await expect(storyBox(page)).toBeFocused();

    await storyBox(page).fill(TRANSCRIPT);
    await main(page).getByRole("button", { name: "Olah jadi tulisan" }).click();
    await expect(main(page).getByRole("alert")).toContainText("AI sedang sibuk");
    await expect(storyBox(page)).toHaveValue(TRANSCRIPT);
    await main(page).getByRole("button", { name: "Tulis sendiri tanpa AI" }).click();
    await expect(main(page).getByRole("textbox", { name: "Isi tulisan" })).toHaveValue(TRANSCRIPT);
  });

  test("tanpa login: Blog dan Komunitas terbaca dengan contoh berlabel; studio meminta masuk", async ({ page }, testInfo) => {
    await page.goto("/blog");
    await expect(page.getByRole("link", { name: "Blog", exact: true }).first()).toHaveAttribute("aria-current", "page");
    await expect(main(page).getByText("Belum ada tulisan dari pengguna")).toBeVisible();
    const cards = main(page).getByRole("listitem").getByRole("article");
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText("Contoh");
    await page.screenshot({ path: testInfo.outputPath("blog.png"), fullPage: true });

    await main(page).getByRole("button", { name: "#beasiswa" }).click();
    await expect(cards).toHaveCount(1);
    await main(page).getByRole("searchbox", { name: "Cari tulisan" }).fill("tidak-ada-yang-cocok");
    await expect(main(page).getByText(/Belum ada tulisan yang cocok/)).toBeVisible();

    await page.goto("/komunitas?tab=komunitas");
    await expect(main(page).getByRole("tab", { name: "Komunitas" })).toHaveAttribute("aria-selected", "true");
    await expect(main(page).getByText("Profil contoh, belum bisa dihubungi.").first()).toBeVisible();

    await page.goto("/share");
    await main(page).getByRole("link", { name: "Masuk untuk menulis" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fshare$/);
  });
});
