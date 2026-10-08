"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { ContactMultiPicker } from "@/components/ContactMultiPicker";
import { Dialog } from "@/components/Dialog";
import { Button, ErrorText, TextField } from "@/components/ui";
import { ApiError, createGroup } from "@/lib/api";
import { useAppStore } from "@/store/app";
import { toast } from "@/store/toasts";

const MAX_NAME = 50;

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function NewGroupDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New group" fullScreenOnMobile>
      {/* Mounted only while open, so both steps reset each time. */}
      <NewGroupFlow onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}

function NewGroupFlow({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const contacts = useAppStore((s) => s.contacts);
  const upsertConversation = useAppStore((s) => s.upsertConversation);
  const [step, setStep] = useState<"members" | "name">("members");
  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const conversation = await createGroup(name.trim(), selected);
      upsertConversation(conversation);
      toast(`Created “${conversation.name}”`);
      onDone();
      router.push(`/chat/${conversation.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the group");
      setBusy(false);
    }
  }

  if (step === "members") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="px-pane-x pb-2 text-body-sm text-fg-secondary">Choose who to add. You&apos;ll be the admin.</p>
        <ContactMultiPicker contacts={contacts} selected={selected} onChange={setSelected} />
        <div className="flex shrink-0 justify-end gap-2 border-t border-border px-pane-x py-3">
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="button" disabled={selected.length === 0} onClick={() => setStep("name")}>
            Next
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={create} className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center gap-4 px-pane-x pt-2 pb-4">
        <Avatar colorId={0} name={name} avatar={null} size="hero" group />
        <TextField
          aria-label="Group name"
          placeholder="Group name (required)"
          autoFocus
          maxLength={MAX_NAME}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full"
        />
        <p className="self-start text-body-sm text-fg-secondary">
          {selected.length + 1} members, including you
        </p>
        {error && <ErrorText>{error}</ErrorText>}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-border px-pane-x py-3">
        <Button type="button" variant="secondary" onClick={() => setStep("members")} disabled={busy}>
          Back
        </Button>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create"}
        </Button>
      </div>
    </form>
  );
}
