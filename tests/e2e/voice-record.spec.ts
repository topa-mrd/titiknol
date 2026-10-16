import { expect, test, type Page } from "@playwright/test";

/**
 * Mode rekam (Brave/Firefox, atau saat layanan suara browser gagal): suara
 * direkam lewat mikrofon palsu Chromium, dikirim sebagai WAV ke /api/transcribe.
 * E2E berjalan di mode demo, jadi status AI dan transkripsi disimulasikan.
 */
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["microphone"],
});

const SPOKEN = "Aku ingin jadi desainer grafis yang punya klien sendiri.";

async function fakeServer(page: Page) {
  const bodies: { audio: string; mime: string }[] = [];
  await page.route("**/api/status", (route) => route.fulfill({ json: { ai: "openrouter", supabase: false } }));
  await page.route("**/api/transcribe", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: { text: SPOKEN, provider: "openrouter", fallback: false } });
  });
  return bodies;
}

const dreamBox = (page: Page) => page.getByRole("textbox", { name: "Apa mimpimu?" });

test.describe("Input suara mode rekam", () => {
  test("Brave: rekam → stop → teks masuk dari transkripsi WAV", async ({ page }, testInfo) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "brave", { value: { isBrave: async () => true } }));
    const bodies = await fakeServer(page);
    await page.goto("/start");

    await page.getByRole("button", { name: "Bicara" }).click();
    await expect(page.getByText(/^Merekam 0:0\d \/ 1:00/)).toBeVisible();
    await page.waitForTimeout(1600);
    await page.screenshot({ path: testInfo.outputPath("merekam.png") });
    await page.getByRole("button", { name: "Berhenti" }).click();

    await expect(dreamBox(page)).toHaveValue(SPOKEN);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].mime).toBe("audio/wav");
    expect(bodies[0].audio.startsWith("UklGR")).toBe(true); // "RIFF" dalam base64
    await expect(page.getByRole("button", { name: "Bicara" })).toBeEnabled();
  });

  test("Chrome dengan layanan suara gagal (network) → otomatis beralih ke rekam", async ({ page }) => {
    await page.addInitScript(() => {
      class FailingRecognition {
        lang = "";
        continuous = false;
        interimResults = false;
        maxAlternatives = 1;
        onresult = null;
        onerror: ((e: { error: string }) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          setTimeout(() => {
            this.onerror?.({ error: "network" });
            this.onend?.();
          }, 50);
        }
        stop() {}
        abort() {}
      }
      const w = window as unknown as Record<string, unknown>;
      w.SpeechRecognition = FailingRecognition;
      w.webkitSpeechRecognition = FailingRecognition;
    });
    await fakeServer(page);
    await page.goto("/start");

    await page.getByRole("button", { name: "Bicara" }).click();
    await expect(page.getByText(/^Merekam 0:0\d/)).toBeVisible();
    await expect(page.getByText(/koneksi internet yang stabil/)).toHaveCount(0);
    await page.waitForTimeout(1300);
    await page.getByRole("button", { name: "Berhenti" }).click();
    await expect(dreamBox(page)).toHaveValue(SPOKEN);
  });

  test("transkripsi gagal → pesan dari server, isian tidak berubah", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "brave", { value: {} }));
    await page.route("**/api/status", (route) => route.fulfill({ json: { ai: "openrouter", supabase: false } }));
    await page.route("**/api/transcribe", (route) =>
      route.fulfill({ status: 503, json: { error: "Suaramu belum bisa diubah jadi teks sekarang. Coba lagi sebentar, atau ketik saja ceritamu." } }),
    );
    await page.goto("/start");
    await dreamBox(page).fill("Sudah ada isi");
    await page.getByRole("button", { name: "Bicara" }).click();
    await page.waitForTimeout(1300);
    await page.getByRole("button", { name: "Berhenti" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "belum bisa diubah jadi teks" })).toBeVisible();
    await expect(dreamBox(page)).toHaveValue("Sudah ada isi");
  });

  test("mode demo (AI tiruan) di browser tanpa pengenal suara → tidak menawarkan rekam", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "brave", { value: {} }));
    await page.goto("/start");
    await expect(page.getByText("Input suara belum didukung di browser ini.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bicara" })).toHaveCount(0);
  });
});
