"use client";
import { useMemo } from "react";
import { useRows } from "./useRows";
import type { Availability, EventBlock, ProdEvent } from "./types";

export function useSchedule(productionId: string) {
  const events = useRows<ProdEvent>("events", productionId, { order: [{ column: "date" }, { column: "start_time" }] });
  const blocks = useRows<EventBlock>("event_blocks", productionId, { order: [{ column: "sort_order" }, { column: "start_time" }] });
  const availability = useRows<Availability>("availability", productionId, { order: [{ column: "date" }] });

  const byDate = useMemo(() => {
    const m = new Map<string, ProdEvent[]>();
    events.rows.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    return m;
  }, [events.rows]);

  const blocksByEvent = useMemo(() => {
    const m = new Map<string, EventBlock[]>();
    blocks.rows.forEach((b) => m.set(b.event_id, [...(m.get(b.event_id) ?? []), b]));
    m.forEach((list, k) => m.set(k, [...list].sort((a, b) => (a.sort_order - b.sort_order) || String(a.start_time).localeCompare(String(b.start_time)))));
    return m;
  }, [blocks.rows]);

  const availByDate = useMemo(() => {
    const m = new Map<string, Availability[]>();
    availability.rows.forEach((a) => m.set(a.date, [...(m.get(a.date) ?? []), a]));
    return m;
  }, [availability.rows]);

  return { events, blocks, availability, byDate, blocksByEvent, availByDate };
}
