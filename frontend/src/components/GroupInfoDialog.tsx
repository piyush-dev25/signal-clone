"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Avatar, PersonAvatar } from "@/components/Avatar";
import { ContactMultiPicker } from "@/components/ContactMultiPicker";
import { Dialog } from "@/components/Dialog";
import { MoreIcon, PencilIcon, UserPlusIcon } from "@/components/icons";
import { useSession } from "@/components/session";
import { Button, ErrorText, IconButton, TextField } from "@/components/ui";
import {
  ApiError,
  type Conversation,
  type Member,
  addGroupMembers,
  leaveGroup,
  removeGroupMember,
  renameGroup,
  setGroupRole,
} from "@/lib/api";
import { memberName } from "@/lib/conversations";
import { formatPhone } from "@/lib/phone";
import { useAppStore } from "@/store/app";

type Props = { conversation: Conversation; open: boolean; onOpenChange: (open: boolean) => void };

export function GroupInfoDialog({ conversation, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Group info" fullScreenOnMobile>
      {/* Mounted only while open, so edits/confirmations reset each time. */}
      <GroupInfo conversation={conversation} onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}

type View = "info" | "add" | "confirm-leave";

function GroupInfo({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const router = useRouter();
  const { me } = useSession();
  const contacts = useAppStore((s) => s.contacts);
  const upsertConversation = useAppStore((s) => s.upsertConversation);
  const removeConversation = useAppStore((s) => s.removeConversation);
  const [view, setView] = useState<View>("info");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(conversation.name ?? "");
  const [toAdd, setToAdd] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = conversation.members.some((m) => m.user_id === me.id && m.role === "admin");
  const memberIds = new Set(conversation.members.map((m) => m.user_id));
  const members = [...conversation.members].sort((a, b) =>
    a.user_id === me.id ? -1 : b.user_id === me.id ? 1 : memberName(a).localeCompare(memberName(b)),
  );

  /** Run an API change; the server returns the updated group (and pushes it to everyone). */
  async function run(action: () => Promise<Conversation | null>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const updated = await action();
      if (updated) upsertConversation(updated);
      after?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function saveName(event: FormEvent) {
    event.preventDefault();
    run(() => renameGroup(conversation.id, nameDraft.trim()), () => setEditingName(false));
  }

  function leave() {
    run(
      async () => {
        await leaveGroup(conversation.id);
        return null;
      },
      () => {
        removeConversation(conversation.id);
        onClose();
        router.replace("/");
      },
    );
  }

  if (view === "add") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="px-pane-x pb-2 text-body-sm text-fg-secondary">Add contacts to {conversation.name}.</p>
        <ContactMultiPicker contacts={contacts} selected={toAdd} onChange={setToAdd} exclude={memberIds} />
        {error && (
          <div className="px-pane-x pb-2">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-pane-x py-3">
          <Button type="button" variant="secondary" onClick={() => setView("info")} disabled={busy}>
            Back
          </Button>
          <Button
            type="button"
            disabled={busy || toAdd.length === 0}
            onClick={() =>
              run(() => addGroupMembers(conversation.id, toAdd), () => {
                setToAdd([]);
                setView("info");
              })
            }
          >
            {busy ? "Adding…" : toAdd.length > 1 ? `Add ${toAdd.length} members` : "Add member"}
          </Button>
        </div>
      </div>
    );
  }

  if (view === "confirm-leave") {
    return (
      <div className="flex flex-col gap-3 px-pane-x pt-1 pb-4">
        <p className="text-body text-fg">Leave “{conversation.name}”?</p>
        <p className="text-body-sm text-fg-secondary">
          You won&apos;t receive messages from this group any more.
          {isAdmin && conversation.members.filter((m) => m.role === "admin").length === 1 && conversation.members.length > 1
            ? " You're the only admin, so the longest-standing member will become admin."
            : ""}
        </p>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => setView("info")} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={leave} disabled={busy}>
            {busy ? "Leaving…" : "Leave"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-3">
      <div className="flex flex-col items-center gap-2 px-pane-x pt-2 pb-4">
        <Avatar colorId={conversation.id} name={conversation.name ?? ""} avatar={conversation.avatar} size="hero" group />
        {editingName ? (
          <form onSubmit={saveName} className="flex w-full flex-col gap-2">
            <TextField
              aria-label="Group name"
              autoFocus
              maxLength={50}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditingName(false);
                  setNameDraft(conversation.name ?? "");
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !nameDraft.trim()}>
                Save
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-1">
            <h3 className="text-title text-fg">{conversation.name}</h3>
            {isAdmin && (
              <IconButton label="Edit group name" onClick={() => setEditingName(true)}>
                <PencilIcon className="size-4" />
              </IconButton>
            )}
          </div>
        )}
        <p className="text-body-sm text-fg-secondary">{conversation.members.length} members</p>
        {error && <ErrorText>{error}</ErrorText>}
      </div>

      {isAdmin && (
        <div className="px-list-inset">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setView("add");
            }}
            className="flex h-contact-item w-full items-center gap-3 rounded-list-item px-row-x text-left text-body font-medium text-fg hover:bg-hover"
          >
            <span className="flex size-avatar-contact items-center justify-center rounded-full bg-input">
              <UserPlusIcon className="size-icon" />
            </span>
            Add members
          </button>
        </div>
      )}

      <h4 className="px-pane-x pt-3 pb-1 text-body-sm font-semibold text-fg">Members</h4>
      <ul className="[--dot-ring:var(--color-dialog)]">
        {members.map((member) => (
          <MemberRow
            key={member.user_id}
            member={member}
            isMe={member.user_id === me.id}
            canManage={isAdmin && member.user_id !== me.id}
            busy={busy}
            onSetRole={(role) => run(() => setGroupRole(conversation.id, member.user_id, role))}
            onRemove={() => run(() => removeGroupMember(conversation.id, member.user_id))}
          />
        ))}
      </ul>

      <div className="mt-2 border-t border-border px-list-inset pt-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setView("confirm-leave");
          }}
          className="flex h-contact-item w-full items-center rounded-list-item px-row-x text-left text-body font-medium text-danger hover:bg-hover"
        >
          Leave group
        </button>
      </div>
    </div>
  );
}

type MemberRowProps = {
  member: Member;
  isMe: boolean;
  canManage: boolean;
  busy: boolean;
  onSetRole: (role: "admin" | "member") => void;
  onRemove: () => void;
};

function MemberRow({ member, isMe, canManage, busy, onSetRole, onRemove }: MemberRowProps) {
  const name = isMe ? "You" : memberName(member);
  const itemClass =
    "flex cursor-pointer items-center rounded-control px-2 py-1.5 text-body outline-none data-highlighted:bg-hover";
  return (
    <li className="flex h-contact-item items-center gap-3 px-pane-x">
      <PersonAvatar member={member} size="contact" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-fg">{name}</p>
        <p className="truncate text-caption text-fg-secondary">{formatPhone(member.phone)}</p>
      </div>
      {member.role === "admin" && (
        <span className="shrink-0 rounded-full bg-input px-2 py-0.5 text-caption font-medium text-fg-secondary">
          Admin
        </span>
      )}
      {canManage && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild disabled={busy}>
            <IconButton label={`Manage ${name}`}>
              <MoreIcon className="size-icon" />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className="z-50 w-menu rounded-menu bg-menu p-1 text-fg shadow-menu">
              {member.role === "admin" ? (
                <DropdownMenu.Item onSelect={() => onSetRole("member")} className={itemClass}>
                  Remove admin
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item onSelect={() => onSetRole("admin")} className={itemClass}>
                  Make admin
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item onSelect={onRemove} className={`${itemClass} text-danger`}>
                Remove from group
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </li>
  );
}
