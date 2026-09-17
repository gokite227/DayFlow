"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { IosInstallHint } from "@/features/settings/ios-install-hint";
import { useNewVersionAvailable } from "@/lib/pwa/use-new-version";
import { NAV_ITEMS } from "./nav-items";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const newVersion = useNewVersionAvailable();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Six sections do not fit a phone tab bar; the less frequent ones live behind "More".
  const mobileTabs = NAV_ITEMS.filter((item) => item.mobile === "tab");
  const moreItems = NAV_ITEMS.filter((item) => item.mobile === "more");
  const moreActive = moreItems.some((item) => isActive(item.href));

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          Day<span>Flow</span>
        </div>
        <nav className="nav" aria-label="주요 메뉴">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(item.href) ? "active" : undefined}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="side-note">
          MVP
          <br />
          Goal → Day → Focus → Review → Recovery → Next Plan
        </div>
      </aside>

      <main className="main">
        {newVersion && (
          <div className="update-banner" role="status">
            <span>새 버전이 있어요.</span>
            <button type="button" className="btn small" onClick={() => window.location.reload()}>
              새로고침
            </button>
          </div>
        )}
        {pathname === "/today" && <IosInstallHint />}
        {children}
      </main>

      <nav className="mobile-nav" aria-label="주요 메뉴">
        {mobileTabs.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(item.href) ? "active" : undefined}
            aria-current={isActive(item.href) ? "page" : undefined}
            onClick={() => setMoreOpen(false)}
          >
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          className={`mobile-more-btn${moreActive ? " active" : ""}`}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          onClick={() => setMoreOpen((open) => !open)}
        >
          More
        </button>
        {moreOpen && (
          <div id="mobile-more-menu" className="mobile-more-menu">
            {moreItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(item.href) ? "active" : undefined}
                aria-current={isActive(item.href) ? "page" : undefined}
                onClick={() => setMoreOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </nav>
    </div>
  );
}
