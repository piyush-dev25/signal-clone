"use client";

import { useState } from "react";
import { AddContactDialog } from "@/components/AddContactDialog";
import { ConversationList } from "@/components/ConversationList";
import { ComposeIcon, GroupAddIcon } from "@/components/icons";
import { NewChatDialog } from "@/components/NewChatDialog";
import { NewGroupDialog } from "@/components/NewGroupDialog";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SearchBox } from "@/components/SearchBox";
import { SearchResults } from "@/components/SearchResults";
import { useSession } from "@/components/session";
import { IconButton } from "@/components/ui";

/** `className` controls visibility/width (the (app) layout makes it full-screen on mobile). */
export function Sidebar({ className = "" }: { className?: string }) {
  const { me, logout } = useSession();
  const [query, setQuery] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  return (
    <aside className={`shrink-0 flex-col border-border bg-sidebar md:border-r ${className}`}>
      <header className="flex h-header shrink-0 items-center gap-3 px-pane-x">
        <ProfileMenu me={me} onLogout={logout} />
        <h1 className="flex-1 text-header font-semibold text-fg">Chats</h1>
        <IconButton label="New group" onClick={() => setNewGroupOpen(true)}>
          <GroupAddIcon className="size-icon" />
        </IconButton>
        <IconButton label="New chat" onClick={() => setNewChatOpen(true)}>
          <ComposeIcon className="size-icon" />
        </IconButton>
      </header>
      <div className="shrink-0 px-pane-x pb-2">
        <SearchBox value={query} onChange={setQuery} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.trim() ? (
          <SearchResults query={query} meId={me.id} onOpened={() => setQuery("")} />
        ) : (
          <ConversationList meId={me.id} onNewChat={() => setNewChatOpen(true)} />
        )}
      </div>

      <NewChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        onAddContact={() => {
          setNewChatOpen(false);
          setAddContactOpen(true);
        }}
      />
      <AddContactDialog open={addContactOpen} onOpenChange={setAddContactOpen} />
      <NewGroupDialog open={newGroupOpen} onOpenChange={setNewGroupOpen} />
    </aside>
  );
}
