import { expect, test } from "@playwright/test";

test("beranda tampil rapi tanpa error konsol", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(err.message));

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");

  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tell me your dream.");
  await expect(page.getByRole("region", { name: "Perjalananmu" }).getByRole("listitem")).toHaveCount(5);

  // Tidak ada scroll horizontal di layar sempit.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Font Nunito benar-benar termuat (self-host, bukan fallback sistem).
  const loadedFamilies = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
  });
  expect(loadedFamilies.some((f) => f.includes("Nunito"))).toBe(true);

  await page.screenshot({ path: testInfo.outputPath("beranda.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: testInfo.outputPath("beranda-gelap.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });

  // Tautan lewati-konten muncul saat difokus keyboard.
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Lewati ke konten utama" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("skip-link.png") });
  expect(errors).toEqual([]);
});
