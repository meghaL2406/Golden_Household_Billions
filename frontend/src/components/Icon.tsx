import type { SVGProps } from "react";

export type IconName =
  | "users"
  | "user-plus"
  | "file"
  | "file-check"
  | "shield"
  | "search"
  | "bell"
  | "settings"
  | "globe"
  | "map"
  | "chart"
  | "check"
  | "x"
  | "alert"
  | "clock"
  | "arrow-right"
  | "upload"
  | "home"
  | "heart"
  | "gift"
  | "layers"
  | "log-out"
  | "menu"
  | "plus"
  | "minus"
  | "edit"
  | "trash"
  | "eye"
  | "filter"
  | "download"
  | "refresh"
  | "sparkle"
  | "info"
  | "phone"
  | "mail"
  | "id"
  | "baby"
  | "ring"
  | "cross"
  | "split"
  | "merge"
  | "pin"
  | "message"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "arrow-left"
  | "user";

/* Hand-drawn paths, 24 viewBox, stroke currentColor 1.6, round caps/joins. */
const PATHS: Record<IconName, JSX.Element> = {
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3.5 19.5c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5" />
      <path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.9" />
      <path d="M17 14.4c2.2.5 3.6 2.3 3.6 4.9" />
    </>
  ),
  "user-plus": (
    <>
      <circle cx="10" cy="8" r="3.4" />
      <path d="M4 19.5c0-3.2 2.6-5.5 6-5.5 1.3 0 2.5.3 3.5.9" />
      <path d="M18.5 13.5v6M15.5 16.5h6" />
    </>
  ),
  file: (
    <>
      <path d="M7 3.5h6.5l4 4V20a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" />
      <path d="M13.5 3.5v4h4" />
      <path d="M9.5 12h5M9.5 15.5h5" />
    </>
  ),
  "file-check": (
    <>
      <path d="M7 3.5h6.5l4 4V20a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" />
      <path d="M13.5 3.5v4h4" />
      <path d="M9.3 14.3l2 2 3.6-3.8" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5l7 2.6v5.3c0 4.3-2.9 7.6-7 9.1-4.1-1.5-7-4.8-7-9.1V6.1l7-2.6Z" />
      <path d="M9.2 12.1l2 2 3.8-4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6" />
      <path d="M15.3 15.3l4.7 4.7" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5S14.6 18.1 12 20.5M12 3.5C9.4 5.9 8.1 8.7 8.1 12s1.3 6.1 3.9 8.5" />
    </>
  ),
  map: (
    <>
      <path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2v-13Z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20h16" />
      <path d="M7 16.5v-5M12 16.5V7.5M17 16.5v-8" />
    </>
  ),
  check: <path d="M5.5 12.5l4.2 4.2L18.5 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  alert: (
    <>
      <path d="M12 4.2 20.5 19H3.5L12 4.2Z" />
      <path d="M12 9.5v4.5M12 16.6v.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  "arrow-right": <path d="M4.5 12h15M13.5 6l6 6-6 6" />,
  "arrow-left": <path d="M19.5 12h-15M10.5 6l-6 6 6 6" />,
  upload: (
    <>
      <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5" />
      <path d="M4.5 16.5v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </>
  ),
  download: (
    <>
      <path d="M12 4.5V15M7.5 11 12 15.5 16.5 11" />
      <path d="M4.5 16.5v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.8V20h4.5v-5h3v5H18V9.8" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />,
  gift: (
    <>
      <path d="M4 10h16v3H4zM5.5 13v7h13v-7M12 10v10" />
      <path d="M12 10c-1.2-2.8-3-4.3-4.3-3.7-1.4.6-.8 2.6 4.3 3.7ZM12 10c1.2-2.8 3-4.3 4.3-3.7 1.4.6.8 2.6-4.3 3.7Z" />
    </>
  ),
  layers: (
    <>
      <path d="m12 4 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4M4 16l8 4 8-4" />
    </>
  ),
  "log-out": (
    <>
      <path d="M10 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h4" />
      <path d="M14.5 8 18.5 12l-4 4M18.5 12H9.5" />
    </>
  ),
  menu: <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  edit: (
    <>
      <path d="M4.5 19.5h4l10-10a1.4 1.4 0 0 0 0-2l-2-2a1.4 1.4 0 0 0-2 0l-10 10v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14M9.5 7V4.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8V7" />
      <path d="M6.5 7l.8 12.2a1 1 0 0 0 1 .8h7.4a1 1 0 0 0 1-.8L17.5 7M10 11v5.5M14 11v5.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  filter: <path d="M4 5.5h16l-6.2 7.3v5.2l-3.6 1.5v-6.7L4 5.5Z" />,
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1" />
      <path d="M17.5 3.5v3.6h-3.6M6.5 20.5v-3.6h3.6" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 4c.5 3.5 2.5 5.5 6 6-3.5.5-5.5 2.5-6 6-.5-3.5-2.5-5.5-6-6 3.5-.5 5.5-2.5 6-6Z" />
      <path d="M18.5 16.5c.2 1.3.9 2 2.2 2.2-1.3.2-2 .9-2.2 2.2-.2-1.3-.9-2-2.2-2.2 1.3-.2 2-.9 2.2-2.2Z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.6v.4" />
    </>
  ),
  phone: <path d="M6.2 3.8h3l1.6 4-2 1.4a10.5 10.5 0 0 0 5 5l1.4-2 4 1.6v3a1.8 1.8 0 0 1-2 1.8A15 15 0 0 1 4.4 5.8a1.8 1.8 0 0 1 1.8-2Z" />,
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4.5 7 7.5 6 7.5-6" />
    </>
  ),
  id: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6.2 15.5c.6-1.2 1.6-1.8 2.8-1.8s2.2.6 2.8 1.8M14.5 10h3.5M14.5 13.5h3.5" />
    </>
  ),
  baby: (
    <>
      <circle cx="12" cy="13" r="6.5" />
      <path d="M9.6 12.3v.3M14.4 12.3v.3M10 15.4c1.2.9 2.8.9 4 0M12 6.5c0-1.6.8-2.6 2.2-2.8" />
    </>
  ),
  ring: (
    <>
      <circle cx="12" cy="14" r="5.5" />
      <path d="m9.5 7 2.5-3 2.5 3-2.5 1.5L9.5 7Z" />
    </>
  ),
  cross: <path d="M12 4.5v15M7.5 8.5h9" />,
  split: (
    <>
      <path d="M12 20v-7" />
      <path d="M12 13 6.5 7.5M12 13l5.5-5.5" />
      <path d="M6.5 11V7.5H10M17.5 11V7.5H14" />
    </>
  ),
  merge: (
    <>
      <path d="M12 4v7" />
      <path d="M12 11l-5.5 5.5M12 11l5.5 5.5" />
      <path d="M6.5 13v3.5H10M17.5 13v3.5H14" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11Z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  message: <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z" />,
  "chevron-down": <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  "chevron-left": <path d="M14.5 6.5 9 12l5.5 5.5" />,
  "chevron-right": <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
};

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName | string;
  size?: number;
};

export function Icon({ name, size = 16, ...rest }: IconProps): JSX.Element {
  const body = (PATHS as Record<string, JSX.Element>)[name] ?? <circle cx="12" cy="12" r="7.5" />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {body}
    </svg>
  );
}

export default Icon;
