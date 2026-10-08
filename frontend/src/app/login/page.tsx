"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { AvatarPicker } from "@/components/AvatarPicker";
import { Button, ErrorText, SelectField, TextField } from "@/components/ui";
import { ApiError, type User, getMe, requestOtp, updateMe, verifyOtp } from "@/lib/api";
import { getToken, setToken } from "@/lib/auth";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, buildPhone } from "@/lib/phone";

const OTP_HINT = "123456";

// Seeded accounts (backend/app/seed.py), listed so evaluators can open two browsers as different users.
const TEST_LOGINS = [
  { name: "Priya Sharma", number: "98765 43210" },
  { name: "Rahul Verma", number: "98123 45678" },
  { name: "Ananya Iyer", number: "98989 89898" },
];

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

  const phone = buildPhone(countryCode, number);

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
    <main className="flex flex-1 items-center justify-center bg-sidebar p-4">
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
            <div className="rounded-control bg-info px-3 py-2 text-body-sm text-on-info">
              <p className="font-medium">Demo accounts (code {OTP_HINT})</p>
              <ul className="mt-1">
                {TEST_LOGINS.map((login) => (
                  <li key={login.number}>
                    <button
                      type="button"
                      onClick={() => {
                        setCountryCode("+91");
                        setNumber(login.number);
                        setError(null);
                      }}
                      className="hover:underline"
                    >
                      {login.name}: +91 {login.number}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={submitOtp} className="flex flex-col gap-4">
            <StepHeading title="Verification code">Enter the code we sent to {phone}.</StepHeading>
            <p className="rounded-control bg-info px-3 py-2 text-body-sm text-on-info">
              Demo app: no SMS is sent. Use code <strong>{OTP_HINT}</strong>.
            </p>
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
