// Line icons for the navigation (24×24, drawn with currentColor).
const PATHS = {
  overwatch: (
    <>
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  intel: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12 18 6" />
      <path d="M12 7.5a4.5 4.5 0 1 0 4.5 4.5" />
    </>
  ),
  planning: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2.8h6V4" />
      <path d="m8.5 11 2 2 4-4" />
      <path d="M8.5 17h7" />
    </>
  ),
  live: (
    <>
      <path d="M12 2.5c.5 3-2 4.5-2 7.5a2 2 0 0 0 4 0c0-.8-.3-1.4-.6-2 2.4 1.2 4.6 3.6 4.6 6.6a6 6 0 0 1-12 0c0-5 4.5-7 6-12.1Z" />
    </>
  ),
  state: (
    <>
      <path d="M4 21V9l3 2V7l5-4 5 4v4l3-2v12Z" />
      <path d="M10 21v-4a2 2 0 0 1 4 0v4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9s-1.2 6.5-3.5 9c-2.3-2.5-3.5-5.5-3.5-9S9.7 5.5 12 3Z" />
    </>
  ),
};

export type NavIconName = keyof typeof PATHS;

export function NavIcon({ name, size = 20 }: { name: NavIconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="nav-icon"
    >
      {PATHS[name]}
    </svg>
  );
}
