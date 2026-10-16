"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ProblemScreen } from "@/components/ProblemScreen";
import { buttonClass } from "@/components/ui";

/** Batas error untuk semua halaman (layout akar tetap tampil). */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[halaman] galat tak terduga:", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav />
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8">
        <ProblemScreen
          title="Ada yang tidak beres di halaman ini"
          actions={
            <>
              <button type="button" onClick={() => retry()} className={`${buttonClass("primary", "lg")} w-full sm:w-auto`}>
                Coba lagi
              </button>
              <Link href="/" className={`${buttonClass("secondary", "lg")} w-full sm:w-auto`}>
                Ke beranda
              </Link>
            </>
          }
        >
          Halaman gagal ditampilkan. Data yang sudah tersimpan tidak hilang. Coba muat lagi; kalau masih gagal, tunggu
          sebentar atau periksa internetmu.
          {error.digest && <span className="mt-3 block text-sm">Kode galat: {error.digest}</span>}
        </ProblemScreen>
      </main>
    </div>
  );
}
