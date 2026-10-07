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
};

/** Signal-style modal: dimmed overlay, centered card, title row with a close button. */
export function Dialog({ open, onOpenChange, title, children }: Props) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-dialog max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-dialog bg-dialog text-fg shadow-dialog focus:outline-none"
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
