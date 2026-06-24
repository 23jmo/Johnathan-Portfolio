/**
 * User identity for the AI chat. Today this is just a name kept in localStorage;
 * this module is the seam where a real account/DB lookup would slot in later,
 * so callers never touch storage directly.
 */

const STORAGE_KEY = "scrollchat:name";

export function getStoredName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function storeName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, name.trim());
  } catch {
    // Private mode / storage disabled — the name simply won't persist.
  }
}

export function clearName(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
