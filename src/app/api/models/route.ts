import { CATALOG_NAME_HINT, isUniqueViolation, parseCatalogModel } from "@/lib/catalog";
import { operatorFailed, requireOperator } from "@/lib/operator";
import { insertModel, listModels } from "@/lib/vault";

export async function GET() {
  try {
    await requireOperator();
    return Response.json({ models: await listModels() });
  } catch (error) {
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireOperator();
    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    const parsed = parseCatalogModel(body.name);
    if (!parsed) {
      return Response.json({ error: CATALOG_NAME_HINT }, { status: 400 });
    }
    const model = await insertModel(parsed);
    return Response.json({ model });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json({ error: "A model with that name already exists" }, { status: 409 });
    }
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}
