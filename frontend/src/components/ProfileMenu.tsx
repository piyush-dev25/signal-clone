"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Avatar } from "@/components/Avatar";
import { LogoutIcon } from "@/components/icons";
import type { User } from "@/lib/api";
import { formatPhone } from "@/lib/phone";

export function ProfileMenu({ me, onLogout }: { me: User; onLogout: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Profile and settings"
        className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Avatar colorId={me.id} name={me.display_name} avatar={me.avatar} size="profile" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-menu rounded-menu bg-menu p-1 text-fg shadow-menu"
        >
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar colorId={me.id} name={me.display_name} avatar={me.avatar} size="header" />
            <div className="min-w-0">
              <p className="truncate text-body font-semibold">{me.display_name}</p>
              <p className="truncate text-caption text-fg-secondary">{formatPhone(me.phone)}</p>
            </div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={onLogout}
            className="flex cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-body outline-none data-highlighted:bg-hover"
          >
            <LogoutIcon className="size-4 text-fg-secondary" />
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
