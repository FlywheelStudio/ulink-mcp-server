import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OAuthTokens } from "../oauth.js";

// Mock node:fs
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
}));

// Mock node:os
vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/mock-home"),
}));

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { loadTokensFromDisk, saveTokensToDisk } from "../token-store.js";

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedChmodSync = vi.mocked(chmodSync);

describe("loadTokensFromDisk", () => {
  it("returns tokens when config.json has valid JWT auth", () => {
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

  it("creates config dir and writes config file", () => {
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
    expect(written.auth).toEqual({
      type: "jwt",
      token: "new-access",
      refreshToken: "new-refresh",
      expiresAt: new Date(1700000000000).toISOString(),
    });
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
    expect(written.auth.type).toBe("jwt");
  });

  it("overwrites existing auth section", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        auth: { type: "jwt", token: "old", refreshToken: "old", expiresAt: "old" },
      }),
    );

    saveTokensToDisk(tokens);

    const written = JSON.parse(
      mockedWriteFileSync.mock.calls[0][1] as string,
    );
    expect(written.auth.token).toBe("new-access");
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

    // Should still write successfully with just auth
    const written = JSON.parse(
      mockedWriteFileSync.mock.calls[0][1] as string,
    );
    expect(written.auth.token).toBe("new-access");
  });
});
