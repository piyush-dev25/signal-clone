"use client";

import { type FormEvent, type ReactNode, useState, useSyncExternalStore } from "react";
import { Avatar } from "@/components/Avatar";
import { AvatarPicker } from "@/components/AvatarPicker";
import { Dialog } from "@/components/Dialog";
import { useSession } from "@/components/session";
import { Button, ErrorText, TextField } from "@/components/ui";
import { ApiError, updateMe } from "@/lib/api";
import { formatPhone } from "@/lib/phone";
import { isMac, shortcutRows } from "@/lib/shortcuts";
import { type ThemePreference, getThemePreference, setThemePreference, subscribeTheme } from "@/lib/theme";
import { useAppStore } from "@/store/app";
import { toast } from "@/store/toasts";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function SettingsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Settings" fullScreenOnMobile>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-4">
        <ProfileSection />
        <Section title="Privacy">
          <ComingSoonRow label="Blocked contacts" />
          <ComingSoonRow label="Read receipts" />
        </Section>
        <Section title="Notifications">
          <ComingSoonRow label="Message notifications" />
          <ComingSoonRow label="Sounds" />
        </Section>
        <AppearanceSection />
        <ShortcutsSection />
        <Section title="About">
          <p className="px-pane-x text-body-sm text-fg-secondary">
            Encryption is simulated. This is a demo clone of Signal; messages are stored unencrypted on the demo server.
          </p>
        </Section>
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-3 pb-2 first:border-t-0">
      <h3 className="px-pane-x pb-2 text-body-sm font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}

/** Looks disabled; clicking explains why instead of doing nothing. */
function ComingSoonRow({ label }: { label: string }) {
  return (
    <div className="px-list-inset">
      <button
        type="button"
        aria-disabled
        onClick={() => toast(`${label}: coming soon`)}
        className="flex h-contact-item w-full items-center justify-between rounded-list-item px-row-x text-left text-body text-fg-tertiary hover:bg-hover"
      >
        {label}
        <span className="text-caption">Coming soon</span>
      </button>
    </div>
  );
}

function ProfileSection() {
  const { me, setMe } = useSession();
  const applyMyProfile = useAppStore((s) => s.applyMyProfile);
  const [name, setName] = useState(me.display_name);
  const [avatar, setAvatar] = useState<string | null>(me.avatar);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== me.display_name || avatar !== me.avatar;

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateMe({ display_name: name.trim(), avatar });
      setMe(updated); // header, menus
      applyMyProfile(updated); // my entry in every conversation's member list
      setName(updated.display_name);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Profile">
      <form onSubmit={save} className="flex flex-col gap-3 px-pane-x">
        <div className="flex items-center gap-3">
          <Avatar colorId={me.id} name={name} avatar={avatar} size="picker" />
          <div className="min-w-0">
            <p className="truncate text-body font-medium text-fg">{name.trim() || me.display_name}</p>
            <p className="text-caption text-fg-secondary">{formatPhone(me.phone)}</p>
          </div>
        </div>
        <AvatarPicker
          userId={me.id}
          name={name}
          value={avatar}
          onChange={(choice) => {
            setAvatar(choice);
            setSaved(false);
          }}
        />
        <TextField
          aria-label="Display name"
          maxLength={50}
          placeholder="Your name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex items-center justify-end gap-3">
          {saved && !dirty && <span className="text-caption text-fg-secondary">Saved</span>}
          <Button type="submit" disabled={busy || !dirty || !name.trim()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function AppearanceSection() {
  // Read after hydration (server snapshot = "system"), never during the server render.
  const theme = useSyncExternalStore(subscribeTheme, getThemePreference, () => "system" as const);
  return (
    <Section title="Appearance">
      <div role="radiogroup" aria-label="Theme" className="flex gap-2 px-pane-x">
        {THEMES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            onClick={() => setThemePreference(value)}
            className={`h-button flex-1 rounded-button border text-body transition-colors ${
              theme === value ? "border-accent bg-accent text-on-accent" : "border-border text-fg hover:bg-hover"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </Section>
  );
}

function ShortcutsSection() {
  const mac = useSyncExternalStore(
    () => () => {},
    isMac,
    () => false,
  );
  return (
    <Section title="Keyboard shortcuts">
      <dl className="flex flex-col gap-1.5 px-pane-x">
        {shortcutRows(mac).map((row) => (
          <div key={row.description} className="flex items-baseline justify-between gap-3 text-body-sm">
            <dt className="text-fg-secondary">{row.description}</dt>
            <dd className="flex shrink-0 gap-1">
              {row.keys.map((key) => (
                <kbd key={key} className="rounded-control border border-border px-1.5 py-0.5 font-sans text-caption text-fg">
                  {key}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
