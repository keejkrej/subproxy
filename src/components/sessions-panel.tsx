"use client";

import { useEffect, useState } from "react";
import { HealthDot } from "./health-dot";
import type { ProviderId, SessionSummary } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ReauthState = {
  pendingId: string;
  userCode: string;
  verificationUrl: string;
  provider: ProviderId;
};

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState<ReauthState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    const response = await fetch("/api/sessions");
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? "failed to load sessions");
    setSessions(json.sessions);
  }

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!reauth) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/sessions/reauth/${reauth.pendingId}`);
      const json = await response.json();
      if (json.status === "complete") {
        setReauth(null);
        await reload();
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [reauth]);

  async function startReauth(provider: ProviderId, sessionId?: string) {
    setBusy(`reauth-${provider}`);
    setError(null);
    try {
      const response = await fetch("/api/sessions/reauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, sessionId }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "reauth failed");
      setReauth({
        pendingId: json.pendingId,
        userCode: json.userCode,
        verificationUrl: json.verificationUrl,
        provider,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "reauth failed");
    } finally {
      setBusy(null);
    }
  }

  async function test(id: string) {
    setBusy(`test-${id}`);
    try {
      await fetch(`/api/sessions/${id}/test`, { method: "POST" });
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(`del-${id}`);
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      await reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => startReauth("chatgpt")} disabled={busy !== null}>
          Connect ChatGPT
        </Button>
        <Button variant="outline" onClick={() => startReauth("grok")} disabled={busy !== null}>
          Connect Grok
        </Button>
        <Button variant="outline" onClick={() => startReauth("cursor")} disabled={busy !== null}>
          Connect Cursor
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t update sessions</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {reauth ? (
        <Card>
          <CardHeader>
            <CardTitle>Approve {reauth.provider}</CardTitle>
            <CardDescription>This page polls until the session is written.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {reauth.userCode ? (
              <p className="font-mono text-2xl tracking-[0.2em]">{reauth.userCode}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Approve Cursor in the opened browser tab.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <a href={reauth.verificationUrl} target="_blank" rel="noreferrer">
                <Button type="button">Open approval page</Button>
              </a>
              <Button variant="ghost" type="button" onClick={() => setReauth(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Identity</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Last error</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="font-mono">{session.provider}</TableCell>
                  <TableCell className="text-muted-foreground">{session.identity ?? session.label}</TableCell>
                  <TableCell>
                    <HealthDot health={session.health} />
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {session.expiresAt ? new Date(session.expiresAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{session.lastError ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => test(session.id)}
                        disabled={busy === `test-${session.id}`}
                      >
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startReauth(session.provider, session.id)}
                        disabled={busy !== null}
                      >
                        Re-auth
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => revoke(session.id)}>
                        Revoke
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No sessions yet. Connect a provider.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
