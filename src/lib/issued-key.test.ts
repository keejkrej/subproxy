import { describe, expect, it } from "vitest";
import { extractBearer, generateIssuedKey, hashIssuedKey, ISSUED_KEY_PREFIX } from "./issued-key";

describe("issued keys", () => {
  it("generates a hashed sk-sub secret", () => {
    const key = generateIssuedKey();
    expect(key.secret.startsWith(ISSUED_KEY_PREFIX)).toBe(true);
    expect(key.hash).toBe(hashIssuedKey(key.secret));
    expect(key.prefix).toBe(key.secret.slice(0, 14));
  });

  it("extracts a bearer token", () => {
    expect(extractBearer("Bearer sk-sub-abc")).toBe("sk-sub-abc");
    expect(extractBearer("basic x")).toBeNull();
  });
});
