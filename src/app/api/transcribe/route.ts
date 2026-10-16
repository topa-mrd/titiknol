import { transcribeAudio } from "@/lib/ai/service";
import { handleAiRoute } from "@/lib/server/ai-route";
import { TranscribeRequestSchema } from "@/lib/types";

export const maxDuration = 60;

/** WAV 60 detik dalam base64 + amplop JSON. */
const MAX_BYTES = 3_000_000;

export function POST(request: Request) {
  return handleAiRoute(request, TranscribeRequestSchema, (input) => transcribeAudio(input), {
    maxBytes: MAX_BYTES,
    unavailableMessage: "Suaramu belum bisa diubah jadi teks sekarang. Coba lagi sebentar, atau ketik saja ceritamu.",
  });
}
