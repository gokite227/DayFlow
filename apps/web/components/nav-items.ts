/** Desktop order (EVT-002). `mobile: "more"` items move behind the mobile More menu. */
export const NAV_ITEMS = [
  { href: "/today", label: "Today", mobile: "tab" },
  { href: "/goals", label: "Goals", mobile: "more" },
  { href: "/calendar", label: "Calendar", mobile: "tab" },
  { href: "/events", label: "Events", mobile: "tab" },
  { href: "/days", label: "Days", mobile: "more" },
  { href: "/review", label: "Review", mobile: "tab" },
  { href: "/settings", label: "Settings", mobile: "more" },
] as const;
