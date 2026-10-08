"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { CloseIcon } from "@/components/icons";
import { IconButton } from "@/components/ui";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  /** Below md the dialog fills the screen (e.g. group info). */
  fullScreenOnMobile?: boolean;
};

const CENTERED =
  "top-1/2 left-1/2 max-h-[85dvh] w-dialog max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-dialog";
// Written out in full (not derived from CENTERED) so Tailwind can see every class.
const FULL_ON_MOBILE =
  "inset-0 h-dvh w-full md:inset-auto md:top-1/2 md:left-1/2 md:h-auto md:max-h-[85dvh] md:w-dialog md:max-w-[calc(100vw-32px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-dialog";

/** Signal-style modal: dimmed overlay, centered card, title row with a close button. */
export function Dialog({ open, onOpenChange, title, children, fullScreenOnMobile = false }: Props) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={`fixed z-50 flex flex-col bg-dialog text-fg shadow-dialog focus:outline-none ${
            fullScreenOnMobile ? FULL_ON_MOBILE : CENTERED
          }`}
        >
          <div className="flex items-center gap-2 px-pane-x pt-4 pb-2">
            <RadixDialog.Title className="flex-1 text-header font-semibold">{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton label="Close">
                <CloseIcon className="size-icon" />
              </IconButton>
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
