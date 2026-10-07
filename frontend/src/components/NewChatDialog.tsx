"use client";

import { useState } from "react";
import { ContactListItem } from "@/components/ContactListItem";
import { Dialog } from "@/components/Dialog";
import { UserPlusIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";
import { useOpenDirect } from "@/components/useOpenDirect";
import { contactName } from "@/lib/conversations";
import { useAppStore } from "@/store/app";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddContact: () => void;
};

export function NewChatDialog({ open, onOpenChange, onAddContact }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New chat">
      {/* Mounted only while open, so the filter resets each time. */}
      <ContactPicker onDone={() => onOpenChange(false)} onAddContact={onAddContact} />
    </Dialog>
  );
}

function ContactPicker({ onDone, onAddContact }: { onDone: () => void; onAddContact: () => void }) {
  const contacts = useAppStore((s) => s.contacts);
  const [filter, setFilter] = useState("");
  const { open, pending, error } = useOpenDirect();

  const needle = filter.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const shown = needle
    ? contacts.filter(
        (c) =>
          contactName(c).toLowerCase().includes(needle) ||
          c.display_name.toLowerCase().includes(needle) ||
          (digits !== "" && c.phone.includes(digits)),
      )
    : contacts;

  return (
    <div className="flex min-h-0 flex-col pb-3">
      <div className="px-pane-x pb-2">
        <SearchBox value={filter} onChange={setFilter} placeholder="Name or number" autoFocus />
      </div>
      <button
        type="button"
        onClick={onAddContact}
        className="mx-list-inset flex h-contact-item items-center gap-3 rounded-list-item px-row-x text-left text-body font-medium text-fg transition-colors hover:bg-hover"
      >
        <span className="flex size-avatar-contact items-center justify-center rounded-full bg-input text-fg">
          <UserPlusIcon className="size-icon" />
        </span>
        Add contact
      </button>
      {error && <p className="px-pane-x py-2 text-body-sm text-danger">{error}</p>}
      <h3 className="px-pane-x pt-3 pb-1 text-body-sm font-semibold text-fg">Contacts</h3>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <p className="px-pane-x py-4 text-body-sm text-fg-secondary">
            {contacts.length === 0 ? "No contacts yet. Add one to start chatting." : "No matching contacts"}
          </p>
        ) : (
          shown.map((contact) => (
            <ContactListItem
              key={contact.id}
              contact={contact}
              disabled={pending}
              onSelect={async () => {
                if (await open(contact.user_id)) onDone();
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
