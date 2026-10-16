import { generateStory } from "@/lib/ai/service";
import { handleAiRoute } from "@/lib/server/ai-route";
import { StoryDraftRequestSchema } from "@/lib/types";

export const maxDuration = 60;

export function POST(request: Request) {
  return handleAiRoute(request, StoryDraftRequestSchema, (input) => generateStory(input));
}
