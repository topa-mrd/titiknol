import Link from "next/link";
import type { ReactNode } from "react";
import { AppNav } from "./AppNav";
import { BottomNav } from "./BottomNav";
import { Logo } from "./Logo";
import { SoundToggle } from "./SoundToggle";

/**
 * Header bersama. Dengan `nav`, navigasi utama tampil:
 * - ≥ 1280 px: satu baris di header;
 * - 768–1279 px: baris kedua di bawah logo (bisa digeser);
 * - < 768 px: bar tab bawah ala aplikasi (BottomNav).
 * `children` untuk aksi di kanan (mis. akun).
 */
export function AppHeader({ children, nav = false }: { children?: ReactNode; nav?: boolean }) {
  return (
    <>
      <header className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-8 sm:py-6">
        <div className="flex min-h-11 items-center justify-between gap-4">
          <Link href="/" aria-label="TitikNol, ke beranda" className="shrink-0 rounded-xl">
            <Logo />
          </Link>
          {nav && <AppNav className="hidden xl:block" />}
          <div className="flex items-center justify-end gap-1.5 xl:min-w-30">
            {children}
            <SoundToggle />
          </div>
        </div>
        {nav && <AppNav className="-mx-4 mt-3 hidden overflow-x-auto px-3 md:block xl:hidden" />}
      </header>
      {nav && <BottomNav />}
    </>
  );
}
