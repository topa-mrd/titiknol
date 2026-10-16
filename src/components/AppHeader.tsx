import Link from "next/link";
import type { ReactNode } from "react";
import { AppNav, WriteLink } from "./AppNav";
import { Logo } from "./Logo";

/**
 * Header bersama. `nav` menampilkan navigasi tahap (di layar kecil pindah ke
 * baris kedua yang bisa digeser); `children` untuk aksi di kanan (mis. akun).
 */
export function AppHeader({ children, nav = false }: { children?: ReactNode; nav?: boolean }) {
  return (
    <header className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-8 sm:py-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" aria-label="TitikNol, ke beranda" className="shrink-0 rounded-xl">
          <Logo />
        </Link>
        {nav && <AppNav className="hidden md:block" />}
        {nav ? (
          <div className="flex items-center justify-end gap-2 md:min-w-30">
            <WriteLink short className="md:hidden" />
            {children}
          </div>
        ) : (
          children
        )}
      </div>
      {nav && <AppNav withWrite={false} className="-mx-4 mt-3 overflow-x-auto px-3 md:hidden" />}
    </header>
  );
}
