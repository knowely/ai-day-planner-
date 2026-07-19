"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Capture", icon: "✏️" },
  { href: "/inbox", label: "Inbox", icon: "📥" },
  { href: "/today", label: "Today", icon: "✅" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-black/10 bg-white pb-[env(safe-area-inset-bottom)] dark:border-white/10 dark:bg-black">
      <ul className="flex">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-[64px] flex-col items-center justify-center gap-1 py-2 text-sm font-medium ${
                  isActive
                    ? "text-black dark:text-white"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                <span className="text-2xl" aria-hidden="true">
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
