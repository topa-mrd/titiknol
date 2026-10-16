import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountButton } from "@/components/AccountButton";
import { AppHeader } from "@/components/AppHeader";
import { CommunityBoard } from "./CommunityBoard";

export const metadata: Metadata = {
  title: "Komunitas",
  description: "Cari mentor dan komunitas belajar. Kontaknya dibagikan langsung oleh mereka.",
};

export default function KomunitasPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav>
        <AccountButton />
      </AppHeader>
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-8">
        <Suspense fallback={null}>
          <CommunityBoard />
        </Suspense>
      </main>
    </div>
  );
}
