"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { DevicesIcon, LogoutIcon, SettingsIcon, StoriesIcon } from "@/components/icons";
import type { User } from "@/lib/api";
import { formatPhone } from "@/lib/phone";
import { isMac } from "@/lib/shortcuts";
import { toast } from "@/store/toasts";

type Props = { me: User; onLogout: () => void; onOpenSettings: () => void };

function Item({ icon, children, hint, onSelect }: { icon: ReactNode; children: ReactNode; hint?: string; onSelect: () => void }) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-body outline-none data-highlighted:bg-hover"
    >
      <span className="text-fg-secondary">{icon}</span>
      <span className="flex-1">{children}</span>
      {hint && <kbd className="font-sans text-caption text-fg-tertiary">{hint}</kbd>}
    </DropdownMenu.Item>
  );
}

export function ProfileMenu({ me, onLogout, onOpenSettings }: Props) {
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
          <Item icon={<SettingsIcon className="size-4" />} hint={isMac() ? "⌥," : "Alt+,"} onSelect={onOpenSettings}>
            Settings
          </Item>
          <Item icon={<StoriesIcon className="size-4" />} onSelect={() => toast("Stories are coming soon")}>
            Stories
          </Item>
          <Item icon={<DevicesIcon className="size-4" />} onSelect={() => toast("Linked devices are coming soon")}>
            Linked devices
          </Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <Item icon={<LogoutIcon className="size-4" />} onSelect={onLogout}>
            Log out
          </Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
