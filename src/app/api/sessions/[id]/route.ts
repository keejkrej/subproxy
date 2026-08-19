import { operatorFailed, requireOperator } from "@/lib/operator";
import { deleteSession, getSession } from "@/lib/vault";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator();
    const { id } = await context.params;
    const session = await getSession(id);
    if (!session) return Response.json({ error: "not found" }, { status: 404 });
    const { secret: _secret, ...safe } = session;
    return Response.json({ session: safe });
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
