import { expect, test } from "@playwright/test";
import { loginDemo } from "./helpers";

test.describe("Admin katalog", () => {
  test("belum login: diminta masuk dulu", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Admin TitikNol" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Masuk sebagai admin" })).toBeVisible();
  });

  test("mode demo: lowongan & pendaftar bisa dicoba, katalog sumber menjelaskan butuh Supabase, tanpa error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await loginDemo(page, "/admin");
    await expect(page.getByRole("main").getByText("Mode demo.", { exact: true })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Saring lowongan" })).toBeVisible();
    await expect(page.getByText("Tidak ada lowongan dengan status ini.")).toBeVisible();
    await page.getByRole("tab", { name: "Katalog sumber" }).click();
    await expect(page.getByRole("heading", { name: "Admin butuh Supabase" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Saring status" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("mode demo: header tidak menampilkan tautan Admin", async ({ page }) => {
    await page.goto("/roadmap");
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  });
});
