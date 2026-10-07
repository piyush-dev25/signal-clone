import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Stroke({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const ComposeIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
    <path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
  </Stroke>
);

export const SearchIcon = (props: IconProps) => (
  <Stroke {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Stroke>
);

export const CloseIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Stroke>
);

export const UserPlusIcon = (props: IconProps) => (
  <Stroke {...props}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 19.5c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5" />
    <path d="M19 8v6M16 11h6" />
  </Stroke>
);

export const LogoutIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 8l-4 4 4 4M6 12h10" />
  </Stroke>
);

export const ChatIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 3.5c4.7 0 8.5 3.4 8.5 7.6s-3.8 7.6-8.5 7.6c-1 0-2-.2-2.9-.5L4.5 20l1.2-3.6C4.3 15 3.5 13.1 3.5 11.1c0-4.2 3.8-7.6 8.5-7.6Z" />
  </Stroke>
);

/** Filled glyphs used inside avatars. */
export const PersonGlyph = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
  </svg>
);

export const GroupGlyph = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <circle cx="9" cy="8.5" r="3.5" />
    <circle cx="16.5" cy="9.5" r="2.75" />
    <path d="M2.5 19c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6z" />
    <path d="M15.2 13.2c.4-.1.9-.2 1.3-.2 2.9 0 5 2 5 5h-4.8c-.1-1.9-.6-3.5-1.5-4.8z" />
  </svg>
);
