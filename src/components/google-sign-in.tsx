"use client";

import { useSignIn } from "@clerk/nextjs";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function GoogleSignIn() {
  const { signIn, fetchStatus, errors } = useSignIn();
  const [error, setError] = useState<string | null>(null);
  const busy = fetchStatus === "fetching";

  async function startGoogle() {
    if (!signIn) return;
    setError(null);
    const result = await signIn.sso({
      strategy: "oauth_google",
      redirectUrl: "/",
      redirectCallbackUrl: "/sign-in/sso-callback",
    });
    if (result.error) {
      setError(result.error.message);
    }
  }

  const message = error ?? errors.global?.[0]?.message ?? null;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle>Sign in to subproxy</CardTitle>
        <CardDescription>Google only. Restricted to ctyjackcao@gmail.com.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button className="w-full" onClick={() => void startGoogle()} disabled={!signIn || busy} type="button">
          {busy ? "Redirecting…" : "Continue with Google"}
        </Button>
        {message ? (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
