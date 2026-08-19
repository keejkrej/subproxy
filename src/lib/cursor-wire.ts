import { createHash } from "node:crypto";
import http2 from "node:http2";
import { gunzipSync } from "node:zlib";

export const CURSOR_API_BASE = (process.env.CURSOR_API_BASE_URL ?? "https://api2.cursor.sh").replace(
  /\/$/,
  "",
);
const CHAT_PATH = "/aiserver.v1.ChatService/StreamUnifiedChatWithTools";
const MODELS_PATH = "/aiserver.v1.AiService/AvailableModels";
const CLIENT_VERSION = process.env.CURSOR_CLIENT_VERSION ?? "cli-2026.07.09-a3815c0";
const URL_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export type CursorChatMessage = { role: string; content: string };

function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let next = value >>> 0;
  while (next >= 0x80) {
    bytes.push((next & 0x7f) | 0x80);
    next >>>= 7;
  }
  bytes.push(next);
  return Uint8Array.from(bytes);
}

function concat(parts: ArrayLike<number>[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function varintField(field: number, value: number): Uint8Array {
  return concat([encodeVarint((field << 3) | 0), encodeVarint(value)]);
}

function bytesField(field: number, value: Uint8Array | string): Uint8Array {
  const payload = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return concat([encodeVarint((field << 3) | 2), encodeVarint(payload.length), payload]);
}

export function connectFrame(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(5 + payload.length);
  frame[0] = 0;
  new DataView(frame.buffer).setUint32(1, payload.length, false);
  frame.set(payload, 5);
  return frame;
}

function encodeChatMessage(content: string, role: number, messageId: string): Uint8Array {
  return concat([
    bytesField(1, content),
    varintField(2, role),
    bytesField(13, messageId),
    varintField(47, 2),
  ]);
}

function encodeModel(modelName: string): Uint8Array {
  return concat([bytesField(1, modelName), bytesField(4, new Uint8Array(0))]);
}

export function encodeCursorChatRequest(input: {
  model: string;
  messages: CursorChatMessage[];
}): Uint8Array {
  const model = input.model.trim() || "composer-2.5";
  const conversationId = crypto.randomUUID();
  const ids: { id: string; role: number }[] = [];
  const parts: Uint8Array[] = [];

  const system = input.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .filter(Boolean)
    .join("\n");
  let firstUser = true;
  for (const message of input.messages) {
    if (message.role === "system") continue;
    const role = message.role === "assistant" ? 2 : 1;
    const id = crypto.randomUUID();
    ids.push({ id, role });
    const text =
      firstUser && role === 1 && system ? `System:\n${system}\n\n${message.content}` : message.content;
    if (role === 1) firstUser = false;
    parts.push(bytesField(1, encodeChatMessage(text, role, id)));
  }
  if (parts.length === 0) {
    const id = crypto.randomUUID();
    ids.push({ id, role: 1 });
    parts.push(bytesField(1, encodeChatMessage(system || ".", 1, id)));
  }

  let request = concat(parts);
  request = concat([
    request,
    varintField(2, 1),
    bytesField(3, new Uint8Array(0)),
    varintField(4, 1),
    bytesField(5, encodeModel(model)),
    bytesField(8, ""),
    varintField(13, 1),
    varintField(19, 1),
    bytesField(23, conversationId),
    varintField(27, 1),
  ]);
  for (const entry of ids) {
    request = concat([
      request,
      bytesField(30, concat([bytesField(1, entry.id), varintField(3, entry.role)])),
    ]);
  }
  request = concat([
    request,
    varintField(35, 0),
    varintField(38, 0),
    varintField(46, 2),
    bytesField(47, ""),
    varintField(48, 0),
    varintField(49, 0),
    varintField(51, 0),
    varintField(53, 1),
    bytesField(54, "agent"),
  ]);
  return connectFrame(bytesField(1, request));
}

function jyhEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += URL_SAFE[a >> 2];
    out += URL_SAFE[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < bytes.length) out += URL_SAFE[((b & 15) << 2) | (c >> 6)];
    if (i + 2 < bytes.length) out += URL_SAFE[c & 63];
  }
  return out;
}

export function cursorChecksum(token: string): string {
  const machineId = createHash("sha256").update(`${token}machineId`).digest("hex");
  const timestamp = Math.floor(Date.now() / 1_000_000);
  const buf = Uint8Array.from([
    (timestamp >>> 40) & 0xff,
    (timestamp >>> 32) & 0xff,
    (timestamp >>> 24) & 0xff,
    (timestamp >>> 16) & 0xff,
    (timestamp >>> 8) & 0xff,
    timestamp & 0xff,
  ]);
  let prev = 165;
  for (let i = 0; i < buf.length; i++) {
    buf[i] = ((buf[i]! ^ prev) + (i % 256)) & 0xff;
    prev = buf[i]!;
  }
  return `${jyhEncode(buf)}${machineId}`;
}

export function cursorHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/connect+proto",
    accept: "application/connect+proto",
    "connect-protocol-version": "1",
    "user-agent": "connect-es/1.6.1",
    "x-cursor-checksum": cursorChecksum(token),
    "x-cursor-client-version": CLIENT_VERSION,
    "x-cursor-client-type": "cli",
    "x-ghost-mode": "true",
    "x-request-id": crypto.randomUUID(),
    "x-session-id": crypto.randomUUID(),
  };
}

export function http2Post(
  url: string,
  headers: Record<string, string>,
  body: Uint8Array,
  timeoutMs = 60_000,
): Promise<{ status: number; stream: ReadableStream<Uint8Array> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = http2.connect(parsed.origin);
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        client.close();
      } catch {
        /* ignore */
      }
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("Cursor HTTP/2 request timed out")), timeoutMs);
    timer.unref?.();

    const h2Headers: http2.OutgoingHttpHeaders = {
      ":method": "POST",
      ":path": `${parsed.pathname}${parsed.search}`,
    };
    for (const [key, value] of Object.entries(headers)) h2Headers[key.toLowerCase()] = value;

    const req = client.request(h2Headers);
    client.on("error", fail);
    req.on("error", fail);
    req.on("response", (responseHeaders) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const status = Number(responseHeaders[":status"] || 0);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          req.on("data", (chunk: Buffer) => {
            try {
              controller.enqueue(new Uint8Array(chunk));
            } catch {
              /* cancelled */
            }
          });
          req.on("end", () => {
            try {
              controller.close();
            } catch {
              /* ignore */
            }
            try {
              client.close();
            } catch {
              /* ignore */
            }
          });
          req.on("error", (error) => {
            try {
              controller.error(error);
            } catch {
              /* ignore */
            }
          });
        },
        cancel() {
          try {
            req.close(http2.constants.NGHTTP2_CANCEL);
          } catch {
            /* ignore */
          }
          try {
            client.close();
          } catch {
            /* ignore */
          }
        },
      });
      resolve({ status, stream });
    });
    req.end(Buffer.from(body));
  });
}

function decodeVarint(data: Uint8Array, pos: number): [number, number] {
  let value = 0;
  let shift = 0;
  while (pos < data.length) {
    const byte = data[pos++]!;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [value, pos];
}

type ProtoField = { field: number; wireType: number; bytes?: Uint8Array; varint?: number };

export function parseProtoFields(data: Uint8Array): ProtoField[] {
  const out: ProtoField[] = [];
  let pos = 0;
  while (pos < data.length) {
    const [tag, afterTag] = decodeVarint(data, pos);
    if (afterTag <= pos) break;
    pos = afterTag;
    const field = tag >> 3;
    const wireType = tag & 7;
    if (wireType === 0) {
      const [value, next] = decodeVarint(data, pos);
      out.push({ field, wireType, varint: value });
      pos = next;
    } else if (wireType === 2) {
      const [len, afterLen] = decodeVarint(data, pos);
      pos = afterLen;
      if (len < 0 || pos + len > data.length) break;
      out.push({ field, wireType, bytes: data.subarray(pos, pos + len) });
      pos += len;
    } else if (wireType === 1) pos += 8;
    else if (wireType === 5) pos += 4;
    else break;
  }
  return out;
}

function printable(text: string): boolean {
  return /^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]+$/.test(text);
}

function extractInnerText(payload: Uint8Array, depth = 0): string {
  if (depth > 4) return "";
  const fields = parseProtoFields(payload);
  const candidate = fields.find((field) => field.field === 1 && field.wireType === 2 && field.bytes);
  if (candidate?.bytes) {
    const text = new TextDecoder().decode(candidate.bytes);
    if (printable(text) && !/^[0-9a-f-]{32,}$/i.test(text.trim())) return text;
  }
  let acc = "";
  for (const field of fields) {
    if (field.wireType !== 2 || !field.bytes || field.bytes.length < 2) continue;
    const wire = field.bytes[0]! & 0x07;
    if (field.bytes[0] === 0 || (wire !== 0 && wire !== 1 && wire !== 2 && wire !== 5)) continue;
    acc += extractInnerText(field.bytes, depth + 1);
  }
  return acc;
}

export function extractCursorText(payload: Uint8Array): { text: string; reasoning: string } {
  const fields = parseProtoFields(payload);
  let text = "";
  let reasoning = "";
  for (const field of fields) {
    if (field.wireType !== 2 || !field.bytes) continue;
    if (field.field === 25) reasoning += extractInnerText(field.bytes);
    else if (field.field === 1) {
      const direct = new TextDecoder().decode(field.bytes);
      if (printable(direct) && !/^[0-9a-f-]{32,}$/i.test(direct.trim())) text += direct;
    } else if (field.bytes.length > 1) {
      const nested = extractCursorText(field.bytes);
      text += nested.text;
      reasoning += nested.reasoning;
    }
  }
  return { text, reasoning };
}

function jsonError(payload: Uint8Array): string | undefined {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as {
      error?: { code?: string; message?: string };
    };
    const code = parsed.error?.code;
    const message = parsed.error?.message;
    if (code || message) return [code, message].filter(Boolean).join(" — ");
  } catch {
    /* not json */
  }
  return undefined;
}

export function createCursorDecoder() {
  let buffer = new Uint8Array(0);
  return {
    feed(chunk: Uint8Array): { text: string; error?: string }[] {
      const merged = new Uint8Array(buffer.length + chunk.length);
      merged.set(buffer);
      merged.set(chunk, buffer.length);
      buffer = merged;
      const out: { text: string; error?: string }[] = [];
      let pos = 0;
      while (pos + 5 <= buffer.length) {
        const type = buffer[pos]!;
        const length = new DataView(buffer.buffer, buffer.byteOffset + pos + 1, 4).getUint32(0, false);
        if (pos + 5 + length > buffer.length) break;
        let payload = buffer.subarray(pos + 5, pos + 5 + length);
        pos += 5 + length;
        try {
          if (type === 1 || type === 3) payload = new Uint8Array(gunzipSync(payload));
        } catch {
          /* keep raw */
        }
        if (type === 0 || type === 1) {
          const extracted = extractCursorText(payload);
          const text = extracted.text || (extracted.reasoning.includes("</think>")
            ? extracted.reasoning.split(/<\/think>\s*/i).slice(1).join("")
            : "");
          if (text) out.push({ text });
        } else if (type === 2 || type === 3) {
          const error = jsonError(payload);
          if (error) out.push({ text: "", error });
        }
      }
      buffer = buffer.subarray(pos);
      return out;
    },
  };
}

export async function cursorAvailableModels(token: string): Promise<string[]> {
  const response = await fetch(`${CURSOR_API_BASE}${MODELS_PATH}`, {
    method: "POST",
    headers: {
      ...cursorHeaders(token),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      includeLongContextModels: true,
      useModelParameters: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`Cursor AvailableModels failed (${response.status})`);
  }
  const json = (await response.json()) as { models?: Array<{ name?: string; serverModelName?: string }> };
  const ids = (json.models ?? [])
    .map((model) => (model.serverModelName || model.name || "").trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

export async function streamCursorChat(input: {
  token: string;
  model: string;
  messages: CursorChatMessage[];
}): Promise<ReadableStream<Uint8Array>> {
  const body = encodeCursorChatRequest({ model: input.model, messages: input.messages });
  const { status, stream } = await http2Post(
    `${CURSOR_API_BASE}${CHAT_PATH}`,
    cursorHeaders(input.token),
    body,
  );
  if (status !== 200) {
    const text = await new Response(stream).text().catch(() => "");
    throw new Error(`Cursor chat failed (${status})${text ? `: ${text.slice(0, 400)}` : ""}`);
  }
  return stream;
}
