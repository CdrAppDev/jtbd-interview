import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServer } from "./supabase-server";

export async function getUser() {
  const { data } = await supabaseServer().auth.getUser();
  return data.user;
}

export async function isAdmin() {
  const { data } = await supabaseServer().rpc("is_admin");
  return data === true;
}

export async function requireAdmin() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!(await isAdmin())) redirect("/no-access");
  return user;
}

export async function membershipOf(userId: string) {
  const { data } = await supabaseServer()
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data as { organization_id: string; role: string } | null;
}

export async function requireMembership() {
  const user = await getUser();
  if (!user) redirect("/login");
  const m = await membershipOf(user.id);
  if (!m) redirect("/no-access");
  return { user, organizationId: m.organization_id };
}

export function siteUrl() {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
