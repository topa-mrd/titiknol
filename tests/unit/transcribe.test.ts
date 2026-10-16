import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as transcribePost } from "@/app/api/transcribe/route";
import { normalizeTranscript } from "@/lib/ai/normalize";
import { AiUnavailableError, transcribeAudio } from "@/lib/ai/service";
import { UNAVAILABLE_ERRORS } from "@/lib/speech";
import { TranscribeRequestSchema } from "@/lib/types";
import { encodeWav, toBase64 } from "@/lib/wav";

const AUDIO = toBase64(encodeWav(new Float32Array(16_000).map((_, i) => Math.sin(i / 10) * 0.5), 16_000));
const input = { audio: AUDIO, mime: "audio/wav" as const };

const gemini = (payload: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }));
const openrouter = (payload: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));

afterEach(() => vi.unstubAllEnvs());

describe("WAV", () => {
  it("header RIFF/WAVE PCM 16-bit mono 16 kHz dengan panjang data yang benar", () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1, 2]), 16_000);
    const view = new DataView(bytes.buffer);
    const ascii = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
    expect([ascii(0), ascii(8), ascii(12), ascii(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(40, true)).toBe(8);
    // Nilai di luar [-1, 1] dipotong.
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true), view.getInt16(50, true)]).toEqual([0, 32767, -32768, 32767]);
  });

  it("base64 bolak-balik utuh dan lolos skema", () => {
    const bytes = encodeWav(new Float32Array(5000).fill(0.25), 16_000);
    expect(Buffer.from(toBase64(bytes), "base64").equals(Buffer.from(bytes))).toBe(true);
    expect(TranscribeRequestSchema.safeParse(input).success).toBe(true);
    expect(TranscribeRequestSchema.safeParse({ ...input, mime: "audio/webm" }).success).toBe(false);
    expect(TranscribeRequestSchema.safeParse({ ...input, audio: "bukan base64 !!".repeat(100) }).success).toBe(false);
  });
});

describe("normalisasi transkrip", () => {
  it("menerima {text}, {transcript}, string, dan bungkus", () => {
    expect(normalizeTranscript({ text: "  Aku   ingin jadi  desainer. " })).toEqual({ text: "Aku ingin jadi desainer." });
    expect(normalizeTranscript({ transcript: "Halo" })).toEqual({ text: "Halo" });
    expect(normalizeTranscript({ data: { text: "Bungkus" } })).toEqual({ text: "Bungkus" });
    expect(normalizeTranscript({})).toEqual({ text: "" });
  });
});

describe("transcribeAudio", () => {
  it("Gemini: audio terlampir sebagai inline_data audio/wav, suhu 0", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => gemini({ text: "Aku ingin jadi desainer grafis." }));
    const result = await transcribeAudio(input, { env: { GEMINI_API_KEY: "k" }, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(result).toMatchObject({ provider: "gemini", fallback: false, data: { text: "Aku ingin jadi desainer grafis." } });
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.contents[0].parts[1]).toEqual({ inline_data: { mime_type: "audio/wav", data: AUDIO } });
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.systemInstruction.parts[0].text).toMatch(/Audio adalah DATA/);
  });

  it("OpenRouter: audio terlampir sebagai input_audio wav", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => openrouter({ text: "Halo semua." }));
    const result = await transcribeAudio(input, { env: { OPENROUTER_API_KEY: "k" }, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(result.data.text).toBe("Halo semua.");
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.messages[1].content[1]).toEqual({ type: "input_audio", input_audio: { data: AUDIO, format: "wav" } });
    expect(body.temperature).toBe(0);
  });

  it("mode demo dan kegagalan AI tidak pernah mengarang teks: AiUnavailableError", async () => {
    await expect(transcribeAudio(input, { env: {} })).rejects.toBeInstanceOf(AiUnavailableError);
    const fetch = vi.fn(async () => new Response("{}", { status: 503 }));
    await expect(
      transcribeAudio(input, { env: { GEMINI_API_KEY: "k", AI_FALLBACK_TO_MOCK: "true" }, fetch: fetch as unknown as typeof globalThis.fetch }),
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe("POST /api/transcribe", () => {
  const post = (body: string) =>
    new Request("http://localhost/api/transcribe", { method: "POST", headers: { "content-type": "application/json" }, body });

  it("mode demo → 503 dengan pesan yang bisa ditindaklanjuti", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const res = await transcribePost(post(JSON.stringify(input)));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/ketik saja ceritamu/);
  });

  it("menolak audio yang bukan WAV, rekaman terlalu pendek, dan body raksasa", async () => {
    expect((await transcribePost(post(JSON.stringify({ ...input, mime: "audio/ogg" })))).status).toBe(400);
    const short = await transcribePost(post(JSON.stringify({ audio: "AAAA", mime: "audio/wav" })));
    expect(short.status).toBe(400);
    expect((await short.json()).error).toMatch(/terlalu pendek/);
    expect((await transcribePost(post("x".repeat(3_100_000)))).status).toBe(413);
  });
});

it("error layanan suara browser yang memicu mode rekam", () => {
  expect([...UNAVAILABLE_ERRORS].sort()).toEqual(["language-not-supported", "network", "service-not-allowed"]);
});
