import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountButton } from "@/components/AccountButton";
import { AppHeader } from "@/components/AppHeader";
import { RoadmapView } from "./RoadmapView";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "Langkah demi langkah menuju mimpimu.",
};

export default function RoadmapViewPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav>
        <AccountButton />
      </AppHeader>
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-8">
        <Suspense fallback={null}>
          <RoadmapView />
        </Suspense>
      </main>
    </div>
  );
}
