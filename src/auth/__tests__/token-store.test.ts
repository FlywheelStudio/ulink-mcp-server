import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OAuthTokens } from "../oauth.js";

// Mock node:fs
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
}));

// Mock node:os — must include hostname and userInfo for encryption key derivation
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return {
    ...original,
    homedir: vi.fn(() => "/mock-home"),
    hostname: vi.fn(() => "mock-host"),
    userInfo: vi.fn(() => ({ username: "mock-user" })),
  };
});

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { loadTokensFromDisk, saveTokensToDisk } from "../token-store.js";

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedChmodSync = vi.mocked(chmodSync);

describe("loadTokensFromDisk", () => {
  it("returns tokens from legacy plaintext config and auto-migrates", () => {
    const futureDate = new Date(Date.now() + 3600_000).toISOString();
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auth: {
          type: "jwt",
          token: "access-token-1",
          refreshToken: "refresh-token-1",
          expiresAt: futureDate,
        },
      }),
    );

    const result = loadTokensFromDisk();
    expect(result).toEqual({
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
      expiresAt: new Date(futureDate).getTime(),
    });

    // Auto-migration should have triggered a save
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it("returns undefined when file does not exist", () => {
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    expect(loadTokensFromDisk()).toBeUndefined();
  });

  it("returns undefined when JSON is invalid", () => {
    mockedReadFileSync.mockReturnValue("not valid json{{{");

    expect(loadTokensFromDisk()).toBeUndefined();
  });

  it("returns undefined when auth section is missing", () => {
    mockedReadFileSync.mockReturnValue(JSON.stringify({ projects: [] }));

    expect(loadTokensFromDisk()).toBeUndefined();
  });

  it("returns undefined when auth type is not jwt", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auth: {
          type: "api-key",
          token: "abc",
          refreshToken: "def",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
      }),
    );

    expect(loadTokensFromDisk()).toBeUndefined();
  });

  it("returns undefined when token is missing", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auth: {
          type: "jwt",
          token: "",
          refreshToken: "refresh",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
      }),
    );

    expect(loadTokensFromDisk()).toBeUndefined();
  });

  it("returns undefined when refreshToken is missing", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auth: {
          type: "jwt",
          token: "access",
          refreshToken: "",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
      }),
    );

    expect(loadTokensFromDisk()).toBeUndefined();
  });

  it("returns undefined when expiresAt is invalid", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auth: {
          type: "jwt",
          token: "access",
          refreshToken: "refresh",
          expiresAt: "not-a-date",
        },
      }),
    );

    expect(loadTokensFromDisk()).toBeUndefined();
  });

  it("returns undefined when token has expired", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auth: {
          type: "jwt",
          token: "access",
          refreshToken: "refresh",
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      }),
    );

    expect(loadTokensFromDisk()).toBeUndefined();
  });
});

describe("saveTokensToDisk", () => {
  const tokens: OAuthTokens = {
    accessToken: "new-access",
    refreshToken: "new-refresh",
    expiresAt: 1700000000000,
  };

  it("creates config dir and writes encrypted config file", () => {
    // No existing config file
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    saveTokensToDisk(tokens);

    expect(mockedMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(".ulink"),
      { recursive: true },
    );
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("config.json"),
      expect.any(String),
      "utf-8",
    );
    expect(mockedChmodSync).toHaveBeenCalledWith(
      expect.stringContaining("config.json"),
      0o600,
    );

    const written = JSON.parse(
      mockedWriteFileSync.mock.calls[0][1] as string,
    );
    // Should use encrypted format, NOT plaintext
    expect(written.auth).toBeUndefined();
    expect(written.auth_encrypted).toBeDefined();
    expect(typeof written.auth_encrypted).toBe("string");
    // Encrypted format: base64(iv):base64(tag):base64(ciphertext)
    expect(written.auth_encrypted.split(":")).toHaveLength(3);
    // Should NOT contain plaintext tokens
    expect(written.auth_encrypted).not.toContain("new-access");
    expect(written.auth_encrypted).not.toContain("new-refresh");
  });

  it("merges into existing config preserving other fields", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ projects: ["p1"], supabaseUrl: "https://example.com" }),
    );

    saveTokensToDisk(tokens);

    const written = JSON.parse(
      mockedWriteFileSync.mock.calls[0][1] as string,
    );
    expect(written.projects).toEqual(["p1"]);
    expect(written.supabaseUrl).toBe("https://example.com");
    expect(written.auth_encrypted).toBeDefined();
    // Legacy plaintext field should be removed
    expect(written.auth).toBeUndefined();
  });

  it("removes legacy plaintext auth when saving", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auth: { type: "jwt", token: "old", refreshToken: "old", expiresAt: "old" },
      }),
    );

    saveTokensToDisk(tokens);

    const written = JSON.parse(
      mockedWriteFileSync.mock.calls[0][1] as string,
    );
    expect(written.auth).toBeUndefined();
    expect(written.auth_encrypted).toBeDefined();
  });

  it("handles write errors gracefully by logging to stderr", () => {
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    mockedMkdirSync.mockImplementation(() => {
      throw new Error("EACCES");
    });

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    saveTokensToDisk(tokens);
    expect(spy).toHaveBeenCalledWith(
      "Failed to save tokens to disk:",
      expect.any(Error),
    );
  });

  it("handles invalid existing config file gracefully", () => {
    mockedReadFileSync.mockReturnValue("not valid json");

    saveTokensToDisk(tokens);

    // Should still write successfully with encrypted auth
    const written = JSON.parse(
      mockedWriteFileSync.mock.calls[0][1] as string,
    );
    expect(written.auth_encrypted).toBeDefined();
    expect(written.auth).toBeUndefined();
  });
});

describe("Encrypted token round-trip", () => {
  it("can load tokens that were saved in encrypted format", () => {
    // First save — capture what gets written
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const tokens: OAuthTokens = {
      accessToken: "roundtrip-access",
      refreshToken: "roundtrip-refresh",
      expiresAt: Date.now() + 3600_000,
    };

    saveTokensToDisk(tokens);

    // Now mock readFileSync to return what was written
    const savedContent = mockedWriteFileSync.mock.calls[0][1] as string;
    mockedReadFileSync.mockReturnValue(savedContent);

    const loaded = loadTokensFromDisk();
    expect(loaded).toBeDefined();
    expect(loaded!.accessToken).toBe("roundtrip-access");
    expect(loaded!.refreshToken).toBe("roundtrip-refresh");
  });
});
