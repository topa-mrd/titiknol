import { expect, test } from "@playwright/test";
import { createDraft, planCard, planRadio, readSession } from "./helpers";

test.describe("Drafting", () => {
  test("3 plan tampil, chat mengubah plan, lalu pilih plan", async ({ page }, testInfo) => {
    await createDraft(page);
    await expect(page.getByRole("radio")).toHaveCount(3);
    await expect(planCard(page, "B")).toContainText("Biaya sedang");
    await page.screenshot({ path: testInfo.outputPath("draft.png"), fullPage: true });

    // Chip saran → AI merevisi plan.
    await page.getByRole("button", { name: "Cari opsi yang lebih murah" }).click();
    const log = page.getByRole("log", { name: "Percakapan revisi" });
    await expect(log).toContainText("Cari opsi yang lebih murah");
    await expect(log).toContainText("Sudah kuperbarui");
    await expect(planCard(page, "B")).toContainText("Biaya rendah");
    await expect(planCard(page, "B")).toContainText("Diperbarui");
    await expect(planCard(page, "C")).not.toContainText("Diperbarui"); // C sudah gratis, tidak berubah

    // Pilih plan B: klik di mana saja pada kartunya.
    await planCard(page, "B").getByText("Plan B", { exact: true }).click();
    await expect(planRadio(page, "B")).toBeChecked();
    await expect(page.getByRole("button", { name: "Buat roadmap Plan B" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("draft-revised.png"), fullPage: true });

    // Refresh: pilihan, revisi, dan percakapan tetap ada.
    await page.reload();
    await expect(planRadio(page, "B")).toBeChecked();
    await expect(planCard(page, "B")).toContainText("Biaya rendah");
    await expect(page.getByRole("log", { name: "Percakapan revisi" })).toContainText("Sudah kuperbarui");
    const session = await readSession(page);
    expect(session.selectedPlanId).toBe("B");
    expect(session.messages).toHaveLength(2);
  });

  test("pesan chat bebas lewat keyboard mengubah plan", async ({ page }) => {
    await createDraft(page);
    const input = page.getByRole("textbox", { name: "Tulis permintaan revisi" });
    await input.fill("Tapi aku harus sambil kerja");
    await input.press("Enter");
    await expect(planCard(page, "B")).toContainText("Kuliah jarak jauh sambil bekerja");
    await expect(input).toHaveValue("");
  });

  test("plan bisa dipilih dengan keyboard", async ({ page }) => {
    await createDraft(page);
    await planRadio(page, "A").focus();
    await page.keyboard.press("ArrowRight");
    await expect(planRadio(page, "B")).toBeChecked();
  });

  test("membuat roadmap tanpa memilih plan → diminta memilih dulu", async ({ page }) => {
    await createDraft(page);
    await page.getByRole("button", { name: "Pilih plan dulu" }).click();
    await expect(page.getByText("Pilih salah satu plan dulu sebelum membuat roadmap.")).toBeVisible();
    await expect(planRadio(page, "A")).toBeFocused();
  });

  test("profil bisa diedit dan tersimpan", async ({ page }) => {
    await createDraft(page);
    await page.getByRole("button", { name: "Edit profil" }).click();
    await page.getByRole("textbox", { name: "Lokasi" }).fill("Malang");
    await page.getByRole("textbox", { name: /Kendala/ }).fill("Belum punya laptop\nHanya bisa belajar malam");
    await page.getByRole("button", { name: "Simpan profil" }).click();

    const profile = page.getByRole("region", { name: "Profilmu" });
    await expect(profile).toContainText("Malang");
    await expect(profile).toContainText("Hanya bisa belajar malam");
    await page.reload();
    await expect(page.getByRole("region", { name: "Profilmu" })).toContainText("Malang");
  });

  test("revisi gagal → pesan jelas, teks dikembalikan ke kolom chat", async ({ page }) => {
    await createDraft(page);
    await page.route("**/api/refine", (route) =>
      route.fulfill({ status: 503, json: { error: "AI sedang sibuk atau tidak bisa dihubungi. Tunggu sebentar lalu coba lagi." } }),
    );
    await page.getByRole("button", { name: "Aku mau tetap di kotaku" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "AI sedang sibuk" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Tulis permintaan revisi" })).toHaveValue("Aku mau tetap di kotaku");
    await expect(page.getByRole("log", { name: "Percakapan revisi" })).not.toContainText("Aku mau tetap di kotaku");
  });

  test("tanpa draf → diarahkan untuk bercerita dulu", async ({ page }) => {
    await page.goto("/draft");
    await expect(page.getByRole("heading", { name: "Belum ada draf" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ceritakan mimpimu" })).toBeVisible();
  });
});
