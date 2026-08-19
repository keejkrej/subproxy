import { isUniqueViolation, parseModelName, parseProvider } from "@/lib/catalog";
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
    const body = (await req.json().catch(() => ({}))) as { name?: unknown; provider?: unknown };
    const name = parseModelName(body.name);
    const provider = parseProvider(body.provider);
    if (!name || !provider) {
      return Response.json({ error: "name and provider are required" }, { status: 400 });
    }
    const model = await insertModel({ name, provider });
    return Response.json({ model });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json({ error: "A model with that name already exists" }, { status: 409 });
    }
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}
