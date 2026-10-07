"use client";

import { type FormEvent, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Button, ErrorText, SelectField, TextField } from "@/components/ui";
import { ApiError, addContact } from "@/lib/api";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, buildPhone } from "@/lib/phone";
import { useAppStore } from "@/store/app";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function AddContactDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add contact">
      {/* Mounted only while open, so the form resets each time. */}
      <AddContactForm onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}

function AddContactForm({ onDone }: { onDone: () => void }) {
  const storeContact = useAppStore((s) => s.addContact);
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [number, setNumber] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const contact = await addContact(buildPhone(countryCode, number), nickname.trim() || null);
      storeContact(contact);
      onDone();
    } catch (err) {
      // 404 / 400 / 409 details are already plain English ("No Signal account uses that number", …).
      if (err instanceof ApiError && err.status === 422) setError("Enter a valid phone number");
      else setError(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 px-pane-x pt-1 pb-4">
      <p className="text-body-sm text-fg-secondary">Find someone who already uses Signal by their phone number.</p>
      <div className="flex gap-2">
        <SelectField aria-label="Country code" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} {c.label}
            </option>
          ))}
        </SelectField>
        <TextField
          aria-label="Phone number"
          type="tel"
          inputMode="tel"
          autoFocus
          placeholder="98765 43210"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="flex-1"
        />
      </div>
      <TextField
        aria-label="Nickname (optional)"
        placeholder="Nickname (optional)"
        maxLength={50}
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !number.trim()}>
          {busy ? "Adding…" : "Add"}
        </Button>
      </div>
    </form>
  );
}
