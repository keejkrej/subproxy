import { operatorFailed, requireOperator } from "@/lib/operator";
import { probeSession } from "@/lib/probe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator();
    const { id } = await context.params;
    const result = await probeSession(id);
    return Response.json({ result });
  } catch (error) {
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}
