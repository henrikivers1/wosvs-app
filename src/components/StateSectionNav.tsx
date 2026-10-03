"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import { useStates } from "@/components/StateProvider";

export const STATE_SECTION_PATHS = [
  "/state/manage",
  "/state/alliances",
  "/state/announcements",
  "/state/tags",
  "/state/stats",
];

// Sub-navigation shown on every State page so moving between them never
// needs a detour through State management.
export function StateSectionNav() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const { activeMembership } = useStates();
  if (
    !activeMembership ||
    !STATE_SECTION_PATHS.some((path) => pathname.startsWith(path))
  ) {
    return null;
  }

  const isAdmin =
    activeMembership.role === "owner" || activeMembership.role === "admin";
  const links = [
    { href: "/state/manage", label: t("Members & setup"), admin: true },
    { href: "/state/alliances", label: t("Alliances"), admin: false },
    { href: "/state/announcements", label: t("Send notices"), admin: false },
    { href: "/state/tags", label: t("Manage tags"), admin: true },
    { href: "/state/stats", label: t("Stats & history"), admin: false },
  ].filter((link) => isAdmin || !link.admin);

  return (
    <nav className="state-section-nav" aria-label={t("State administration")}>
      {links.map((link) => (
        <Link
          key={link.href}
          className={
            pathname.startsWith(link.href)
              ? "nav-link active-nav-link"
              : "nav-link"
          }
          href={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
