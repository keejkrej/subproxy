import { expiryFromSeconds } from "@/lib/health";
import { decodeJwtPayload } from "@/lib/jwt";

const ISSUER = "https://auth.x.ai";
const CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
const SCOPE = "openid profile email offline_access grok-cli:access api:access";
const DEVICE_CODE_URL = `${ISSUER}/oauth2/device/code`;
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;

export type GrokDeviceStart = {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  interval: number;
  tokenEndpoint: string;
  expiresAt: string;
};

export async function grokTokenEndpoint(): Promise<string> {
  const response = await fetch(DISCOVERY_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`xAI discovery failed (${response.status})`);
  const json = (await response.json()) as { token_endpoint?: string };
  if (!json.token_endpoint) throw new Error("xAI discovery missing token_endpoint");
  return json.token_endpoint;
}

export async function startGrokDeviceAuth(): Promise<GrokDeviceStart> {
  const [device, tokenEndpoint] = await Promise.all([
    fetch(DEVICE_CODE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE }),
    }),
    grokTokenEndpoint(),
  ]);
  if (!device.ok) throw new Error(`Grok device code failed (${device.status})`);
  const data = (await device.json()) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    verification_uri_complete?: string;
    expires_in?: number;
    interval?: number;
  };
  if (!data.device_code || !data.user_code || !data.verification_uri) {
    throw new Error("Grok device code response was incomplete");
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUrl: data.verification_uri_complete ?? data.verification_uri,
    interval: Math.max(1, Number(data.interval ?? 5)),
    tokenEndpoint,
    expiresAt: new Date(Date.now() + Number(data.expires_in ?? 900) * 1000).toISOString(),
  };
}

export type GrokTokens = {
  accessToken: string;
  refreshToken: string;
  tokenEndpoint?: string;
  expiresAt: Date | null;
};

export async function pollGrokDeviceAuth(input: {
  deviceCode: string;
  tokenEndpoint: string;
}): Promise<GrokTokens | "pending"> {
  const response = await fetch(input.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: CLIENT_ID,
      device_code: input.deviceCode,
    }),
  });
  if (response.status === 200) {
    return tokensFromResponse(await response.json(), input.tokenEndpoint);
  }
  let error = "";
  try {
    const json = (await response.json()) as { error?: string };
    error = json.error ?? "";
  } catch {
    error = "";
  }
  if (error === "authorization_pending" || error === "slow_down") return "pending";
  throw new Error(`Grok device poll failed (${response.status}${error ? `: ${error}` : ""})`);
}

export function grokPrincipalFromToken(accessToken: string): { type?: string; id?: string } {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return {};
  return {
    type: typeof payload.principal_type === "string" ? payload.principal_type : undefined,
    id: typeof payload.principal_id === "string" ? payload.principal_id : undefined,
  };
}

export async function refreshGrokToken(
  refreshToken: string,
  tokenEndpoint?: string,
  principal?: { type?: string; id?: string },
): Promise<GrokTokens> {
  const endpoint = tokenEndpoint || (await grokTokenEndpoint());
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  });
  if (principal?.type) body.set("principal_type", principal.type);
  if (principal?.id) body.set("principal_id", principal.id);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const detail = [json.error, json.error_description].filter(Boolean).join(": ");
    throw new Error(`Grok refresh failed (${response.status}${detail ? `: ${detail}` : ""})`);
  }
  return tokensFromResponse(json, endpoint, refreshToken);
}

function tokensFromResponse(
  json: Record<string, unknown>,
  tokenEndpoint?: string,
  fallbackRefresh?: string,
): GrokTokens {
  const accessToken = String(json.access_token ?? "");
  const refreshToken = String(json.refresh_token || fallbackRefresh || "");
  if (!accessToken || !refreshToken) {
    throw new Error("Grok token response missing access or refresh token");
  }
  return {
    accessToken,
    refreshToken,
    tokenEndpoint,
    expiresAt: expiryFromSeconds(json.expires_in),
  };
}
