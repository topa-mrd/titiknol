import type { Metadata } from "next";
import Link from "next/link";
import { AccountButton } from "@/components/AccountButton";
import { AppHeader } from "@/components/AppHeader";
import { ProblemScreen } from "@/components/ProblemScreen";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = {
  title: "Halaman tidak ditemukan",
};

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav>
        <AccountButton />
      </AppHeader>
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8">
        <ProblemScreen
          code="404"
          title="Halaman ini tidak ditemukan"
          actions={
            <>
              <Link href="/" className={`${buttonClass("primary", "lg")} w-full sm:w-auto`}>
                Ke beranda
              </Link>
              <Link href="/roadmap" className={`${buttonClass("secondary", "lg")} w-full sm:w-auto`}>
                Roadmap-ku
              </Link>
            </>
          }
        >
          Mungkin linknya terpotong atau halamannya sudah dipindah. Roadmap dan tulisanmu tetap aman.
        </ProblemScreen>
      </main>
    </div>
  );
}
