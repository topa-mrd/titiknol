"use client";

import "@fontsource-variable/nunito";
import "./globals.css";
import { useEffect } from "react";
import { ProblemScreen } from "@/components/ProblemScreen";
import { buttonClass } from "@/components/ui";

/** Cadangan terakhir bila layout akar sendiri gagal: dokumen sendiri, tetap bahasa Indonesia. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[aplikasi] galat tak terduga:", error);
  }, [error]);

  return (
    <html lang="id" className="h-full">
      <body className="flex min-h-full flex-col">
        <title>Terjadi galat · TitikNol</title>
        <main id="main" className="flex-1 px-4 pt-10 pb-16 sm:px-8">
          <ProblemScreen
            title="TitikNol sedang bermasalah"
            actions={
              <>
                <button type="button" onClick={() => retry()} className={`${buttonClass("primary", "lg")} w-full sm:w-auto`}>
                  Coba lagi
                </button>
                {/* Tautan biasa (bukan next/link): router mungkin ikut rusak. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/" className={`${buttonClass("secondary", "lg")} w-full sm:w-auto`}>
                  Ke beranda
                </a>
              </>
            }
          >
            Aplikasi gagal dimuat. Data yang sudah tersimpan tidak hilang. Muat ulang halaman; kalau masih gagal, tunggu
            beberapa menit lalu coba lagi.
          </ProblemScreen>
        </main>
      </body>
    </html>
  );
}
