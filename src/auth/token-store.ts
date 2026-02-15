import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "node:crypto";
import { homedir, hostname, userInfo } from "node:os";
import { join } from "node:path";
import type { OAuthTokens } from "./oauth.js";

const CONFIG_DIR = join(homedir(), ".ulink");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

// ---------------------------------------------------------------------------
// Encryption helpers — AES-256-GCM with machine-derived key
// ---------------------------------------------------------------------------

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const SALT = "ulink-mcp-token-store-v1";

/**
 * Derive a stable encryption key from machine-specific data.
 * Not as strong as OS keychain, but prevents casual reading of tokens
 * by other tools, backup services, or cloud sync.
 */
function deriveKey(): Buffer {
  const material = `${hostname()}:${userInfo().username}:${homedir()}`;
  return scryptSync(material, SALT, 32);
}

function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv):base64(tag):base64(ciphertext)
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");
  const [ivB64, tagB64, dataB64] = parts;
  const key = deriveKey();
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf-8");
}

// ---------------------------------------------------------------------------
// Legacy plaintext format (for migration)
// ---------------------------------------------------------------------------

interface CliAuthSection {
  type: string;
  token: string;
  refreshToken: string;
  expiresAt: string;
  user?: { email?: string; userId?: string };
}

/**
 * Load OAuthTokens from ~/.ulink/config.json if present and valid.
 * Supports both encrypted (v2) and legacy plaintext (v1) formats.
 * Returns undefined if file missing, auth missing, or expired.
 */
export function loadTokensFromDisk(): OAuthTokens | undefined {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;

    // Try encrypted format first
    if (typeof config.auth_encrypted === "string") {
      try {
        const decrypted = decrypt(config.auth_encrypted);
        const auth = JSON.parse(decrypted) as CliAuthSection;
        const expiresAt = new Date(auth.expiresAt).getTime();
        if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
          return undefined;
        }
        return {
          accessToken: auth.token,
          refreshToken: auth.refreshToken,
          expiresAt,
        };
      } catch {
        // Decryption failed (e.g. machine changed) — fall through to legacy
      }
    }

    // Legacy plaintext format
    const auth = config.auth as CliAuthSection | undefined;
    if (!auth || auth.type !== "jwt" || !auth.token || !auth.refreshToken) {
      return undefined;
    }

    const expiresAt = new Date(auth.expiresAt).getTime();
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      return undefined;
    }

    // Migrate legacy tokens to encrypted format on next save
    const tokens: OAuthTokens = {
      accessToken: auth.token,
      refreshToken: auth.refreshToken,
      expiresAt,
    };

    // Auto-migrate: re-save in encrypted format
    saveTokensToDisk(tokens);

    return tokens;
  } catch {
    return undefined;
  }
}

/**
 * Persist OAuthTokens to ~/.ulink/config.json using encrypted storage.
 * Preserves projects, supabaseUrl, supabaseAnonKey and all other fields.
 * Removes legacy plaintext auth section on save.
 */
export function saveTokensToDisk(tokens: OAuthTokens): void {
  try {
    let config: Record<string, unknown> = {};
    try {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      config = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // File doesn't exist or is invalid — start fresh
    }

    const authData: CliAuthSection = {
      type: "jwt",
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(tokens.expiresAt).toISOString(),
    };

    config.auth_encrypted = encrypt(JSON.stringify(authData));
    // Remove legacy plaintext auth if present
    delete config.auth;

    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
    chmodSync(CONFIG_PATH, 0o600);
  } catch (err) {
    console.error("Failed to save tokens to disk:", err);
  }
}
