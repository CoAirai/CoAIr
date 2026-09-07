import { readSharedItem, removeSharedItem, writeSharedItem } from "@/lib/auth/sharedStorage";

/** Cookie-safe prefix (no `:` — invalid in Set-Cookie names). */
const DEVICE_PREFIX = "coair.trustedDevice.";
/** Legacy localStorage-only keys from earlier builds. */
const LEGACY_DEVICE_PREFIX = "coair.trustedDevice:";
/** Match remember-device TTL on the API (30 days). */
const TRUSTED_DEVICE_MAX_AGE = 60 * 60 * 24 * 30;

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase();
}

export function trustedDeviceKey(alias: string): string {
  return DEVICE_PREFIX + normalizeAlias(alias);
}

export function isTrustedDeviceStorageKey(key: string): boolean {
  return (
    key.startsWith(DEVICE_PREFIX) || key.startsWith(LEGACY_DEVICE_PREFIX)
  );
}

export function readTrustedDeviceToken(username: string): string | null {
  if (typeof window === "undefined") return null;
  const alias = normalizeAlias(username);
  const modern = readSharedItem(DEVICE_PREFIX + alias);
  if (modern) return modern;
  try {
    return localStorage.getItem(LEGACY_DEVICE_PREFIX + alias);
  } catch {
    return null;
  }
}

/** Resolve a remembered-device token for a login form value (email or username). */
export function readTrustedDeviceTokenForLogin(
  loginInput: string,
  emailDomain = "users.coair.local"
): string | null {
  if (typeof window === "undefined") return null;
  const trimmed = loginInput.trim();
  if (!trimmed) return null;

  const aliases = new Set<string>();
  aliases.add(trimmed);
  aliases.add(normalizeAlias(trimmed));
  if (trimmed.includes("@")) {
    aliases.add(normalizeAlias(trimmed));
  } else {
    aliases.add(`${normalizeAlias(trimmed)}@${emailDomain}`);
  }

  for (const alias of aliases) {
    const token = readTrustedDeviceToken(alias);
    if (token) return token;
  }

  // Fallback: any stored device token (backend still binds it to the
  // authenticated username after password verification).
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !isTrustedDeviceStorageKey(key)) continue;
      const token = localStorage.getItem(key);
      if (token) return token;
    }
  } catch {
    /* ignore */
  }
  // Cookie-only aliases (written on login.* after MFA).
  try {
    const parts = document.cookie.split(";");
    for (const part of parts) {
      const name = part.split("=")[0]?.trim() || "";
      if (!isTrustedDeviceStorageKey(name)) continue;
      const token = readSharedItem(name);
      if (token) return token;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeTrustedDeviceToken(
  username: string,
  token: string
): void {
  if (typeof window === "undefined") return;
  writeSharedItem(
    trustedDeviceKey(username),
    token.trim(),
    true,
    TRUSTED_DEVICE_MAX_AGE
  );
}

/** Persist the same device token under username + email aliases. */
export function writeTrustedDeviceAliases(
  token: string,
  aliases: Array<string | null | undefined>
): void {
  const clean = token.trim();
  if (!clean) return;
  const seen = new Set<string>();
  for (const alias of aliases) {
    const value = (alias || "").trim();
    if (!value) continue;
    const norm = normalizeAlias(value);
    if (seen.has(norm)) continue;
    seen.add(norm);
    writeTrustedDeviceToken(norm, clean);
  }
}

export function clearTrustedDeviceToken(username: string): void {
  if (typeof window === "undefined") return;
  removeSharedItem(trustedDeviceKey(username));
}
