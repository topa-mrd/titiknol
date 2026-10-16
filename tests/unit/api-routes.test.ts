import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as draftPost } from "@/app/api/draft/route";
import { POST as refinePost } from "@/app/api/refine/route";
import { POST as roadmapPost } from "@/app/api/roadmap/route";
import { getStatus } from "@/lib/server/status";
import { DraftSchema, RefineSchema, ResolvedRoadmapSchema } from "@/lib/types";
import { plans, profile } from "../fixtures/data";

const post = (body: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

afterEach(() => vi.unstubAllEnvs());

describe("API routes (mode demo)", () => {
  it("POST /api/draft → profil + tepat 3 plan + meta", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const res = await draftPost(post({ dream: "Aku ingin jadi desainer UI/UX.", background: "Dari Kediri." }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(DraftSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ provider: "mock", fallback: false });
  });

  it("POST /api/draft menolak cerita kosong dengan pesan yang bisa dipahami", async () => {
    const res = await draftPost(post({ dream: "  ", background: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/minimal 10 karakter/);
  });

  it("POST /api/draft menolak cerita > 4000 karakter dan body rusak", async () => {
    const long = await draftPost(post({ dream: "a".repeat(4001) }));
    expect(long.status).toBe(400);
    expect((await long.json()).error).toMatch(/4000 karakter/);
    const broken = await draftPost(post("{bukan json"));
    expect(broken.status).toBe(400);
    expect((await broken.json()).error).toMatch(/Muat ulang/);
  });

  it("POST /api/refine → reply + 3 plan", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const res = await refinePost(post({ profile, plans, messages: [{ role: "user", content: "Cari yang lebih murah" }] }));
    expect(res.status).toBe(200);
    expect(RefineSchema.safeParse(await res.json()).success).toBe(true);
  });

  it("POST /api/refine menolak percakapan yang tidak diakhiri pesan pengguna", async () => {
    const res = await refinePost(post({ profile, plans, messages: [{ role: "assistant", content: "Halo" }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Pesan terakhir harus dari pengguna.");
  });

  it("POST /api/roadmap → roadmap dengan sumber dari katalog", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const res = await roadmapPost(post({ profile, plan: plans[0] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(ResolvedRoadmapSchema.safeParse(body).success).toBe(true);
    expect(body.steps.some((s: { resources: unknown[] }) => s.resources.length > 0)).toBe(true);
  });
});

describe("status", () => {
  it("melaporkan provider AI dan Supabase sesuai env", () => {
    expect(getStatus({})).toEqual({ ai: "mock", supabase: expect.any(Boolean) });
    expect(getStatus({ GEMINI_API_KEY: "k" }).ai).toBe("gemini");
    expect(getStatus({ OPENROUTER_API_KEY: "k" }).ai).toBe("openrouter");
  });
});
