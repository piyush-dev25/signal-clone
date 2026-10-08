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

export const ArrowLeftIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Stroke>
);

export const SendIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12l-11.7 1.9z" />
  </svg>
);

/* Message status, Signal-style: dashed circle (sending), one check-circle (sent), two (delivered),
   two filled (read). Read draws its checks in the outgoing-bubble color so they show on the fill. */
export const SendingIcon = (props: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden {...props}>
    <circle cx="8" cy="8" r="6" strokeDasharray="2.2 1.6" />
  </svg>
);

export const SentIcon = (props: IconProps) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden {...props}>
    <circle cx="8" cy="8" r="6" />
    <path d="m5.4 8.2 1.8 1.8 3.5-3.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const DeliveredIcon = (props: IconProps) => (
  <svg viewBox="0 0 22 16" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden {...props}>
    <path d="M14 2a6 6 0 1 1 0 12" />
    <circle cx="8" cy="8" r="6" />
    <path d="m5.4 8.2 1.8 1.8 3.5-3.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ReadIcon = (props: IconProps) => (
  <svg viewBox="0 0 22 16" aria-hidden {...props}>
    <circle cx="14" cy="8" r="6.5" fill="currentColor" />
    <circle cx="8" cy="8" r="6.5" fill="currentColor" stroke="var(--color-bubble-out)" strokeWidth={1.2} />
    <path
      d="m5.4 8.2 1.8 1.8 3.5-3.6"
      fill="none"
      stroke="var(--color-bubble-out)"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const AlertIcon = (props: IconProps) => (
  <svg viewBox="0 0 16 16" aria-hidden {...props}>
    <circle cx="8" cy="8" r="7" fill="currentColor" />
    <path d="M8 4.5v4.2" stroke="var(--color-on-accent)" strokeWidth={1.6} strokeLinecap="round" />
    <circle cx="8" cy="11.3" r="0.95" fill="var(--color-on-accent)" />
  </svg>
);

export const GroupAddIcon = (props: IconProps) => (
  <Stroke {...props}>
    <circle cx="9" cy="8" r="3.25" />
    <path d="M2.75 19c.6-3.1 3.1-5 6.25-5s5.65 1.9 6.25 5" />
    <path d="M15.5 5.2a3.25 3.25 0 0 1 0 5.6M19 8v6M16 11h6" />
  </Stroke>
);

export const PencilIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
  </Stroke>
);

export const CheckIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Stroke>
);

export const MoreIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <circle cx="12" cy="5.5" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="12" cy="18.5" r="1.6" />
  </svg>
);

export const ReplyIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M9.5 6 4 11.5 9.5 17" />
    <path d="M4.5 11.5H14a6 6 0 0 1 6 6V19" />
  </Stroke>
);

export const CopyIcon = (props: IconProps) => (
  <Stroke {...props}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </Stroke>
);

export const PhoneIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M5.2 3.8h3l1.5 4-2 1.3a11 11 0 0 0 5.2 5.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.2 6a2 2 0 0 1 2-2.2Z" />
  </Stroke>
);

export const VideoIcon = (props: IconProps) => (
  <Stroke {...props}>
    <rect x="3" y="6.5" width="12.5" height="11" rx="2.5" />
    <path d="m15.5 10.5 5-3v9l-5-3" />
  </Stroke>
);

export const SettingsIcon = (props: IconProps) => (
  <Stroke {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
  </Stroke>
);

export const StoriesIcon = (props: IconProps) => (
  <Stroke {...props}>
    <circle cx="12" cy="12" r="8.5" strokeDasharray="4 2.2" />
    <circle cx="12" cy="12" r="4" />
  </Stroke>
);

export const DevicesIcon = (props: IconProps) => (
  <Stroke {...props}>
    <rect x="2.8" y="5" width="13" height="10" rx="1.5" />
    <path d="M6 19h6.5" />
    <rect x="16.5" y="9" width="4.8" height="10" rx="1.2" />
  </Stroke>
);
