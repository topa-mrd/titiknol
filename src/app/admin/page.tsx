import type { Metadata } from "next";
import { AccountButton } from "@/components/AccountButton";
import { AppHeader } from "@/components/AppHeader";
import { AdminBoard } from "./AdminBoard";

export const metadata: Metadata = {
  title: "Admin katalog",
  description: "Periksa, revisi, dan setujui sumber belajar yang ditemukan lewat pencarian web.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav>
        <AccountButton />
      </AppHeader>
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-8">
        <AdminBoard />
      </main>
    </div>
  );
}
