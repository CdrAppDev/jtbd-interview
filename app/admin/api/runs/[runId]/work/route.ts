import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";
import { runNextUnit } from "@/lib/engine/run";

// One unit of work per call, inside one serverless invocation. The page
// holding the run open calls this repeatedly, as the signed-in admin, so row
// level security applies exactly as it does everywhere else. The request body
// is ignored: what may be read comes from the run row alone.

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { runId: string } }) {
  await requireAdmin();
  try {
    const state = await runNextUnit(supabaseServer(), params.runId);
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json({ status: "failed", done: 0, total: 0, label: "", error: e instanceof Error ? e.message : "The run stopped." }, { status: 200 });
  }
}
