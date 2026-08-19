import { cronSecret } from "@/lib/env";
import { probeAll } from "@/lib/probe";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = cronSecret();
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await probeAll();
  return Response.json({ ok: true, results });
}
