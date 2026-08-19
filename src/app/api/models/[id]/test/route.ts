import { operatorFailed, requireOperator } from "@/lib/operator";
import { testCatalogModel } from "@/lib/probe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOperator();
    const { id } = await context.params;
    const result = await testCatalogModel(id);
    return Response.json({ result });
  } catch (error) {
    return (
      operatorFailed(error) ??
      Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 500 })
    );
  }
}
