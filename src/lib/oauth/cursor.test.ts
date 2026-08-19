import { describe, expect, it } from "vitest";
import { cursorLoginUrl } from "./cursor";
import { connectFrame, encodeCursorChatRequest, extractCursorText, parseProtoFields } from "../cursor-wire";
import { expiryFromJwt } from "../jwt";

describe("cursor oauth helpers", () => {
  it("builds the PKCE login URL", () => {
    const url = cursorLoginUrl("challenge-value", "uuid-value", "https://cursor.com");
    expect(url).toContain("https://cursor.com/loginDeepControl?");
    expect(url).toContain("challenge=challenge-value");
    expect(url).toContain("uuid=uuid-value");
    expect(url).toContain("mode=login");
    expect(url).toContain("redirectTarget=cli");
  });
});

describe("cursor wire", () => {
  it("frames a connect payload", () => {
    const payload = new Uint8Array([1, 2, 3]);
    const frame = connectFrame(payload);
    expect(frame[0]).toBe(0);
    expect(frame.length).toBe(8);
    expect([...frame.subarray(5)]).toEqual([1, 2, 3]);
  });

  it("encodes a chat request as a connect frame", () => {
    const encoded = encodeCursorChatRequest({
      model: "composer-2.5",
      messages: [{ role: "user", content: "pong" }],
    });
    expect(encoded[0]).toBe(0);
    expect(encoded.length).toBeGreaterThan(20);
    const length = new DataView(encoded.buffer).getUint32(1, false);
    expect(length).toBe(encoded.length - 5);
  });

  it("extracts printable text from a nested proto payload", () => {
    const text = new TextEncoder().encode("hello");
    // field 1, wire 2, length 5, "hello"
    const inner = new Uint8Array([0x0a, 0x05, ...text]);
    // field 2 wrapping inner
    const outer = new Uint8Array([0x12, inner.length, ...inner]);
    expect(extractCursorText(outer).text).toBe("hello");
    expect(parseProtoFields(inner)[0]?.field).toBe(1);
  });
});

describe("jwt expiry", () => {
  it("reads exp from a JWT payload", () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1_800_000_000 }), "utf8").toString("base64url");
    const token = `hdr.${payload}.sig`;
    expect(expiryFromJwt(token)?.toISOString()).toBe("2027-01-15T08:00:00.000Z");
  });
});
