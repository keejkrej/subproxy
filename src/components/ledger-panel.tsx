"use client";

import { useEffect, useState } from "react";
import type { LedgerRow } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function LedgerPanel() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ledger")
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error ?? "failed");
        setRows(json.ledger);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t load ledger</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono">{row.issuedKeyPrefix ?? "—"}</TableCell>
                  <TableCell className="font-mono">{row.model}</TableCell>
                  <TableCell>
                    <Badge variant={row.status >= 400 ? "destructive" : "default"}>{row.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {row.latencyMs != null ? `${row.latencyMs}ms` : "—"}
                  </TableCell>
                  <TableCell className="max-w-sm truncate text-muted-foreground">{row.error ?? "—"}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No gateway requests yet.
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
