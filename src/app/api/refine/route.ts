import { refineDraft } from "@/lib/ai/service";
import { handleAiRoute } from "@/lib/server/ai-route";
import { RefineRequestSchema } from "@/lib/types";

export const maxDuration = 60;

export function POST(request: Request) {
  return handleAiRoute(request, RefineRequestSchema, ({ profile, plans, messages }) =>
    refineDraft(profile, plans, messages),
  );
}
