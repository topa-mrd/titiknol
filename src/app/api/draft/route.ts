import { generateDraft } from "@/lib/ai/service";
import { handleAiRoute } from "@/lib/server/ai-route";
import { DraftRequestSchema } from "@/lib/types";

export const maxDuration = 60;

export function POST(request: Request) {
  return handleAiRoute(request, DraftRequestSchema, (input) => generateDraft(input));
}
