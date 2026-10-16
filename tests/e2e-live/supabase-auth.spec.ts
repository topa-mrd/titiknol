import { expect, test } from "@playwright/test";
import { createDraft, planCard } from "../e2e/helpers";

const email = process.env.LIVE_EMAIL ?? "";
const password = process.env.LIVE_PASSWORD ?? "";

test.skip(!email || !password, "LIVE_EMAIL dan LIVE_PASSWORD belum diisi");

test("Supabase: belum login → login email → roadmap tersimpan; refresh tidak menduplikat", async ({ page, context }) => {
  await createDraft(page);
  await planCard(page, "A").getByText("Plan A", { exact: true }).click();
  await page.getByRole("button", { name: "Buat roadmap Plan A" }).click();

  await expect(page).toHaveURL(/\/login\?next=%2Fdraft%3Fbuild%3D1$/);
  await expect(page.getByRole("button", { name: "Lanjut dengan Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Masuk dengan akun demo" })).toHaveCount(0);

  // Password salah → pesan jelas dalam bahasa Indonesia.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("password-salah-123");
  await page.getByRole("button", { name: "Masuk sekarang" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email atau password salah" })).toBeVisible();

  // Password benar → roadmap dibangun dan disimpan ke Supabase.
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk sekarang" }).click();
  await expect(page).toHaveURL(/\/roadmap\/view\?id=[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Roadmap");
  const id = new URL(page.url()).searchParams.get("id");
  console.log(`ROADMAP_ID=${id}`);

  // Kalkulator biaya tersimpan ke kolom costs (grant update kolom baru).
  const calc = page.getByRole("region", { name: "Kalkulator biaya" });
  const row = calc.getByRole("listitem").filter({ hasText: "dari situs resmi" }).first();
  const name = (await row.locator("label").first().textContent())!;
  await calc.getByRole("listitem").filter({ hasText: name }).getByRole("textbox", { name: /menurutmu/ }).fill("123000");
  await expect(calc.getByText("Tersimpan", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Kalkulator biaya" }).getByRole("listitem").filter({ hasText: name }).getByRole("textbox", { name: /menurutmu/ }),
  ).toHaveValue("123.000");

  // Sesi tersimpan di cookie (bukan hanya di memori).
  const cookies = await context.cookies();
  expect(cookies.some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))).toBe(true);

  // Refresh & buka ulang /draft?build=1 → roadmap yang sama, dimuat dari database.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Roadmap");
  await page.goto("/draft?build=1");
  await expect(page).toHaveURL(new RegExp(`/roadmap/view\\?id=${id}$`));

  // Keluar → roadmap tidak bisa dibuka lagi tanpa login.
  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto(`/roadmap/view?id=${id}`);
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("Supabase: terima/batalkan penugasan (upsert) dan terbitkan cerita yang terbaca publik", async ({ page }) => {
  const title = `Uji live ${Date.now()}`;
  await page.goto("/login?next=%2Fexperience");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk sekarang" }).click();
  await expect(page).toHaveURL(/\/experience$/, { timeout: 30_000 });

  // Upsert: terima → batalkan → terima lagi (menulis ulang baris yang sama).
  const card = page.getByRole("main").getByRole("listitem").first();
  const project = (await card.getByRole("heading", { level: 2 }).textContent())!;
  await card.getByRole("button", { name: `Terima penugasan ${project}` }).click();
  await expect(card.getByText("Diterima", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: `Batalkan penugasan ${project}` }).click();
  await expect(card.getByRole("button", { name: `Terima penugasan ${project}` })).toBeVisible();
  await card.getByRole("button", { name: `Terima penugasan ${project}` }).click();
  await expect(card.getByText("Diterima", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: project }).getByText("Diterima", { exact: true })).toBeVisible();

  // Cerita: terbit, muncul, bisa dibaca tanpa login (tanpa tombol hapus).
  await page.goto("/share");
  await page.getByRole("textbox", { name: "Judul" }).fill(title);
  await page.getByRole("textbox", { name: "Cerita" }).fill("Cerita ini dibuat oleh uji otomatis dan akan langsung dihapus.");
  await page.getByRole("button", { name: "Terbitkan cerita" }).click();
  await expect(page.getByRole("article").filter({ hasText: title })).toBeVisible();

  await page.getByRole("button", { name: "Keluar" }).click();
  await page.goto("/share");
  const publicCard = page.getByRole("article").filter({ hasText: title });
  await expect(publicCard).toBeVisible();
  await expect(publicCard.getByRole("button", { name: "Hapus" })).toHaveCount(0);
});
