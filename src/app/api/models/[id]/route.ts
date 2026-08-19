import { isUniqueViolation, parseModelName, parseProvider } from "@/lib/catalog";
import { operatorFailed, requireOperator } from "@/lib/operator";
import type { ProviderId } from "@/lib/types";
import { deleteModel, getModel, updateModel } from "@/lib/vault";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator();
    const { id } = await context.params;
    const model = await getModel(id);
    if (!model) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ model });
  } catch (error) {
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator();
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as { name?: unknown; provider?: unknown };
    const patch: { name?: string; provider?: ProviderId } = {};
    if (body.name !== undefined) {
      const name = parseModelName(body.name);
      if (!name) return Response.json({ error: "name is required" }, { status: 400 });
      patch.name = name;
    }
    if (body.provider !== undefined) {
      const provider = parseProvider(body.provider);
      if (!provider) return Response.json({ error: "unknown provider" }, { status: 400 });
      patch.provider = provider;
    }
    if (!patch.name && !patch.provider) {
      return Response.json({ error: "nothing to update" }, { status: 400 });
    }
    const model = await updateModel(id, patch);
    if (!model) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ model });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json({ error: "A model with that name already exists" }, { status: 409 });
    }
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator();
    const { id } = await context.params;
    const deleted = await deleteModel(id);
    if (!deleted) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}
