import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { StartFlow } from "./StartFlow";

export const metadata: Metadata = {
  title: "Tell me your dream",
  description: "Jawab dua pertanyaan tentang mimpi dan kondisimu, lewat suara atau ketikan.",
};

export default function StartPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-8">
        <StartFlow />
      </main>
    </div>
  );
}
