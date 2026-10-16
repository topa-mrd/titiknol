import { researchCosts } from "@/lib/ai/service";
import { handleAiRoute } from "@/lib/server/ai-route";
import { CostResearchRequestSchema } from "@/lib/types";

export const maxDuration = 60;

/** Biaya besar roadmap (kuliah, hidup, visa…) dari pencarian web; setiap angka bersumber. */
export function POST(request: Request) {
  return handleAiRoute(
    request,
    CostResearchRequestSchema,
    async (input) => {
      const result = await researchCosts(input);
      return {
        data: { extras: result.extras, savings: result.savings, status: result.status },
        provider: result.provider,
        model: null,
        fallback: false,
      };
    },
    { unavailableMessage: "Biaya kuliah dan biaya hidup belum bisa dicari sekarang. Coba lagi nanti, atau isi perkiraanmu sendiri." },
  );
}
