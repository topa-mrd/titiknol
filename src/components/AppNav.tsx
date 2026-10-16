"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PenIcon } from "./icons";

/** Roadmap & Experience adalah nama tahap (sengaja tetap bahasa Inggris). */
const LINKS = [
  { href: "/roadmap", label: "Roadmap", lang: "en" },
  { href: "/experience", label: "Experience", lang: "en" },
  { href: "/blog", label: "Blog", lang: undefined },
  { href: "/komunitas", label: "Komunitas", lang: undefined },
] as const;

const pill = "inline-flex min-h-10 items-center rounded-full px-3 text-xs font-heading whitespace-nowrap uppercase transition-colors sm:px-4 sm:text-sm sm:tracking-wide";

const isActiveAt = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Pintu masuk tahap Share your story (studio menulis). */
function WriteLink() {
  const pathname = usePathname();
  return (
    <Link
      href="/share"
      aria-current={isActiveAt(pathname, "/share") ? "page" : undefined}
      className={`${pill} gap-1.5 border-2 border-brand/50 text-brand-ink hover:bg-brand-soft aria-[current=page]:bg-brand-soft`}
    >
      <PenIcon className="size-4" strokeWidth={2.25} />
      Tulis cerita
    </Link>
  );
}

export function AppNav({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => isActiveAt(pathname, href);
  return (
    <nav aria-label="Navigasi utama" className={className}>
      <ul className="flex items-center gap-1">
        {LINKS.map(({ href, label, lang }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                lang={lang}
                aria-current={active ? "page" : undefined}
                className={`${pill} ${
                  active ? "bg-sky-soft text-link ring-2 ring-sky/40 ring-inset" : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
        <li className="ml-1">
          <WriteLink />
        </li>
      </ul>
    </nav>
  );
}
