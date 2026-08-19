import { auth, currentUser } from "@clerk/nextjs/server";
import { clerkAllowedEmails } from "./env";

export class OperatorError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function requireOperator() {
  const { userId } = await auth();
  if (!userId) {
    throw new OperatorError("Unauthorized", 401);
  }
  const allow = clerkAllowedEmails();
  if (allow.length === 0) return userId;
  const user = await currentUser();
  const emails = user?.emailAddresses.map((item) => item.emailAddress.toLowerCase()) ?? [];
  if (!emails.some((email) => allow.includes(email))) {
    throw new OperatorError("This Clerk user is not allowlisted", 403);
  }
  return userId;
}

export function operatorFailed(error: unknown): Response | null {
  if (error instanceof OperatorError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}
