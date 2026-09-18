"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { siteUrl } from "@/lib/auth";

export type LoginState = { sent?: boolean; error?: string };

export async function sendLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email." };
  const { error } = await supabaseServer().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) return { error: "Couldn't send the link. Try again in a minute." };
  return { sent: true };
}
