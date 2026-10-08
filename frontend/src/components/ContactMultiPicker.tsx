"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { SearchBox } from "@/components/SearchBox";
import type { Contact } from "@/lib/api";
import { contactName } from "@/lib/conversations";
import { formatPhone } from "@/lib/phone";

type Props = {
  contacts: Contact[];
  /** Selected user ids, in the order they were picked. */
  selected: number[];
  onChange: (userIds: number[]) => void;
  /** User ids that can't be picked (e.g. already in the group). */
  exclude?: Set<number>;
};

/** Search + selected chips + a checkable contact list. Used by New group and Add members. */
export function ContactMultiPicker({ contacts, selected, onChange, exclude }: Props) {
  const [filter, setFilter] = useState("");
  const available = contacts.filter((c) => !exclude?.has(c.user_id));
  const byId = new Map(contacts.map((c) => [c.user_id, c]));

  const needle = filter.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const shown = needle
    ? available.filter(
        (c) =>
          contactName(c).toLowerCase().includes(needle) ||
          c.display_name.toLowerCase().includes(needle) ||
          (digits !== "" && c.phone.includes(digits)),
      )
    : available;

  function toggle(userId: number) {
    onChange(selected.includes(userId) ? selected.filter((id) => id !== userId) : [...selected, userId]);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-pane-x pb-2">
        <SearchBox value={filter} onChange={setFilter} placeholder="Search contacts" autoFocus />
      </div>
      {selected.length > 0 && (
        <ul aria-label="Selected" className="flex flex-wrap gap-1.5 px-pane-x pb-2">
          {selected.map((id) => {
            const contact = byId.get(id);
            if (!contact) return null;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  aria-label={`Remove ${contactName(contact)}`}
                  className="flex items-center gap-1.5 rounded-full bg-input py-0.5 pr-2 pl-0.5 text-body-sm text-fg hover:bg-hover"
                >
                  <Avatar colorId={contact.user_id} name={contact.display_name} avatar={contact.avatar} size="profile" />
                  <span className="max-w-32 truncate">{contactName(contact)}</span>
                  <CloseIcon className="size-3.5 text-fg-secondary" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {shown.length === 0 ? (
          <p className="px-pane-x py-4 text-body-sm text-fg-secondary">
            {available.length === 0 ? "No contacts to add." : "No matching contacts"}
          </p>
        ) : (
          <ul role="listbox" aria-multiselectable aria-label="Contacts">
            {shown.map((contact) => {
              const isSelected = selected.includes(contact.user_id);
              const name = contactName(contact);
              const phone = formatPhone(contact.phone);
              return (
                <li key={contact.id} role="option" aria-selected={isSelected} className="px-list-inset">
                  <button
                    type="button"
                    onClick={() => toggle(contact.user_id)}
                    className="flex h-contact-item w-full items-center gap-3 rounded-list-item px-row-x text-left transition-colors hover:bg-hover"
                  >
                    <Avatar colorId={contact.user_id} name={contact.display_name} avatar={contact.avatar} size="contact" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-fg">{name}</p>
                      {name !== phone && <p className="truncate text-caption text-fg-secondary">{phone}</p>}
                    </div>
                    <span
                      aria-hidden
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                        isSelected ? "border-accent bg-accent text-on-accent" : "border-fg-tertiary"
                      }`}
                    >
                      {isSelected && <CheckIcon className="size-3.5" strokeWidth={2.5} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
