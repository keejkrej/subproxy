import { afterEach, describe, expect, it, vi } from "vitest";
import { expiryFromJwt } from "@/lib/jwt";
import { probeChatGpt } from "./chatgpt";
import { refreshGrokToken } from "@/lib/oauth/grok";
import { refreshIfNeeded } from "./index";

function jwtToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `hdr.${payload}.sig`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("jwt expiry", () => {
  it("reads exp from a JWT payload", () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1_800_000_000 }), "utf8").toString("base64url");
    const token = `hdr.${payload}.sig`;
    expect(expiryFromJwt(token)?.toISOString()).toBe("2027-01-15T08:00:00.000Z");
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

describe("grok oauth refresh", () => {
  function grokJwt(extra: Record<string, unknown> = {}, ttlSeconds = 60 * 60) {
    return jwtToken({
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
      iat: Math.floor(Date.now() / 1000),
      principal_type: "User",
      principal_id: "user_123",
      ...extra,
    });
  }

  it("does not spend the Grok refresh token an hour before expiry", async () => {
    const token = grokJwt();
    const fetchMock = vi.fn(async () => new Response("should not refresh", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const next = await refreshIfNeeded(
      "supergrok",
      { kind: "oauth", accessToken: token, refreshToken: "rt_keep", tokenEndpoint: "https://auth.x.ai/oauth2/token" },
      new Date(Date.now() + 60 * 60 * 1000),
    );

    expect(next.refreshed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes Grok inside the ten-minute window and keeps an omitted refresh token", async () => {
    const token = grokJwt({}, 5 * 60);
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: grokJwt({}, 6 * 60 * 60),
          expires_in: 21600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const next = await refreshIfNeeded(
      "supergrok",
      { kind: "oauth", accessToken: token, refreshToken: "rt_old", tokenEndpoint: "https://auth.x.ai/oauth2/token" },
      new Date(Date.now() + 5 * 60 * 1000),
    );

    expect(next.refreshed).toBe(true);
    if (next.secret.kind !== "oauth") throw new Error("expected oauth secret");
    expect(next.secret.refreshToken).toBe("rt_old");
    const calls = fetchMock.mock.calls as unknown as [RequestInfo, RequestInit][];
    const body = String(calls[0]?.[1]?.body ?? "");
    expect(body).toContain("principal_type=User");
    expect(body).toContain("principal_id=user_123");
  });

  it("includes xAI error_description on a failed refresh", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "token reused" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(refreshGrokToken("rt_dead", "https://auth.x.ai/oauth2/token")).rejects.toThrow(
      /Grok refresh failed \(400: invalid_grant: token reused\)/,
    );
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
