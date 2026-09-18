import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { membershipOf } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const db = supabaseServer();

  let ok = false;
  if (code) ok = !(await db.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash) ok = !(await db.auth.verifyOtp({ token_hash: tokenHash, type: "email" })).error;
  if (!ok) return NextResponse.redirect(new URL("/login?error=1", url.origin));

  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?error=1", url.origin));
  const { data: admin } = await db.rpc("is_admin");
  if (admin === true) return NextResponse.redirect(new URL("/admin", url.origin));
  if (await membershipOf(user.id)) return NextResponse.redirect(new URL("/org", url.origin));
  return NextResponse.redirect(new URL("/no-access", url.origin));
}
