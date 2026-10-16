"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { BookIcon, BriefcaseIcon, PathIcon, PenIcon, UsersIcon } from "./icons";

type Tab = { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; lang?: string };

/** Urutan mengikuti perjalanan: Roadmap → Experience → Share your story (Tulis), lalu bacaan & komunitas. */
const TABS: Tab[] = [
  { href: "/roadmap", label: "Roadmap", icon: PathIcon, lang: "en" },
  { href: "/experience", label: "Experience", icon: BriefcaseIcon, lang: "en" },
  { href: "/share", label: "Tulis", icon: PenIcon },
  { href: "/blog", label: "Blog", icon: BookIcon },
  { href: "/komunitas", label: "Komunitas", icon: UsersIcon },
];

/** Halaman alur yang butuh layar penuh dan punya bar aksinya sendiri di bawah. */
const HIDDEN_ON = ["/draft"];

/**
 * Bar tab bawah ala aplikasi (layar < 768 px): navigasi utama dalam jangkauan jempol.
 * `data-tabbar` dipakai CSS untuk memberi ruang di bawah halaman dan menaikkan toast.
 */
export function BottomNav() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <nav
      aria-label="Navigasi utama"
      data-tabbar=""
      className="fixed inset-x-0 bottom-0 z-30 transform-gpu border-t-2 border-line bg-canvas pb-[env(safe-area-inset-bottom)] [contain:layout_paint] md:hidden"
    >
      <ul className="mx-auto grid h-17 max-w-md grid-cols-5 px-1.5">
        {TABS.map(({ href, label, icon: Icon, lang }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`) || (href === "/blog" && pathname.startsWith("/blog"));
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                lang={lang}
                aria-current={active ? "page" : undefined}
                className="group flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-xs leading-none font-heading"
              >
                <span
                  className={`grid h-8 w-12 place-items-center rounded-xl border-2 transition-colors duration-150 ${
                    active
                      ? "border-sky/50 bg-sky-soft text-link"
                      : "border-transparent text-ink-muted group-hover:bg-surface-muted group-hover:text-ink"
                  }`}
                >
                  <Icon className="size-5.5" strokeWidth={2.1} />
                </span>
                <span className={active ? "text-link" : "text-ink-muted"}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
