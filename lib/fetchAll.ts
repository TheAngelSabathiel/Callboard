"use client";
import { supabaseBrowser } from "./supabase/client";

/** Fetch every row matching column=value, paging past the PostgREST 1000-row cap. */
export async function fetchAll<T>(table: string, column: string, value: string, order: string, select = "*"): Promise<T[]> {
  const sb = supabaseBrowser();
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; from < 200_000; from += PAGE) {
    const { data, error } = await sb.from(table).select(select).eq(column, value).order(order).range(from, from + PAGE - 1);
    if (error) throw error;
    const chunk = (data as unknown as T[]) ?? [];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return out;
}

/** Insert rows in chunks to stay under request size limits. */
export async function insertChunked(table: string, rows: Record<string, unknown>[], size = 500, onProgress?: (done: number) => void) {
  const sb = supabaseBrowser();
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await sb.from(table).insert(rows.slice(i, i + size));
    if (error) throw error;
    onProgress?.(Math.min(rows.length, i + size));
  }
}
