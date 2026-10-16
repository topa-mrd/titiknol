import { expect, test, type Page } from "@playwright/test";
import { createDraft, planCard, readSession } from "./helpers";

const demoRoadmaps = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("titiknol:demo:roadmaps") ?? "[]") as { id: string; plan: { id: string } }[]);

const roadmapIdFromUrl = (page: Page) => new URL(page.url()).searchParams.get("id");

async function choosePlanAndBuild(page: Page, id: "A" | "B" | "C") {
  await planCard(page, id).getByText(`Plan ${id}`, { exact: true }).click();
  await page.getByRole("button", { name: `Buat roadmap Plan ${id}` }).click();
}

test.describe("Login & simpan roadmap (mode demo)", () => {
  test("belum login → login → roadmap terbuat otomatis; refresh tidak membuat duplikat", async ({ page }, testInfo) => {
    await createDraft(page);
    await choosePlanAndBuild(page, "A");

    // Belum login → diarahkan ke /login dengan tujuan kembali membangun roadmap.
    await expect(page).toHaveURL(/\/login\?next=%2Fdraft%3Fbuild%3D1$/);
    await expect(page.getByRole("heading", { level: 1, name: "Simpan roadmapmu" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("login.png"), fullPage: true });

    await page.getByRole("textbox", { name: /Nama panggilan/ }).fill("Rina");
    await page.getByRole("button", { name: "Masuk dengan akun demo" }).click();

    // Setelah login: /draft?build=1 membangun roadmap lalu membukanya.
    await expect(page).toHaveURL(/\/roadmap\/view\?id=[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Roadmap");
    await expect(page.getByRole("button", { name: "Keluar" })).toBeVisible();
    const firstId = roadmapIdFromUrl(page);
    expect(await demoRoadmaps(page)).toHaveLength(1);
    expect((await readSession(page)).roadmapId).toBe(firstId);

    // Refresh halaman roadmap: tetap satu.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Roadmap");
    expect(await demoRoadmaps(page)).toHaveLength(1);

    // Buka ulang /draft?build=1 (mis. tombol back / refresh saat redirect): pakai roadmap yang sama.
    await page.goto("/draft?build=1");
    await expect(page).toHaveURL(new RegExp(`/roadmap/view\\?id=${firstId}$`));
    expect(await demoRoadmaps(page)).toHaveLength(1);

    // Tombol build lagi untuk plan yang sama juga tidak menggandakan.
    await page.goto("/draft");
    await page.getByRole("button", { name: "Buat roadmap Plan A" }).click();
    await expect(page).toHaveURL(new RegExp(`/roadmap/view\\?id=${firstId}$`));
    expect(await demoRoadmaps(page)).toHaveLength(1);
  });

  test("sudah login + ganti plan → langsung dibuat roadmap baru untuk plan itu", async ({ page }) => {
    await createDraft(page);
    await page.goto("/login");
    await page.getByRole("button", { name: "Masuk dengan akun demo" }).click();
    await expect(page).toHaveURL(/\/roadmap$/);

    await page.goto("/draft");
    await choosePlanAndBuild(page, "A");
    await expect(page).toHaveURL(/\/roadmap\/view\?id=/);
    const first = roadmapIdFromUrl(page);

    await page.goto("/draft");
    await choosePlanAndBuild(page, "C");
    await expect(page).toHaveURL(/\/roadmap\/view\?id=/);
    expect(roadmapIdFromUrl(page)).not.toBe(first);
    const rows = await demoRoadmaps(page);
    expect(rows.map((r) => r.plan.id).sort()).toEqual(["A", "C"]);
  });

  test("halaman login mengalihkan pengguna yang sudah masuk", async ({ page }) => {
    await page.goto("/login?next=%2Fdraft");
    await page.getByRole("button", { name: "Masuk dengan akun demo" }).click();
    await expect(page).toHaveURL(/\/draft$/);
    await page.goto("/login?next=%2Fdraft");
    await expect(page).toHaveURL(/\/draft$/);
  });

  test("parameter next eksternal diabaikan (anti open-redirect)", async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;

    // Belum login: setelah masuk, tetap di situs sendiri.
    await page.goto("/login?next=https%3A%2F%2Fjahat.example");
    await page.getByRole("button", { name: "Masuk dengan akun demo" }).click();
    await page.waitForURL(`${origin}/roadmap`);

    // Sudah login: pengalihan otomatis juga menolak URL protokol-relatif.
    await page.goto("/login?next=%2F%2Fjahat.example");
    await page.waitForURL(`${origin}/roadmap`);
    expect(page.url()).toBe(`${origin}/roadmap`);
  });

  test("keluar → roadmap tidak bisa dibuka tanpa login", async ({ page }) => {
    await createDraft(page);
    await choosePlanAndBuild(page, "B");
    await page.getByRole("button", { name: "Masuk dengan akun demo" }).click();
    await expect(page).toHaveURL(/\/roadmap\/view\?id=/);
    const viewUrl = page.url();

    await page.getByRole("button", { name: "Keluar" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto(viewUrl);
    await expect(page).toHaveURL(/\/login\?next=%2Froadmap%2Fview/);
  });

  test("roadmap milik orang lain / id asal → tidak ditemukan", async ({ page }) => {
    await page.goto("/login?next=%2Fdraft");
    await page.getByRole("button", { name: "Masuk dengan akun demo" }).click();
    await expect(page).toHaveURL(/\/draft$/);
    await page.goto("/roadmap/view?id=00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { name: "Roadmap tidak ditemukan" })).toBeVisible();
  });

  test("AI roadmap gagal → pesan jelas, tidak ada roadmap tersimpan, bisa coba lagi", async ({ page }) => {
    await createDraft(page);
    await page.goto("/login?next=%2Fdraft");
    await page.getByRole("button", { name: "Masuk dengan akun demo" }).click();
    await expect(page).toHaveURL(/\/draft$/);

    await page.route("**/api/roadmap", (route) =>
      route.fulfill({ status: 503, json: { error: "AI sedang sibuk atau tidak bisa dihubungi. Tunggu sebentar lalu coba lagi." } }),
    );
    await choosePlanAndBuild(page, "A");
    const alert = page.getByRole("alert").filter({ hasText: "Roadmap belum berhasil dibuat" });
    await expect(alert).toContainText("AI sedang sibuk");
    expect(await demoRoadmaps(page)).toHaveLength(0);

    await page.unroute("**/api/roadmap");
    await alert.getByRole("button", { name: "Coba lagi" }).click();
    await expect(page).toHaveURL(/\/roadmap\/view\?id=/);
    expect(await demoRoadmaps(page)).toHaveLength(1);
  });
});
