"use client";

import { useEffect, useState } from "react";
import type { IssuedKeySummary } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function KeysPanel({ appUrl }: { appUrl: string }) {
  const [keys, setKeys] = useState<IssuedKeySummary[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [name, setName] = useState("default");
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const response = await fetch("/api/keys");
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? "failed");
    setKeys(json.keys);
  }

  useEffect(() => {
    fetch("/api/keys")
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error ?? "failed");
        setKeys(json.keys);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function create() {
    setError(null);
    const response = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error ?? "create failed");
      return;
    }
    setSecret(json.key.secret);
    await reload();
  }

  async function revoke(id: string) {
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="font-mono text-xs text-muted-foreground">
          <div>OPENAI_BASE_URL={appUrl}/v1</div>
          <div>OPENAI_API_KEY=&lt;issued key&gt;</div>
        </CardContent>
      </Card>

      <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="key-name">Key name</Label>
          <Input
            id="key-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="default"
          />
        </div>
        <Button onClick={create}>Create key</Button>
      </div>

      {secret ? (
        <Alert>
          <AlertTitle>Shown once</AlertTitle>
          <AlertDescription>
            <code className="mt-1 block break-all font-mono text-foreground">{secret}</code>
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t update keys</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>{key.name}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{key.prefix}…</TableCell>
                  <TableCell>
                    <Badge variant={key.revokedAt ? "destructive" : "default"}>
                      {key.revokedAt ? "revoked" : "active"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {!key.revokedAt ? (
                      <Button variant="destructive" size="sm" onClick={() => revoke(key.id)}>
                        Revoke
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {keys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No issued keys yet.
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
