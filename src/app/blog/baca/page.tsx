import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountButton } from "@/components/AccountButton";
import { AppHeader } from "@/components/AppHeader";
import { StoryReader } from "./StoryReader";

export const metadata: Metadata = {
  title: "Baca tulisan",
  description: "Cerita dari komunitas TitikNol.",
};

export default function StoryReadPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav>
        <AccountButton />
      </AppHeader>
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-8">
        <Suspense fallback={null}>
          <StoryReader />
        </Suspense>
      </main>
    </div>
  );
}
