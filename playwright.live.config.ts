import { defineConfig, devices } from "@playwright/test";

/**
 * Uji alur login sungguhan ke project Supabase dari .env.local.
 * Butuh akun uji yang sudah terkonfirmasi: LIVE_EMAIL dan LIVE_PASSWORD.
 *   LIVE_EMAIL=... LIVE_PASSWORD=... npm run test:e2e:live
 * Tidak termasuk suite default karena menulis ke database sungguhan.
 */
const PORT = 3300;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e-live",
  workers: 1,
  reporter: "list",
  use: { baseURL, locale: "id-ID", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240_000,
    // Supabase dibaca dari .env.local; AI dipaksa tiruan supaya tidak memakai kuota.
    env: { AI_PROVIDER: "mock", NEXT_PUBLIC_SITE_URL: baseURL, NEXT_TELEMETRY_DISABLED: "1" },
  },
});
