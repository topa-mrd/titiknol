"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loginHref } from "@/lib/safe-next";
import { getUser, isAdmin, onAuthChange, signOut, type AppUser } from "@/lib/store";
import { buttonClass } from "./ui";

/** Status akun di header: tombol Masuk, atau nama + Keluar. */
export function AccountButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AppUser | null | undefined>(undefined);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    getUser()
      .then((u) => active && setUser(u))
      .catch(() => active && setUser(null));
    const stop = onAuthChange((u) => setUser(u));
    return () => {
      active = false;
      stop();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!user) return;
    void isAdmin().then((ok) => active && setAdmin(ok));
    return () => {
      active = false;
    };
  }, [user]);

  if (user === undefined) return <span aria-hidden="true" className="h-11 w-20" />;
  if (!user) {
    return (
      <Link href={loginHref(pathname)} className={buttonClass("secondary")}>
        Masuk
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {admin && (
        <Link href="/admin" className={buttonClass("ghost")}>
          Admin
        </Link>
      )}
      <span className="hidden max-w-40 truncate text-sm font-medium text-ink-muted sm:inline" title={user.email ?? undefined}>
        {user.name}
      </span>
      <button
        type="button"
        onClick={async () => {
          await signOut();
          router.push("/");
        }}
        className={buttonClass("ghost")}
      >
        Keluar
      </button>
    </div>
  );
}
