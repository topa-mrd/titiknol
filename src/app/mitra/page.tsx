import type { Metadata } from "next";
import { AccountButton } from "@/components/AccountButton";
import { AppHeader } from "@/components/AppHeader";
import { MitraBoard } from "./MitraBoard";

export const metadata: Metadata = {
  title: "Ruang mitra",
  description: "Buka lowongan magang, proyek, atau kerja dan kelola talenta muda yang diteruskan tim TitikNol.",
};

export default function MitraPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav>
        <AccountButton />
      </AppHeader>
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-8">
        <MitraBoard />
      </main>
    </div>
  );
}
