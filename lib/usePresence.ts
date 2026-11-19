"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "./supabase/client";

export type Presence = { user_id: string; name: string; section?: string | null; at: number };

/** Lightweight presence: who has this report open and which section they're typing in. */
export function usePresence(room: string, me: { user_id: string; name: string }) {
  const [others, setOthers] = useState<Presence[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chRef = useRef<any>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel(`presence:${room}`, { config: { presence: { key: me.user_id } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, Presence[]>;
      const list: Presence[] = [];
      Object.entries(state).forEach(([key, metas]) => {
        if (key === me.user_id) return;
        const last = metas[metas.length - 1];
        if (last) list.push(last);
      });
      setOthers(list);
    });
    ch.subscribe(async (status: string) => {
      if (status === "SUBSCRIBED") await ch.track({ user_id: me.user_id, name: me.name, section: null, at: Date.now() });
    });
    chRef.current = ch;
    return () => { sb.removeChannel(ch); };
  }, [room, me.user_id, me.name]);

  const focus = (section: string | null) => {
    chRef.current?.track({ user_id: me.user_id, name: me.name, section, at: Date.now() });
  };
  return { others, focus };
}
