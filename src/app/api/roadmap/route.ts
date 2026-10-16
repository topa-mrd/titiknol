import { generateRoadmap } from "@/lib/ai/service";
import { handleAiRoute } from "@/lib/server/ai-route";
import { RoadmapRequestSchema } from "@/lib/types";

export const maxDuration = 60;

export function POST(request: Request) {
  return handleAiRoute(request, RoadmapRequestSchema, ({ profile, plan }) => generateRoadmap(profile, plan));
}
