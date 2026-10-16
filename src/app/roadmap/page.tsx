import type { Metadata } from "next";
import { AccountButton } from "@/components/AccountButton";
import { AppHeader } from "@/components/AppHeader";
import { RoadmapList } from "./RoadmapList";

export const metadata: Metadata = {
  title: "Roadmap saya",
  description: "Semua roadmap yang kamu simpan beserta progresnya.",
};

export default function RoadmapListPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav>
        <AccountButton />
      </AppHeader>
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-8">
        <RoadmapList />
      </main>
    </div>
  );
}
