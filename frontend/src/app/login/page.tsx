"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { AvatarPicker } from "@/components/AvatarPicker";
import { Button, ErrorText, SelectField, TextField } from "@/components/ui";
import { ApiError, type User, getMe, requestOtp, updateMe, verifyOtp } from "@/lib/api";
import { getToken, setToken } from "@/lib/auth";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, buildPhone, formatPhone } from "@/lib/phone";

const OTP_HINT = "123456";

// Seeded accounts (must match USERS in backend/app/seed.py), so evaluators can open two browsers
// as different people. `id` is the seeded user id, used only for the initials-avatar color.
const DEMO_ACCOUNTS = [
  { id: 1, name: "Priya Sharma", phone: "+919876543210" },
  { id: 2, name: "Rahul Verma", phone: "+919812345678" },
  { id: 3, name: "Ananya Iyer", phone: "+919898989898" },
];

/** Original mark for this demo (not Signal's logo): two overlapping chat bubbles. */
function BrandMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-12">
      <path className="fill-accent" d="M6 13a9 9 0 0 1 9-9h12a9 9 0 0 1 9 9v5a9 9 0 0 1-9 9H17l-7 6v-6.6A9 9 0 0 1 6 18z" />
      <path
        className="fill-accent-hover"
        d="M17 24a8 8 0 0 1 8-8h11a8 8 0 0 1 8 8v4a8 8 0 0 1-6 7.7V42l-6.5-6H25a8 8 0 0 1-8-8z"
      />
      <circle className="fill-on-accent" cx="25" cy="26" r="1.8" />
      <circle className="fill-on-accent" cx="30.5" cy="26" r="1.8" />
      <circle className="fill-on-accent" cx="36" cy="26" r="1.8" />
    </svg>
  );
}

type Step = "phone" | "otp" | "onboarding";

function messageFor(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong";
}

function StepHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="text-title text-fg">{title}</h1>
      <p className="mt-1 text-body-sm text-fg-secondary">{children}</p>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [number, setNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [me, setMe] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const phoneInput = useRef<HTMLInputElement>(null);

  const phone = buildPhone(countryCode, number);

  /** Demo account: fill in the number (no auto-submit) and leave the cursor in the field. */
  function fillDemoAccount(demoPhone: string) {
    setCountryCode("+91");
    setNumber(formatPhone(demoPhone).replace(/^\+91 /, ""));
    setError(null);
    phoneInput.current?.focus();
  }

  // Already signed in: go to the app, or resume onboarding if the name was never set.
  // A stale token 401s and api.ts clears it, leaving the phone step.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    getMe()
      .then((user) => {
        if (cancelled) return;
        if (user.display_name) {
          router.replace("/");
        } else {
          setMe(user);
          setStep("onboarding");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  function submitPhone(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      try {
        await requestOtp(phone);
      } catch (err) {
        if (err instanceof ApiError && err.status === 422) throw new ApiError(422, "Enter a valid phone number");
        throw err;
      }
      setOtp("");
      setStep("otp");
    });
  }

  function submitOtp(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      const result = await verifyOtp(phone, otp);
      setToken(result.token);
      if (result.is_new || !result.user.display_name) {
        setMe(result.user);
        setStep("onboarding");
      } else {
        router.replace("/");
      }
    });
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-sidebar p-4">
      <header className="flex flex-col items-center gap-2 text-center">
        <BrandMark />
        <div>
          <p className="text-title text-fg">Signal Clone</p>
          <p className="text-body-sm text-fg-secondary">Private messaging, made simple.</p>
        </div>
      </header>
      <div className="w-full max-w-dialog rounded-dialog border border-border bg-dialog p-6 shadow-dialog">
        {step === "phone" && (
          <form onSubmit={submitPhone} className="flex flex-col gap-4">
            <StepHeading title="Phone number">Enter your phone number to get started.</StepHeading>
            <div className="flex gap-2">
              <SelectField aria-label="Country code" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} {c.label}
                  </option>
                ))}
              </SelectField>
              <TextField
                ref={phoneInput}
                aria-label="Phone number"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                autoFocus
                placeholder="98765 43210"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="flex-1"
              />
            </div>
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" disabled={busy || !number.trim()}>
              {busy ? "Sending…" : "Next"}
            </Button>
            <section aria-labelledby="demo-accounts" className="flex flex-col gap-2 border-t border-border pt-4">
              <div>
                <h2 id="demo-accounts" className="text-body-sm font-semibold text-fg">
                  Try a demo account
                </h2>
                <p className="text-caption text-fg-secondary">Tap one to fill in the number. The code is {OTP_HINT}.</p>
              </div>
              <ul className="-mx-2 flex flex-col">
                {DEMO_ACCOUNTS.map((account) => (
                  <li key={account.phone}>
                    <button
                      type="button"
                      aria-label={`Fill in ${account.name}'s number`}
                      onClick={() => fillDemoAccount(account.phone)}
                      className="flex w-full items-center gap-3 rounded-list-item px-2 py-1.5 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <Avatar colorId={account.id} name={account.name} avatar={null} size="contact" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-medium text-fg">{account.name}</span>
                        <span className="block text-caption text-fg-secondary">{formatPhone(account.phone)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={submitOtp} className="flex flex-col gap-4">
            <StepHeading title="Verification code">Enter the code we sent to {phone}.</StepHeading>
            <div className="flex items-center gap-2 rounded-control bg-info py-1.5 pr-1.5 pl-3 text-body-sm text-on-info">
              <p className="flex-1">
                Demo app: no SMS is sent. Use code <strong>{OTP_HINT}</strong>.
              </p>
              <button
                type="button"
                aria-label={`Fill in the demo code ${OTP_HINT}`}
                onClick={() => {
                  setOtp(OTP_HINT);
                  setError(null);
                }}
                className="shrink-0 rounded-control px-2 py-1 font-semibold hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
              >
                Fill code
              </button>
            </div>
            <TextField
              aria-label="Verification code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="text-center text-title tracking-[0.4em]"
            />
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" disabled={busy || otp.length !== 6}>
              {busy ? "Verifying…" : "Verify"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setError(null);
                setStep("phone");
              }}
            >
              Wrong number?
            </Button>
          </form>
        )}

        {step === "onboarding" && me && <Onboarding user={me} onDone={() => router.replace("/")} />}
      </div>
      <p className="max-w-dialog text-center text-caption text-fg-tertiary">
        A demo clone built for an assignment. Sign-in and encryption are simulated.
      </p>
    </main>
  );
}

function Onboarding({ user, onDone }: { user: User; onDone: () => void }) {
  const [name, setName] = useState(user.display_name);
  const [avatar, setAvatar] = useState<string | null>(user.avatar);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateMe({ display_name: name.trim(), avatar });
      onDone();
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <StepHeading title="Set up your profile">Your name and photo are visible to people you message.</StepHeading>
      <div className="flex justify-center">
        <Avatar colorId={user.id} name={name} avatar={avatar} size="hero" />
      </div>
      <AvatarPicker userId={user.id} name={name} value={avatar} onChange={setAvatar} />
      <TextField
        aria-label="Display name"
        autoFocus
        maxLength={50}
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button type="submit" disabled={busy || !name.trim()}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
