import { Avatar } from "@/components/Avatar";
import type { Contact } from "@/lib/api";
import { contactName } from "@/lib/conversations";
import { formatPhone } from "@/lib/phone";

type Props = {
  contact: Contact;
  onSelect: () => void;
  disabled?: boolean;
};

export function ContactListItem({ contact, onSelect, disabled }: Props) {
  const name = contactName(contact);
  const phone = formatPhone(contact.phone);
  return (
    <div className="px-list-inset">
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="flex h-contact-item w-full items-center gap-3 rounded-list-item px-row-x text-left transition-colors hover:bg-hover disabled:opacity-50"
      >
        <Avatar colorId={contact.user_id} name={contact.display_name || name} avatar={contact.avatar} size="contact" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-fg">{name}</p>
          {name !== phone && <p className="truncate text-caption text-fg-secondary">{phone}</p>}
        </div>
      </button>
    </div>
  );
}
