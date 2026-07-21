"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Inbox, SquarePen } from "lucide-react";

const TABS = [
  { href: "/", label: "Capture", Icon: SquarePen },
  { href: "/inbox", label: "Inbox", Icon: Inbox },
  { href: "/today", label: "Today", Icon: CheckCircle2 },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-surface-border bg-background pb-[env(safe-area-inset-bottom)]">
      <ul className="flex">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-[64px] flex-col items-center justify-center gap-1 py-2 text-sm font-medium ${
                  isActive ? "text-accent-light" : "text-[#8B8B95]"
                }`}
              >
                <tab.Icon size={22} strokeWidth={2} aria-hidden="true" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
