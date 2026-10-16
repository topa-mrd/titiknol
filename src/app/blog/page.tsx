import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountButton } from "@/components/AccountButton";
import { AppHeader } from "@/components/AppHeader";
import { BlogBoard } from "./BlogBoard";

export const metadata: Metadata = {
  title: "Blog",
  description: "Cerita nyata anak muda yang mulai dari titik nol: belajar, gagal, mencoba lagi, sampai berhasil.",
};

export default function BlogPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav>
        <AccountButton />
      </AppHeader>
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-8">
        <Suspense fallback={null}>
          <BlogBoard />
        </Suspense>
      </main>
    </div>
  );
}
