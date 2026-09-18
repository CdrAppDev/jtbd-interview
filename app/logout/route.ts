import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  await supabaseServer().auth.signOut();
  return NextResponse.redirect(new URL("/login", new URL(req.url).origin), { status: 303 });
}
