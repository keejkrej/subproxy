import { pollChatGptDeviceAuth } from "@/lib/oauth/chatgpt";
import { pollGrokDeviceAuth } from "@/lib/oauth/grok";
import { operatorFailed, requireOperator } from "@/lib/operator";
import { deletePendingReauth, getPendingReauth, upsertSession } from "@/lib/vault";
import type { ProviderId, SessionSecret } from "@/lib/types";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator();
    const { id } = await context.params;
    const pending = await getPendingReauth(id);
    if (!pending) return Response.json({ status: "expired" });

    if (pending.provider === "chatgpt") {
      const result = await pollChatGptDeviceAuth({
        deviceAuthId: String(pending.payload.deviceAuthId ?? ""),
        userCode: String(pending.payload.userCode ?? ""),
      });
      if (result === "pending") return Response.json({ status: "pending" });
      const session = await persist("chatgpt", pending.sessionId, {
        kind: "oauth",
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        accountId: result.accountId,
      }, result.accountId ?? null, result.expiresAt);
      await deletePendingReauth(id);
      return Response.json({ status: "complete", session });
    }

    const result = await pollGrokDeviceAuth({
      deviceCode: String(pending.payload.deviceCode ?? ""),
      tokenEndpoint: String(pending.payload.tokenEndpoint ?? ""),
    });
    if (result === "pending") return Response.json({ status: "pending" });
    const session = await persist("grok", pending.sessionId, {
      kind: "oauth",
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      tokenEndpoint: result.tokenEndpoint,
    }, null, result.expiresAt);
    await deletePendingReauth(id);
    return Response.json({ status: "complete", session });
  } catch (error) {
    return (
      operatorFailed(error) ??
      Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 500 })
    );
  }
}

async function persist(
  provider: ProviderId,
  sessionId: string | null,
  secret: SessionSecret,
  identity: string | null,
  expiresAt: Date | null,
) {
  return upsertSession({
    id: sessionId ?? undefined,
    provider,
    label: provider === "chatgpt" ? "ChatGPT" : "Grok",
    identity,
    secret,
    health: "healthy",
    expiresAt,
  });
}
