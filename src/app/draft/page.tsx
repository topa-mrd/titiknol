import type { Metadata } from "next";
import { AccountButton } from "@/components/AccountButton";
import { AppHeader } from "@/components/AppHeader";
import { DraftPageClient } from "./DraftPageClient";

export const metadata: Metadata = {
  title: "Drafting",
  description: "Profil dan tiga pilihan rencana yang disusun dari ceritamu.",
};

export default function DraftPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav>
        <AccountButton />
      </AppHeader>
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-8">
        <DraftPageClient />
      </main>
    </div>
  );
}
