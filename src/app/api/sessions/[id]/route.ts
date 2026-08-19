import { operatorFailed, requireOperator } from "@/lib/operator";
import { deleteSession, getSession } from "@/lib/vault";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator();
    const { id } = await context.params;
    const session = await getSession(id);
    if (!session) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({
      session: {
        id: session.id,
        provider: session.provider,
        label: session.label,
        identity: session.identity,
        health: session.health,
        expiresAt: session.expiresAt,
        lastProbedAt: session.lastProbedAt,
        lastError: session.lastError,
        createdAt: session.createdAt,
      },
    });
  } catch (error) {
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator();
    const { id } = await context.params;
    await deleteSession(id);
    return Response.json({ ok: true });
  } catch (error) {
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}
