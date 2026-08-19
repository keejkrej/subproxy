import { operatorFailed, requireOperator } from "@/lib/operator";
import { revokeIssuedKey } from "@/lib/vault";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator();
    const { id } = await context.params;
    await revokeIssuedKey(id);
    return Response.json({ ok: true });
  } catch (error) {
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}
