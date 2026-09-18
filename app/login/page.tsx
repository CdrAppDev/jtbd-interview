import { redirect } from "next/navigation";
import { getUser, isAdmin, membershipOf } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: { error?: string } }) {
  const user = await getUser();
  if (user) {
    if (await isAdmin()) redirect("/admin");
    if (await membershipOf(user.id)) redirect("/org");
    redirect("/no-access");
  }
  return (
    <main className="wrap stack-lg">
      <header className="stack">
        <div className="eyebrow">Sign in</div>
        <h1 style={{ fontSize: "clamp(28px, 4.5vw, 40px)" }}>Enter your email and we'll send you a link.</h1>
        {searchParams.error && <p className="err">That link didn't work. It may have expired, or been opened in a different browser. Ask for a new one.</p>}
      </header>
      <section className="section">
        <LoginForm />
      </section>
    </main>
  );
}
