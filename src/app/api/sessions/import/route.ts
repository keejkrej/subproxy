import { chatgptAccountIdFromToken, expiryFromJwt } from "@/lib/jwt";
import { operatorFailed, requireOperator } from "@/lib/operator";
import { upsertSession } from "@/lib/vault";
import type { ProviderId, SessionSecret } from "@/lib/types";

export async function POST(req: Request) {
  try {
    await requireOperator();
    const body = (await req.json()) as {
      provider?: ProviderId;
      sessionId?: string;
      label?: string;
      accessToken?: string;
      refreshToken?: string;
      accountId?: string;
    };
    if (body.provider !== "chatgpt" && body.provider !== "supergrok") {
      return Response.json({ error: "unknown provider" }, { status: 400 });
    }
    if (!body.accessToken || !body.refreshToken) {
      return Response.json({ error: "accessToken and refreshToken are required" }, { status: 400 });
    }
    const identity =
      body.provider === "chatgpt"
        ? body.accountId || chatgptAccountIdFromToken(body.accessToken) || null
        : null;
    const secret: SessionSecret = {
      kind: "oauth",
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      accountId: identity ?? undefined,
    };
    const session = await upsertSession({
      id: body.sessionId,
      provider: body.provider,
      label: body.label || (body.provider === "chatgpt" ? "ChatGPT" : "SuperGrok"),
      identity,
      secret,
      health: "unknown",
      expiresAt: expiryFromJwt(body.accessToken),
    });
    return Response.json({ session });
  } catch (error) {
    return (
      operatorFailed(error) ??
      Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 500 })
    );
  }
}
