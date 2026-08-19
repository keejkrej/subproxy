"use client";

import { useEffect, useState } from "react";
import { PROVIDERS, type ModelSummary, type ProviderId } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const selectClassName = cn(
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
);

function ProviderSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: ProviderId;
  onChange: (value: ProviderId) => void;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      className={selectClassName}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ProviderId)}
    >
      {PROVIDERS.map((provider) => (
        <option key={provider} value={provider}>
          {provider}
        </option>
      ))}
    </select>
  );
}

export function ModelsPanel() {
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ProviderId>("chatgpt");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftProvider, setDraftProvider] = useState<ProviderId>("chatgpt");

  async function reload() {
    const response = await fetch("/api/models");
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? "failed to load models");
    setModels(json.models);
  }

  useEffect(() => {
    fetch("/api/models")
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error ?? "failed to load models");
        setModels(json.models);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function create() {
    setBusy("create");
    setError(null);
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, provider }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "create failed");
      setName("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "create failed");
    } finally {
      setBusy(null);
    }
  }

  function startEdit(model: ModelSummary) {
    setEditingId(model.id);
    setDraftName(model.name);
    setDraftProvider(model.provider);
    setError(null);
  }

  async function save(id: string) {
    setBusy(`save-${id}`);
    setError(null);
    try {
      const response = await fetch(`/api/models/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName, provider: draftProvider }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "update failed");
      setEditingId(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(`del-${id}`);
    setError(null);
    try {
      const response = await fetch(`/api/models/${id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "delete failed");
      if (editingId === id) setEditingId(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function test(id: string) {
    setBusy(`test-${id}`);
    setError(null);
    try {
      const response = await fetch(`/api/models/${id}/test`, { method: "POST" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "test failed");
      if (json.result && json.result.ok === false && json.result.error) {
        setError(json.result.error);
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "test failed");
      await reload().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="model-name">Model name</Label>
          <Input
            id="model-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="chatgpt/gpt-5.6-terra"
          />
        </div>
        <div className="grid w-full gap-1.5 sm:w-40">
          <Label htmlFor="model-provider">Provider</Label>
          <ProviderSelect id="model-provider" value={provider} onChange={setProvider} />
        </div>
        <Button onClick={create} disabled={busy !== null || !name.trim()}>
          Add model
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t update models</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Last test</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((model) => {
                const editing = editingId === model.id;
                return (
                  <TableRow key={model.id}>
                    <TableCell>
                      {editing ? (
                        <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
                      ) : (
                        <span className="font-mono text-sm">{model.name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <ProviderSelect value={draftProvider} onChange={setDraftProvider} />
                      ) : (
                        <span className="font-mono text-muted-foreground">{model.provider}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs text-muted-foreground">
                      {model.lastTestedAt ? (
                        <div className="space-y-0.5">
                          <div className="font-mono text-xs">
                            {new Date(model.lastTestedAt).toLocaleString()}
                          </div>
                          <div className="truncate text-xs">{model.lastError ?? "ok"}</div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {editing ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => save(model.id)}
                              disabled={busy !== null || !draftName.trim()}
                            >
                              Save
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} disabled={busy !== null}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(model)}
                            disabled={busy !== null}
                          >
                            Edit
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => test(model.id)}
                          disabled={busy !== null}
                        >
                          Test
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => remove(model.id)}
                          disabled={busy !== null}
                        >
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {models.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    No models yet. Add a name and provider.
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
