"use client";

import { AddContactDialog } from "@/components/AddContactDialog";
import { ConversationList } from "@/components/ConversationList";
import { ComposeIcon, GroupAddIcon } from "@/components/icons";
import { NewChatDialog } from "@/components/NewChatDialog";
import { NewGroupDialog } from "@/components/NewGroupDialog";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SearchBox } from "@/components/SearchBox";
import { SearchResults } from "@/components/SearchResults";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useSession } from "@/components/session";
import { IconButton } from "@/components/ui";
import { type AppDialog, useAppStore } from "@/store/app";

/** `className` controls visibility/width (the (app) layout makes it full-screen on mobile). */
export function Sidebar({ className = "" }: { className?: string }) {
  const { me, logout } = useSession();
  // In the store so keyboard shortcuts can open dialogs and Esc can clear the search.
  const query = useAppStore((s) => s.searchQuery);
  const setQuery = useAppStore((s) => s.setSearchQuery);
  const dialog = useAppStore((s) => s.dialog);
  const openDialog = useAppStore((s) => s.openDialog);
  const closeDialog = useAppStore((s) => s.closeDialog);
  const dialogProps = (name: AppDialog) => ({
    open: dialog === name,
    onOpenChange: (open: boolean) => (open ? openDialog(name) : closeDialog()),
  });

  return (
    <aside className={`shrink-0 flex-col border-border bg-sidebar md:border-r ${className}`}>
      <header className="flex h-header shrink-0 items-center gap-3 px-pane-x">
        <ProfileMenu me={me} onLogout={logout} onOpenSettings={() => openDialog("settings")} />
        <h1 className="flex-1 text-header font-semibold text-fg">Chats</h1>
        <IconButton label="New group" onClick={() => openDialog("newGroup")}>
          <GroupAddIcon className="size-icon" />
        </IconButton>
        <IconButton label="New chat" onClick={() => openDialog("newChat")}>
          <ComposeIcon className="size-icon" />
        </IconButton>
      </header>
      <div className="shrink-0 px-pane-x pb-2">
        <SearchBox id="sidebar-search" value={query} onChange={setQuery} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.trim() ? (
          <SearchResults query={query} meId={me.id} onOpened={() => setQuery("")} />
        ) : (
          <ConversationList meId={me.id} onNewChat={() => openDialog("newChat")} />
        )}
      </div>

      <NewChatDialog {...dialogProps("newChat")} onAddContact={() => openDialog("addContact")} />
      <AddContactDialog {...dialogProps("addContact")} />
      <NewGroupDialog {...dialogProps("newGroup")} />
      <SettingsDialog {...dialogProps("settings")} />
    </aside>
  );
}
