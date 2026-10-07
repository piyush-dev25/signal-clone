"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { ApiError, type User, getMe, requestOtp, updateMe, verifyOtp } from "@/lib/api";
import { getToken, setToken } from "@/lib/auth";
import { PRESET_KEYS } from "@/lib/avatars";

const COUNTRY_CODES = [
  { code: "+91", label: "India" },
  { code: "+1", label: "US / Canada" },
  { code: "+44", label: "UK" },
  { code: "+61", label: "Australia" },
  { code: "+49", label: "Germany" },
  { code: "+33", label: "France" },
  { code: "+81", label: "Japan" },
  { code: "+65", label: "Singapore" },
  { code: "+971", label: "UAE" },
  { code: "+86", label: "China" },
];

const OTP_HINT = "123456";

type Step = "phone" | "otp" | "onboarding";

function messageFor(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong";
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState("+91");
  const [number, setNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [me, setMe] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Drop the trunk prefix ("098765…" → "98765…") so one number can't map to two accounts.
  const phone = `${countryCode}${number.trim().replace(/^0+/, "")}`;

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
    <main className="flex flex-1 items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {step === "phone" && (
          <form onSubmit={submitPhone} className="flex flex-col gap-4">
            <div>
              <h1 className="text-xl font-semibold">Phone number</h1>
              <p className="mt-1 text-sm text-gray-500">Enter your phone number to get started.</p>
            </div>
            <div className="flex gap-2">
              <select
                aria-label="Country code"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} {c.label}
                  </option>
                ))}
              </select>
              <input
                aria-label="Phone number"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                autoFocus
                placeholder="98765 43210"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy || !number.trim()}
              className="rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "Sending…" : "Next"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={submitOtp} className="flex flex-col gap-4">
            <div>
              <h1 className="text-xl font-semibold">Verification code</h1>
              <p className="mt-1 text-sm text-gray-500">Enter the code we sent to {phone}.</p>
            </div>
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
              Demo app: no SMS is sent. Use code <strong>{OTP_HINT}</strong>.
            </p>
            <input
              aria-label="Verification code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-[0.4em]"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy || otp.length !== 6}
              className="rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("phone");
              }}
              className="text-sm text-gray-500 hover:underline"
            >
              Wrong number?
            </button>
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

  const choices: (string | null)[] = [null, ...PRESET_KEYS.map((key) => `preset:${key}`)];

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Set up your profile</h1>
        <p className="mt-1 text-sm text-gray-500">Your name and photo are visible to people you message.</p>
      </div>
      <div className="flex justify-center">
        <Avatar userId={user.id} name={name} avatar={avatar} size={88} />
      </div>
      <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Avatar">
        {choices.map((choice) => (
          <button
            key={choice ?? "initials"}
            type="button"
            role="radio"
            aria-checked={avatar === choice}
            aria-label={choice ? choice.slice("preset:".length) : "Initials"}
            onClick={() => setAvatar(choice)}
            className={`flex justify-center rounded-full p-0.5 ring-2 ${
              avatar === choice ? "ring-blue-600" : "ring-transparent hover:ring-gray-300"
            }`}
          >
            <Avatar userId={user.id} name={name} avatar={choice} size={44} />
          </button>
        ))}
      </div>
      <input
        aria-label="Display name"
        autoFocus
        maxLength={50}
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
