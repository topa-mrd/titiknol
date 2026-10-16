import type { Metadata } from "next";
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
      </main>
    </div>
  );
}
