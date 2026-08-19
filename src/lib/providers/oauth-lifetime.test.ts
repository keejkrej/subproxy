import { afterEach, describe, expect, it, vi } from "vitest";
import { expiryFromJwt } from "@/lib/jwt";
import { probeCursor, refreshCursorSecret } from "./cursor";
import { probeChatGpt } from "./chatgpt";
import { refreshIfNeeded } from "./index";

function jwtToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `hdr.${payload}.sig`;
}

function farFutureCursorToken(email = "dev@example.com"): string {
  return jwtToken({
    exp: Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60,
    email,
    iss: "https://authentication.cursor.sh",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cursor oauth lifetime", () => {
  it("probes AvailableModels with the stored access token and does not refresh", async () => {
    const token = farFutureCursorToken();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("AvailableModels")) {
        return new Response(JSON.stringify({ models: [{ name: "composer-2.5" }] }), { status: 200 });
      }
      return new Response(`unexpected ${url}`, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeCursor({
      kind: "oauth",
      accessToken: token,
      refreshToken: token,
    });

    expect(result.health).toBe("healthy");
    expect(result.identity).toBe("dev@example.com");
    expect(result.expiresAt?.toISOString()).toBe(expiryFromJwt(token)?.toISOString());
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("AvailableModels"))).toBe(true);
    expect(urls.some((url) => url.includes("/auth/token"))).toBe(false);
  });

  it("does not call Cursor /auth/token when refreshing a still-valid session", async () => {
    const token = farFutureCursorToken();
    const fetchMock = vi.fn(async () => new Response("should not refresh", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const next = await refreshCursorSecret({
      kind: "oauth",
      accessToken: token,
      refreshToken: token,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(next.expiresAt?.toISOString()).toBe(expiryFromJwt(token)?.toISOString());
    if (next.secret.kind !== "oauth") throw new Error("expected oauth secret");
    expect(next.secret.accessToken).toBe(token);
    expect(next.secret.refreshToken).toBe(token);
  });

  it("skips provider refresh when expiresAt is missing but the access JWT is still valid", async () => {
    const token = farFutureCursorToken();
    const fetchMock = vi.fn(async () => new Response("should not refresh", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const next = await refreshIfNeeded(
      "cursor",
      { kind: "oauth", accessToken: token, refreshToken: token },
      null,
    );

    expect(next.refreshed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(next.expiresAt?.toISOString()).toBe(expiryFromJwt(token)?.toISOString());
  });
});

describe("chatgpt refresh still runs when the stored expiry is near", () => {
  it("refreshes ChatGPT when expiresAt is inside the two-hour window", async () => {
    const token = jwtToken({
      exp: Math.floor(Date.now() / 1000) + 10 * 60 * 60,
      "https://api.openai.com/auth": { chatgpt_account_id: "acct_123" },
    });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: token,
          refresh_token: "rt_new",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const next = await refreshIfNeeded(
      "chatgpt",
      { kind: "oauth", accessToken: token, refreshToken: "rt_old", accountId: "acct_123" },
      new Date(Date.now() + 30 * 60 * 1000),
    );

    expect(next.refreshed).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    if (next.secret.kind !== "oauth") throw new Error("expected oauth secret");
    expect(next.secret.refreshToken).toBe("rt_new");
  });
});

describe("chatgpt probe lifetime", () => {
  it("does not spend a refresh token just to check health", async () => {
    const token = jwtToken({
      exp: Math.floor(Date.now() / 1000) + 10 * 60 * 60,
      "https://api.openai.com/auth": { chatgpt_account_id: "acct_123" },
    });
    const fetchMock = vi.fn(async () => new Response("should not refresh", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeChatGpt({
      kind: "oauth",
      accessToken: token,
      refreshToken: "rt_keep_me",
      accountId: "acct_123",
    });

    expect(result.health).toBe("healthy");
    expect(result.identity).toBe("acct_123");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
