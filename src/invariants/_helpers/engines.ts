// Helper compartilhado: factories dos dois engines para describe.each.
// Cada teste DB-touching importa este array e parametriza.

import type { Database } from "../../db/adapter.ts";
import { BetterSqlite3Adapter } from "../../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../../db/adapters/wa-sqlite-node.ts";

type AdapterFactory = (path: string) => Promise<Database>;

export const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

export type { Database };
