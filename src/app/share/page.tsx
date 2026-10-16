import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountButton } from "@/components/AccountButton";
import { AppHeader } from "@/components/AppHeader";
import { StoryStudio } from "./StoryStudio";

export const metadata: Metadata = {
  title: "Share your story",
  description: "Ceritakan perjalananmu lewat suara, rapikan bersama AI, lalu terbitkan ke Blog atau Komunitas.",
};

export default function SharePage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav>
        <AccountButton />
      </AppHeader>
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-8">
        <Suspense fallback={null}>
          <StoryStudio />
        </Suspense>
      </main>
    </div>
  );
}
