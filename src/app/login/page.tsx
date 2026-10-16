import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Masuk",
  description: "Masuk atau daftar untuk menyimpan roadmap dan progresmu.",
};

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav />
      <main id="main" className="flex-1 px-4 pt-4 pb-16 sm:px-8 sm:pt-10">
        <Suspense fallback={<div aria-hidden="true" className="mx-auto h-96 w-full max-w-md animate-pulse rounded-card bg-line" />}>
          <LoginForm />
        </Suspense>
        <p className="mx-auto mt-6 max-w-md text-center text-sm leading-relaxed text-ink-muted">
          Dengan masuk, kamu menyetujui{" "}
          <Link href="/syarat" className="font-emphasis text-link underline decoration-link/40 underline-offset-4">
            Syarat Layanan
          </Link>{" "}
          dan{" "}
          <Link href="/privasi" className="font-emphasis text-link underline decoration-link/40 underline-offset-4">
            Kebijakan Privasi
          </Link>{" "}
          TitikNol.
        </p>
      </main>
    </div>
  );
}
