import { startChatGptDeviceAuth } from "@/lib/oauth/chatgpt";
import { startGrokDeviceAuth } from "@/lib/oauth/grok";
import { operatorFailed, requireOperator } from "@/lib/operator";
import { createPendingReauth } from "@/lib/vault";
import type { ProviderId } from "@/lib/types";

export async function POST(req: Request) {
  try {
    await requireOperator();
    const body = (await req.json()) as { provider?: ProviderId; sessionId?: string };
    if (body.provider !== "chatgpt" && body.provider !== "supergrok") {
      return Response.json({ error: "unknown provider" }, { status: 400 });
    }
    if (body.provider === "chatgpt") {
      const started = await startChatGptDeviceAuth();
      const pending = await createPendingReauth({
        provider: "chatgpt",
        sessionId: body.sessionId ?? null,
        payload: started,
        expiresAt: new Date(started.expiresAt),
      });
      return Response.json({
        pendingId: pending.id,
        userCode: started.userCode,
        verificationUrl: started.verificationUrl,
        expiresAt: started.expiresAt,
      });
    }
    const started = await startGrokDeviceAuth();
    const pending = await createPendingReauth({
      provider: "supergrok",
      sessionId: body.sessionId ?? null,
      payload: started,
      expiresAt: new Date(started.expiresAt),
    });
    return Response.json({
      pendingId: pending.id,
      userCode: started.userCode,
      verificationUrl: started.verificationUrl,
      expiresAt: started.expiresAt,
    });
  } catch (error) {
    return (
      operatorFailed(error) ??
      Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 500 })
    );
  }
}
