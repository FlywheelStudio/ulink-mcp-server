import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthTokens } from "./oauth.js";

const CONFIG_DIR = join(homedir(), ".ulink");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

interface CliAuthSection {
  type: string;
  token: string;
  refreshToken: string;
  expiresAt: string;
  user?: { email?: string; userId?: string };
}

/**
 * Load OAuthTokens from ~/.ulink/config.json if present and valid JWT.
 * Returns undefined if file missing, auth missing, not JWT, or expired.
 */
export function loadTokensFromDisk(): OAuthTokens | undefined {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    const auth = config.auth as CliAuthSection | undefined;

    if (!auth || auth.type !== "jwt" || !auth.token || !auth.refreshToken) {
      return undefined;
    }

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
    return undefined;
  }
}

/**
 * Persist OAuthTokens to ~/.ulink/config.json, merging into existing config.
 * Preserves projects, supabaseUrl, supabaseAnonKey and all other fields.
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

    config.auth = {
      type: "jwt",
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(tokens.expiresAt).toISOString(),
    };

    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
    chmodSync(CONFIG_PATH, 0o600);
  } catch (err) {
    console.error("Failed to save tokens to disk:", err);
  }
}
