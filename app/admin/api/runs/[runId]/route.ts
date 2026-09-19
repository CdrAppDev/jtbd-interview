import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";
import { stateOf } from "@/lib/engine/run";
import type { EngineRun } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  await requireAdmin();
  const db = supabaseServer();
  const { data } = await db.from("engine_runs").select("*").eq("id", params.runId).maybeSingle<EngineRun>();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(await stateOf(db, data));
}
