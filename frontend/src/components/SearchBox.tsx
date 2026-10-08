"use client";

import { CloseIcon, SearchIcon } from "@/components/icons";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
};

/**
 * Esc is handled globally (components/useShortcuts.ts): inside a dialog it closes the dialog,
 * otherwise it cancels a reply or clears the sidebar search; one action per keypress.
 */
export function SearchBox({ value, onChange, placeholder = "Search", autoFocus, id }: Props) {
  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-fg-tertiary" />
      <input
        id={id}
        name="search"
        type="search"
        autoComplete="off"
        aria-label={placeholder}
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-control w-full rounded-control bg-input pr-8 pl-8 text-body-sm text-fg placeholder:text-fg-tertiary focus:outline-2 focus:outline-accent [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-fg-tertiary hover:text-fg"
        >
          <CloseIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}
