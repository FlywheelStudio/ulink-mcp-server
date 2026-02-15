import { describe, it, expect, vi, beforeEach } from "vitest";
import { getApiKey } from "../api-key.js";

describe("getApiKey", () => {
  beforeEach(() => {
    delete process.env.ULINK_API_KEY;
  });

  it("returns the ULINK_API_KEY env var when set", () => {
    process.env.ULINK_API_KEY = "test-key-123";
    expect(getApiKey()).toBe("test-key-123");
  });

  it("returns undefined when ULINK_API_KEY is not set", () => {
    expect(getApiKey()).toBeUndefined();
  });
});
