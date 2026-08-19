import { afterEach, describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "./crypto";

describe("vault crypto", () => {
  const previous = process.env.VAULT_KEY;

  afterEach(() => {
    process.env.VAULT_KEY = previous;
  });

  it("round-trips JSON with a passphrase key", () => {
    process.env.VAULT_KEY = "test-passphrase";
    const payload = { kind: "oauth", accessToken: "abc", refreshToken: "def" };
    const encoded = encryptJson(payload);
    expect(encoded.startsWith("v1.")).toBe(true);
    expect(decryptJson(encoded)).toEqual(payload);
  });

  it("rejects a tampered payload", () => {
    process.env.VAULT_KEY = "test-passphrase";
    const encoded = encryptJson({ a: 1 });
    expect(() => decryptJson(`${encoded}x`)).toThrow();
  });
});
