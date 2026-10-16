import type { Metadata } from "next";
import { AccountButton } from "@/components/AccountButton";
import { AppHeader } from "@/components/AppHeader";
import { ExperienceBoard } from "./ExperienceBoard";

export const metadata: Metadata = {
  title: "Experience",
  description: "Lowongan magang, proyek, dan kerja dari mitra yang sudah dicek, dengan filter daerah dan posisi.",
};

export default function ExperiencePage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav>
        <AccountButton />
      </AppHeader>
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-8">
        <ExperienceBoard />
      </main>
    </div>
  );
}
