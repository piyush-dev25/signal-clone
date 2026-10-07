export const COUNTRY_CODES = [
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

export const DEFAULT_COUNTRY_CODE = "+91";

/** Country code + national number, dropping the trunk prefix ("098765…" → "98765…") so one
 * number can't map to two accounts. The backend does the remaining normalization. */
export function buildPhone(countryCode: string, nationalNumber: string): string {
  return `${countryCode}${nationalNumber.trim().replace(/^0+/, "")}`;
}

/** "+919876543210" → "+91 98765 43210" for display; other numbers are shown as stored. */
export function formatPhone(phone: string): string {
  const india = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return india ? `+91 ${india[1]} ${india[2]}` : phone;
}
