import { SignOutButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { clerkAllowedEmails } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export async function AllowlistGate({ children }: { children: React.ReactNode }) {
  const allow = clerkAllowedEmails();
  if (allow.length === 0) return children;
  const user = await currentUser();
  const emails = user?.emailAddresses.map((item) => item.emailAddress.toLowerCase()) ?? [];
  if (!emails.some((email) => allow.includes(email))) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center p-6">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>Not allowlisted</CardTitle>
            <CardDescription>Only {allow.join(", ")} can use this panel.</CardDescription>
          </CardHeader>
          <CardContent>
            <SignOutButton>
              <Button type="button" variant="outline">
                Sign out
              </Button>
            </SignOutButton>
          </CardContent>
        </Card>
      </main>
    );
  }
  return children;
}
