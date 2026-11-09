export interface MosaicoAccount {
  id: string;
  name: string;
  document: string;
  city: string;
}

export const MOSAICO_ACCOUNT_STORAGE_KEY = "mosaico-active-account";

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatCnpj(value: string): string {
  const digits = digitsOnly(value).slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function normalizeCnpj(value: string): string {
  return digitsOnly(value).slice(0, 14);
}

export function loadMosaicoAccount(): MosaicoAccount | null {
  try {
    const raw = window.localStorage.getItem(MOSAICO_ACCOUNT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Partial<MosaicoAccount>;
    if (typeof value.id !== "string" || typeof value.name !== "string" || !value.name.trim()) return null;
    return {
      id: value.id,
      name: value.name,
      document: typeof value.document === "string" ? value.document : "",
      city: typeof value.city === "string" ? value.city : "",
    };
  } catch {
    return null;
  }
}

export function persistMosaicoAccount(account: MosaicoAccount): void {
  try {
    window.localStorage.setItem(MOSAICO_ACCOUNT_STORAGE_KEY, JSON.stringify(account));
  } catch {
    // A local preference must not stop the desktop app from opening.
  }
}
