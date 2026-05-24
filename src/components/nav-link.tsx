"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({
  href,
  title,
  children
}: {
  href: string;
  title: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link className={active ? "active" : undefined} href={href} title={title} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
