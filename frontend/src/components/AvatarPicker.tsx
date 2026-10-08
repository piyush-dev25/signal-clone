import { Avatar } from "@/components/Avatar";
import { PRESET_KEYS } from "@/lib/avatars";

const CHOICES: (string | null)[] = [null, ...PRESET_KEYS.map((key) => `preset:${key}`)];

type Props = {
  userId: number;
  name: string;
  /** null = initials. */
  value: string | null;
  onChange: (avatar: string | null) => void;
};

/** Initials or one of the preset avatars (onboarding and Settings › Profile). */
export function AvatarPicker({ userId, name, value, onChange }: Props) {
  return (
    <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Avatar">
      {CHOICES.map((choice) => (
        <button
          key={choice ?? "initials"}
          type="button"
          role="radio"
          aria-checked={value === choice}
          aria-label={choice ? choice.slice("preset:".length) : "Initials"}
          onClick={() => onChange(choice)}
          className={`flex justify-center rounded-full p-0.5 ring-2 ${
            value === choice ? "ring-accent" : "ring-transparent hover:ring-border"
          }`}
        >
          <Avatar colorId={userId} name={name} avatar={choice} size="picker" />
        </button>
      ))}
    </div>
  );
}
