import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { databaseUrl } from "@/lib/env";
import { ensureSchema } from "./ensure";
import * as schema from "./schema";

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;

export async function db() {
  await ensureSchema();
  if (!cached) {
    cached = drizzle(neon(databaseUrl()), { schema });
  }
  return cached;
}

export { schema };
