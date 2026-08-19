import { chatgptAccountIdFromToken } from "@/lib/jwt";
import { expiryFromSeconds } from "@/lib/health";

const ISSUER = "https://auth.openai.com";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL = `${ISSUER}/oauth/token`;

export type ChatGptDeviceStart = {
  userCode: string;
  deviceAuthId: string;
  verificationUrl: string;
  interval: number;
  expiresAt: string;
};

export async function startChatGptDeviceAuth(): Promise<ChatGptDeviceStart> {
  const response = await fetch(`${ISSUER}/api/accounts/deviceauth/usercode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!response.ok) {
    throw new Error(`ChatGPT device code failed (${response.status})`);
  }
  const data = (await response.json()) as {
    user_code?: string;
    device_auth_id?: string;
    interval?: number;
  };
  if (!data.user_code || !data.device_auth_id) {
    throw new Error("ChatGPT device code response was incomplete");
  }
  return {
    userCode: data.user_code,
    deviceAuthId: data.device_auth_id,
    verificationUrl: `${ISSUER}/codex/device`,
    interval: Math.max(3, Number(data.interval ?? 5)),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

export type ChatGptTokens = {
  accessToken: string;
  refreshToken: string;
  accountId?: string;
  expiresAt: Date | null;
};

export async function pollChatGptDeviceAuth(input: {
  deviceAuthId: string;
  userCode: string;
}): Promise<ChatGptTokens | "pending"> {
  const poll = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_auth_id: input.deviceAuthId,
      user_code: input.userCode,
    }),
  });
  if (poll.status === 403 || poll.status === 404) return "pending";
  if (!poll.ok) {
    throw new Error(`ChatGPT device poll failed (${poll.status})`);
  }
  const code = (await poll.json()) as {
    authorization_code?: string;
    code_verifier?: string;
  };
  if (!code.authorization_code || !code.code_verifier) return "pending";

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code.authorization_code,
      redirect_uri: `${ISSUER}/deviceauth/callback`,
      client_id: CLIENT_ID,
      code_verifier: code.code_verifier,
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`ChatGPT token exchange failed (${tokenResponse.status})`);
  }
  return tokensFromResponse(await tokenResponse.json());
}

export async function refreshChatGptToken(refreshToken: string): Promise<ChatGptTokens> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  if (!response.ok) {
    throw new Error(`ChatGPT refresh failed (${response.status})`);
  }
  const json = await response.json();
  return tokensFromResponse(json, refreshToken);
}

function tokensFromResponse(json: Record<string, unknown>, fallbackRefresh?: string): ChatGptTokens {
  const accessToken = String(json.access_token ?? "");
  const refreshToken = String(json.refresh_token ?? fallbackRefresh ?? "");
  if (!accessToken || !refreshToken) {
    throw new Error("ChatGPT token response missing access or refresh token");
  }
  return {
    accessToken,
    refreshToken,
    accountId: chatgptAccountIdFromToken(accessToken),
    expiresAt: expiryFromSeconds(json.expires_in),
  };
}
