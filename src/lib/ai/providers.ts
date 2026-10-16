import type { AiProvider } from "../types";

/** Rantai default (cek ulang di ai.google.dev/gemini-api/docs/models sebelum demo). */
export const DEFAULT_GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"] as const;
/** Gemini lewat OpenRouter (dilayani Google AI Studio / Vertex). Bukan "openrouter/auto" agar biaya terduga. */
export const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.6-flash";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type Env = Record<string, string | undefined>;

export type AiConfig = {
  /** Provider utama. "mock" = mode demo, tidak memanggil jaringan sama sekali. */
  provider: AiProvider;
  geminiKey: string | null;
  geminiModels: string[];
  openrouterKey: string | null;
  openrouterModel: string;
  fallbackToMock: boolean;
};

const clean = (value: string | undefined) => value?.trim() || null;

export function readAiConfig(env: Env = process.env): AiConfig {
  const geminiKey = clean(env.GEMINI_API_KEY);
  const openrouterKey = clean(env.OPENROUTER_API_KEY);
  const forced = clean(env.AI_PROVIDER)?.toLowerCase();

  // GEMINI_MODEL boleh satu model atau daftar dipisah koma; rantai default tetap jadi cadangan.
  const override = (clean(env.GEMINI_MODEL) ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const geminiModels = [...new Set([...override, ...DEFAULT_GEMINI_MODELS])];

  let provider: AiProvider;
  if (forced === "mock") provider = "mock";
  else if (forced === "gemini" && geminiKey) provider = "gemini";
  else if (forced === "openrouter" && openrouterKey) provider = "openrouter";
  else provider = geminiKey ? "gemini" : openrouterKey ? "openrouter" : "mock";

  return {
    provider,
    geminiKey,
    geminiModels,
    openrouterKey,
    openrouterModel: clean(env.OPENROUTER_MODEL) ?? DEFAULT_OPENROUTER_MODEL,
    fallbackToMock: clean(env.AI_FALLBACK_TO_MOCK)?.toLowerCase() !== "false",
  };
}

export type Target = { provider: "gemini" | "openrouter"; model: string };

/**
 * Urutan model yang dicoba: provider utama dulu, lalu provider lain bila key-nya ada.
 */
export function buildTargets(config: AiConfig): Target[] {
  if (config.provider === "mock") return [];
  const gemini: Target[] = config.geminiKey
    ? config.geminiModels.map((model) => ({ provider: "gemini", model }))
    : [];
  const openrouter: Target[] = config.openrouterKey
    ? [{ provider: "openrouter", model: config.openrouterModel }]
    : [];
  return config.provider === "gemini" ? [...gemini, ...openrouter] : [...openrouter, ...gemini];
}

/**
 * - "next-model": coba model berikutnya (429 kuota, 404 model hilang, 5xx, timeout, jaringan).
 * - "stop-provider": key salah/ditolak; model lain dari provider yang sama pasti gagal juga.
 */
export type ProviderErrorKind = "next-model" | "stop-provider";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function classifyHttpError(status: number, body: string): ProviderErrorKind {
  if (status === 401 || status === 403) return "stop-provider";
  // Gemini membalas key yang tidak valid dengan 400 INVALID_ARGUMENT, bukan 401.
  if (status === 400 && /API_KEY_INVALID|API key not valid|API key expired/i.test(body)) return "stop-provider";
  return "next-model";
}

export type Prompt = {
  system: string;
  user: string;
  /** Lampiran audio (base64) untuk transkripsi. */
  audio?: { data: string; mime: "audio/wav" };
  temperature?: number;
  /** Jumlah hasil pencarian web (OpenRouter/Exa); default 5. */
  searchResults?: number;
};
export type CallOptions = { signal: AbortSignal; fetch: typeof fetch; siteUrl?: string };

async function failFromResponse(provider: string, res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  const kind = classifyHttpError(res.status, body);
  throw new ProviderError(kind, res.status, `${provider} HTTP ${res.status}`);
}

async function callGemini(key: string, model: string, prompt: Prompt, opts: CallOptions): Promise<string> {
  const res = await opts.fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    signal: opts.signal,
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt.user },
            ...(prompt.audio ? [{ inline_data: { mime_type: prompt.audio.mime, data: prompt.audio.data } }] : []),
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", temperature: prompt.temperature ?? 0.7, maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) await failFromResponse("gemini", res);

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (json.promptFeedback?.blockReason) {
    throw new ProviderError("next-model", 200, `gemini memblokir prompt: ${json.promptFeedback.blockReason}`);
  }
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  if (!text.trim()) {
    throw new ProviderError("next-model", 200, `gemini tidak mengirim teks (${json.candidates?.[0]?.finishReason ?? "?"})`);
  }
  return text;
}

async function callOpenRouter(key: string, model: string, prompt: Prompt, opts: CallOptions): Promise<string> {
  const res = await opts.fetch(OPENROUTER_URL, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(opts.siteUrl ? { "HTTP-Referer": opts.siteUrl } : {}),
      "X-Title": "TitikNol",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: prompt.audio
            ? [
                { type: "text", text: prompt.user },
                { type: "input_audio", input_audio: { data: prompt.audio.data, format: "wav" } },
              ]
            : prompt.user,
        },
      ],
      response_format: { type: "json_object" },
      temperature: prompt.temperature ?? 0.7,
    }),
  });
  if (!res.ok) await failFromResponse("openrouter", res);

  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
    error?: { code?: number; message?: string };
  };
  if (json.error) {
    const status = typeof json.error.code === "number" ? json.error.code : 502;
    throw new ProviderError(classifyHttpError(status, json.error.message ?? ""), status, "openrouter error");
  }
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new ProviderError("next-model", 200, "openrouter tidak mengirim teks");
  return text;
}

export function callTarget(config: AiConfig, target: Target, prompt: Prompt, opts: CallOptions): Promise<string> {
  if (target.provider === "gemini" && config.geminiKey) {
    return callGemini(config.geminiKey, target.model, prompt, opts);
  }
  if (target.provider === "openrouter" && config.openrouterKey) {
    return callOpenRouter(config.openrouterKey, target.model, prompt, opts);
  }
  return Promise.reject(new ProviderError("stop-provider", null, `${target.provider} tidak dikonfigurasi`));
}

export type GroundedAnswer = { text: string; sources: { uri: string; title: string }[] };

/**
 * Gemini + Google Search (grounding). Mode JSON tidak dipakai karena tidak
 * dijamin bisa digabung dengan alat pencarian; JSON diambil dari teks.
 * Sumber diambil dari groundingMetadata (hasil pencarian sungguhan), bukan dari teks model.
 */
export async function callGeminiWithSearch(
  key: string,
  model: string,
  prompt: Prompt,
  opts: CallOptions,
): Promise<GroundedAnswer> {
  const res = await opts.fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    signal: opts.signal,
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: "user", parts: [{ text: prompt.user }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) await failFromResponse("gemini", res);

  const json = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string; thought?: boolean }[] };
      groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
    }[];
    promptFeedback?: { blockReason?: string };
  };
  if (json.promptFeedback?.blockReason) {
    throw new ProviderError("next-model", 200, `gemini memblokir prompt: ${json.promptFeedback.blockReason}`);
  }
  const candidate = json.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? []).flatMap((chunk) =>
    chunk.web?.uri && /^https:\/\//.test(chunk.web.uri) ? [{ uri: chunk.web.uri, title: chunk.web.title ?? "" }] : [],
  );
  return { text, sources };
}

/**
 * OpenRouter + plugin web search dengan mesin Exa. Diuji nyata 15 Okt 2026:
 * Exa mengembalikan URL sumber asli (termasuk situs resmi) sebagai anotasi
 * url_citation dengan biaya ±$0,01 per pencarian, sedangkan pencarian bawaan
 * Google lewat OpenRouter hanya memberi URL redirect dan ±8× lebih mahal.
 * Anotasi hanya muncul bila model menulis teks yang mengutip sumber.
 */
export async function callOpenRouterWithSearch(
  key: string,
  model: string,
  prompt: Prompt,
  opts: CallOptions,
): Promise<GroundedAnswer> {
  const res = await opts.fetch(OPENROUTER_URL, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(opts.siteUrl ? { "HTTP-Referer": opts.siteUrl } : {}),
      "X-Title": "TitikNol",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      plugins: [{ id: "web", engine: "exa", max_results: prompt.searchResults ?? 5 }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) await failFromResponse("openrouter", res);

  const json = (await res.json()) as {
    choices?: {
      finish_reason?: string | null;
      native_finish_reason?: string | null;
      message?: {
        content?: string | null;
        annotations?: { type?: string; url_citation?: { url?: string; title?: string } }[];
      };
    }[];
    error?: { code?: number; message?: string };
  };
  if (json.error) {
    const status = typeof json.error.code === "number" ? json.error.code : 502;
    throw new ProviderError(classifyHttpError(status, json.error.message ?? ""), status, "openrouter error");
  }
  const choice = json.choices?.[0];
  // Gemini via OpenRouter kadang berhenti dengan galat (mis. MALFORMED_FUNCTION_CALL) tanpa teks: coba lagi.
  if (choice?.finish_reason === "error" || (!choice?.message?.content?.trim() && choice?.native_finish_reason)) {
    throw new ProviderError("next-model", 200, `openrouter berhenti tanpa teks (${choice?.native_finish_reason ?? choice?.finish_reason})`);
  }
  const message = choice?.message;
  const sources = (message?.annotations ?? []).flatMap((a) =>
    a.type === "url_citation" && a.url_citation?.url && /^https:\/\//.test(a.url_citation.url)
      ? [{ uri: a.url_citation.url, title: a.url_citation.title ?? "" }]
      : [],
  );
  return { text: message?.content ?? "", sources };
}
