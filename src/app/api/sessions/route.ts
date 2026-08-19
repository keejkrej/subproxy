import { operatorFailed, requireOperator } from "@/lib/operator";
import { listSessions } from "@/lib/vault";

export async function GET() {
  try {
    await requireOperator();
    return Response.json({ sessions: await listSessions() });
  } catch (error) {
    return operatorFailed(error) ?? Response.json({ error: "failed" }, { status: 500 });
  }
}
