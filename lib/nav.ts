export type NavItem = { href: string; label: string; icon: string; group: string };

/** Production sidebar. `href` is relative to /p/[id]. */
export const PRODUCTION_NAV: NavItem[] = [
  { href: "/live", label: "Rehearsal Mode", icon: "●", group: "Today" },
  { href: "", label: "Overview", icon: "◎", group: "Production" },
  { href: "/company", label: "Company & Cast", icon: "☺", group: "Production" },
  { href: "/tasks", label: "Tasks", icon: "✓", group: "Production" },
  { href: "/calendar", label: "Calendar", icon: "▦", group: "Schedule" },
  { href: "/availability", label: "Availability", icon: "◐", group: "Schedule" },
  { href: "/reports", label: "Reports", icon: "✎", group: "Reports" },
  { href: "/script", label: "Script & Blocking", icon: "¶", group: "Prompt Book" },
  { href: "/cues", label: "Cue Sheet", icon: "◆", group: "Prompt Book" },
  { href: "/breakdown", label: "Scene Breakdown", icon: "▤", group: "Prompt Book" },
  { href: "/props", label: "Props Tracker", icon: "☐", group: "Prompt Book" },
  { href: "/line-notes", label: "Line Notes", icon: "“", group: "Prompt Book" },
  { href: "/import", label: "Import files", icon: "⇪", group: "Admin" },
  { href: "/settings", label: "Settings", icon: "⚙", group: "Admin" },
];

/** Phone bottom bar: the pages used most inside the rehearsal room. */
export const MOBILE_TABS: { href: string; label: string; icon: string }[] = [
  { href: "/live", label: "Live", icon: "●" },
  { href: "/script", label: "Script", icon: "¶" },
  { href: "/props", label: "Props", icon: "☐" },
  { href: "/calendar", label: "Calendar", icon: "▦" },
  { href: "/reports", label: "Reports", icon: "✎" },
];
