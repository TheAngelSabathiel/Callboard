"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRows } from "@/lib/useRows";
import type { Character, Member, MemberRole, Production } from "@/lib/types";
import { canEdit, isHead } from "@/lib/roles";

type Ctx = {
  production: Production;
  setProduction: (p: Production) => void;
  userId: string;
  me: Member | null;
  role: MemberRole | null;
  canEdit: boolean;
  isHead: boolean;
  members: ReturnType<typeof useRows<Member>>;
  characters: ReturnType<typeof useRows<Character>>;
  memberName: (id?: string | null) => string;
};

const ProductionCtx = createContext<Ctx | null>(null);

export function useProduction() {
  const c = useContext(ProductionCtx);
  if (!c) throw new Error("useProduction must be used inside ProductionProvider");
  return c;
}

export function ProductionProvider({ productionId, children }: { productionId: string; children: React.ReactNode }) {
  const [production, setProduction] = useState<Production | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const members = useRows<Member>("members", productionId, {
    order: [{ column: "sort_order" }, { column: "display_name" }],
  });
  const characters = useRows<Character>("characters", productionId, {
    order: [{ column: "sort_order" }, { column: "name" }],
  });

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const { data: u } = await sb.auth.getUser();
      setUserId(u.user?.id ?? null);
      const { data, error } = await sb.from("productions").select("*").eq("id", productionId).single();
      if (error) setErr(error.message);
      else setProduction(data as Production);
    })();
  }, [productionId]);

  const me = useMemo(() => members.rows.find((m) => m.user_id === userId) ?? null, [members.rows, userId]);

  const value = useMemo<Ctx | null>(() => {
    if (!production || !userId) return null;
    const role = me?.role ?? null;
    return {
      production,
      setProduction,
      userId,
      me,
      role,
      canEdit: canEdit(role),
      isHead: isHead(role),
      members,
      characters,
      memberName: (id) => members.rows.find((m) => m.id === id)?.display_name ?? "",
    };
  }, [production, userId, me, members, characters]);

  if (err) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <div className="card p-6">
          <h1 className="text-lg font-bold">Production unavailable</h1>
          <p className="mt-2 text-sm text-ink-mute">
            You may not be a member of this production, or it was deleted. ({err})
          </p>
          <a href="/dashboard" className="btn mt-4">Back to dashboard</a>
        </div>
      </div>
    );
  }
  if (!value) return <div className="p-8 text-sm text-ink-mute">Loading production…</div>;
  return <ProductionCtx.Provider value={value}>{children}</ProductionCtx.Provider>;
}
