// Cek ulang semua URL katalog sebelum demo: npm run check:urls
// Keluar dengan kode 1 jika ada URL yang rusak (bukan 2xx).
// URL yang ditahan proteksi bot (mis. Cloudflare challenge) tetap terbuka di
// browser manusia, jadi ditandai "cek manual" dan tidak menggagalkan proses.
import { get } from "node:https";
import { RESOURCES } from "../src/lib/resources";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const HEADERS = { "user-agent": UA, accept: "text/html", "accept-language": "id-ID,id;q=0.9,en;q=0.8" };
const CONCURRENCY = 8;
const TIMEOUT_MS = 20_000;

type Verdict = "ok" | "bot" | "rusak";
type Result = { id: string; status: number | string; finalUrl: string; verdict: Verdict };

/** Cadangan tanpa fetch: paksa IPv4 (beberapa jaringan punya IPv6 yang tidak terjangkau). */
function getViaIpv4(url: string, redirectsLeft = 5): Promise<{ status: number; url: string; headers: Headers }> {
  return new Promise((resolve, reject) => {
    const req = get(url, { family: 4, headers: HEADERS, timeout: TIMEOUT_MS }, (res) => {
      res.resume();
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
        resolve(getViaIpv4(new URL(location, url).href, redirectsLeft - 1));
        return;
      }
      const headers = new Headers();
      for (const [k, v] of Object.entries(res.headers)) if (typeof v === "string") headers.set(k, v);
      resolve({ status, url, headers });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function check(id: string, url: string): Promise<Result> {
  let res: { status: number; url: string; headers: Headers };
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS), headers: HEADERS });
    await response.body?.cancel();
    res = { status: response.status, url: response.url, headers: response.headers };
  } catch {
    try {
      res = await getViaIpv4(url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "error";
      return { id, status: reason, finalUrl: url, verdict: "rusak" };
    }
  }
  const verdict: Verdict =
    res.status >= 200 && res.status < 300
      ? "ok"
      : res.headers.get("cf-mitigated") === "challenge" || res.status === 429
        ? "bot"
        : "rusak";
  return { id, status: res.status, finalUrl: res.url, verdict };
}

const queue = RESOURCES.map((r) => ({ id: r.id, url: r.url }));
const results: Result[] = [];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let r = queue.shift(); r; r = queue.shift()) results.push(await check(r.id, r.url));
  }),
);

const ICON: Record<Verdict, string> = { ok: "✓", bot: "⚠", rusak: "✗" };
const originalUrl = new Map(RESOURCES.map((r) => [r.id, r.url]));
for (const r of results.sort((a, b) => a.id.localeCompare(b.id))) {
  const moved = r.finalUrl !== originalUrl.get(r.id) ? `  → ${r.finalUrl}` : "";
  const hint = r.verdict === "bot" ? "  (ditahan proteksi bot, cek manual di browser)" : "";
  console.log(`${ICON[r.verdict]} ${String(r.status).padEnd(8)} ${r.id}${moved}${hint}`);
}

const tally = (v: Verdict) => results.filter((r) => r.verdict === v).length;
console.log(`\n${tally("ok")} sehat · ${tally("bot")} perlu cek manual · ${tally("rusak")} rusak (dari ${results.length})`);
if (tally("rusak") > 0) process.exit(1);
