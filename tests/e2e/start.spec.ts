import { expect, test, type Page } from "@playwright/test";

type FakeSpeechOptions = { transcripts?: string[]; error?: string; unsupported?: boolean };

/**
 * SpeechRecognition palsu yang meniru Chrome: hasil sementara → final, lalu
 * sesi pertama berhenti sendiri (seperti saat hening) untuk menguji sambung ulang.
 */
async function installFakeSpeech(page: Page, options: FakeSpeechOptions) {
  await page.addInitScript((opts: FakeSpeechOptions) => {
    type Handler<T> = ((event: T) => void) | null;
    const w = window as unknown as Record<string, unknown> & {
      __speech: { starts: number; stops: number; lang: string };
    };
    if (opts.unsupported) {
      delete w.SpeechRecognition;
      delete w.webkitSpeechRecognition;
      return;
    }
    w.__speech = { starts: 0, stops: 0, lang: "" };

    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: Handler<unknown> = null;
      onerror: Handler<{ error: string }> = null;
      onend: (() => void) | null = null;

      start() {
        const n = ++w.__speech.starts;
        w.__speech.lang = this.lang;
        setTimeout(() => {
          if (opts.error) {
            this.onerror?.({ error: opts.error });
            this.onend?.();
            return;
          }
          const list = opts.transcripts ?? [];
          const text = list[(n - 1) % list.length];
          const interim = Object.assign([{ transcript: text.slice(0, 10) }], { isFinal: false });
          this.onresult?.({ resultIndex: 0, results: [interim] });
          setTimeout(() => {
            const final = Object.assign([{ transcript: text }], { isFinal: true });
            this.onresult?.({ resultIndex: 0, results: [final] });
            if (n === 1) setTimeout(() => this.onend?.(), 80);
          }, 80);
        }, 80);
      }

      stop() {
        w.__speech.stops++;
        setTimeout(() => this.onend?.(), 10);
      }

      abort() {
        setTimeout(() => this.onend?.(), 0);
      }
    }
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
  }, options);
}

const DREAM = "Aku ingin jadi desainer UI/UX yang bisa kerja remote.";
const BACKGROUND = "Lulusan SMK multimedia di Kediri, kerja paruh waktu, biaya terbatas.";

const dreamBox = (page: Page) => page.getByRole("textbox", { name: "Apa mimpimu?" });
const backgroundBox = (page: Page) => page.getByRole("textbox", { name: "Ceritakan kondisimu sekarang" });

test.describe("Tell me your dream", () => {
  test("alur ketik lengkap: landing → dua pertanyaan → draf tersusun", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.getByText("Mode demo: jawaban AI masih tiruan.")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("landing.png"), fullPage: true });

    await page.getByRole("link", { name: "Ceritakan mimpimu" }).click();
    await expect(page).toHaveURL(/\/start$/);
    await expect(page.getByRole("heading", { level: 1, name: "Apa mimpimu?" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Kemajuan pertanyaan" })).toHaveAttribute("aria-valuenow", "1");

    await dreamBox(page).fill(DREAM);
    await page.screenshot({ path: testInfo.outputPath("start-1.png"), fullPage: true });
    await page.getByRole("button", { name: "Lanjut" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Ceritakan kondisimu sekarang" })).toBeVisible();
    await expect(backgroundBox(page)).toBeFocused();
    await backgroundBox(page).fill(BACKGROUND);

    const draftResponse = page.waitForResponse((r) => r.url().endsWith("/api/draft") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Susun rencanaku" }).click();
    expect((await draftResponse).status()).toBe(200);

    await expect(page).toHaveURL(/\/draft$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tiga jalur untukmu" })).toBeVisible();
    for (const id of ["A", "B", "C"]) await expect(page.getByText(`Plan ${id}`, { exact: true })).toBeVisible();

    const session = await page.evaluate(() => JSON.parse(localStorage.getItem("titiknol:draft:v1") ?? "null"));
    expect(session.answers).toEqual({ dream: DREAM, background: BACKGROUND });
    expect(session.draft.plans).toHaveLength(3);
    expect(session.draft.profile.location).toBe("Kediri");
    expect(session.meta).toEqual({ provider: "mock", fallback: false });

    // Kembali ke beranda: tautan lanjutkan draf muncul.
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Lanjutkan draf rencanamu" })).toBeVisible();
  });

  test("validasi: jawaban kosong ditolak dengan pesan yang jelas", async ({ page }) => {
    await page.goto("/start");
    await page.getByRole("button", { name: "Lanjut" }).click();
    await expect(page.getByText("Ceritakan mimpimu sedikit lebih panjang, minimal 10 karakter.")).toBeVisible();
    await expect(dreamBox(page)).toHaveAttribute("aria-invalid", "true");
    await expect(dreamBox(page)).toBeFocused();

    await dreamBox(page).fill(DREAM);
    await expect(dreamBox(page)).not.toHaveAttribute("aria-invalid", "true");
  });

  test("jawaban tersimpan saat refresh dan saat kembali ke pertanyaan 1", async ({ page }) => {
    await page.goto("/start");
    await dreamBox(page).fill(DREAM);
    await page.reload();
    await expect(dreamBox(page)).toHaveValue(DREAM);

    await page.getByRole("button", { name: "Lanjut" }).click();
    await backgroundBox(page).fill(BACKGROUND);
    await page.getByRole("button", { name: "Kembali" }).click();
    await expect(dreamBox(page)).toHaveValue(DREAM);
  });

  test("tombol contoh cerita mengisi jawaban", async ({ page }) => {
    await page.goto("/start");
    await page.getByRole("button", { name: "Isi dengan contoh cerita" }).click();
    await expect(dreamBox(page)).toHaveValue(/desainer UI\/UX/);
    await expect(page.getByRole("button", { name: "Isi dengan contoh cerita" })).toHaveCount(0);
  });

  test("error server ditampilkan, cerita aman, lalu bisa coba lagi", async ({ page }, testInfo) => {
    await page.route("**/api/draft", (route) =>
      route.fulfill({ status: 503, json: { error: "AI sedang sibuk atau tidak bisa dihubungi. Tunggu sebentar lalu coba lagi." } }),
    );
    await page.goto("/start");
    await dreamBox(page).fill(DREAM);
    await page.getByRole("button", { name: "Lanjut" }).click();
    await backgroundBox(page).fill(BACKGROUND);
    await page.getByRole("button", { name: "Susun rencanaku" }).click();

    const alert = page.getByRole("alert").filter({ hasText: "Rencanamu belum berhasil disusun" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("AI sedang sibuk");
    await expect(backgroundBox(page)).toHaveValue(BACKGROUND);
    await page.screenshot({ path: testInfo.outputPath("start-error.png"), fullPage: true });

    await page.unroute("**/api/draft");
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expect(page).toHaveURL(/\/draft$/);
  });

  test("koneksi putus dijelaskan dengan bahasa manusia", async ({ page }) => {
    await page.route("**/api/draft", (route) => route.abort("internetdisconnected"));
    await page.goto("/start");
    await dreamBox(page).fill(DREAM);
    await page.getByRole("button", { name: "Lanjut" }).click();
    await backgroundBox(page).fill(BACKGROUND);
    await page.getByRole("button", { name: "Susun rencanaku" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Koneksi ke server terputus" })).toBeVisible();
  });
});

test.describe("VoiceInput", () => {
  test("transkrip suara masuk ke textarea dan tersambung ulang setelah hening", async ({ page }, testInfo) => {
    await installFakeSpeech(page, { transcripts: ["aku ingin jadi desainer", "yang kerja dari rumah"] });
    await page.goto("/start");

    const mic = page.getByRole("button", { name: "Bicara" });
    await mic.click();
    const stop = page.getByRole("button", { name: "Berhenti" });
    await expect(stop).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Mendengarkan…")).toBeVisible();

    // Sesi pertama selesai karena "hening" → harus tersambung ulang otomatis.
    await expect(dreamBox(page)).toHaveValue("Aku ingin jadi desainer yang kerja dari rumah");
    expect(await page.evaluate(() => (window as unknown as { __speech: { starts: number } }).__speech.starts)).toBe(2);
    expect(await page.evaluate(() => (window as unknown as { __speech: { lang: string } }).__speech.lang)).toBe("id-ID");
    await page.screenshot({ path: testInfo.outputPath("voice-listening.png") });

    await stop.click();
    await expect(page.getByRole("button", { name: "Bicara" })).toHaveAttribute("aria-pressed", "false");
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as unknown as { __speech: { starts: number } }).__speech.starts)).toBe(2);

    // Transkrip tetap bisa diedit manual.
    await dreamBox(page).press("End");
    await dreamBox(page).pressSequentially(".");
    await expect(dreamBox(page)).toHaveValue("Aku ingin jadi desainer yang kerja dari rumah.");
  });

  test("izin mikrofon ditolak → pesan jelas dan tidak menyambung ulang", async ({ page }) => {
    await installFakeSpeech(page, { error: "not-allowed" });
    await page.goto("/start");
    await page.getByRole("button", { name: "Bicara" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Izin mikrofon ditolak" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bicara" })).toHaveAttribute("aria-pressed", "false");
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as unknown as { __speech: { starts: number } }).__speech.starts)).toBe(1);
  });

  test("browser tanpa dukungan suara → kolom ketik tetap jalan", async ({ page }) => {
    await installFakeSpeech(page, { unsupported: true });
    await page.goto("/start");
    await expect(page.getByText("Input suara belum didukung di browser ini.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Bicara" })).toHaveCount(0);
    await dreamBox(page).fill(DREAM);
    await expect(dreamBox(page)).toHaveValue(DREAM);
  });
});
