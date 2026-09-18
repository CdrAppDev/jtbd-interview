import { requireAdmin } from "@/lib/auth";

export default async function AdminHome() {
  const user = await requireAdmin();
  return (
    <main className="wrap stack">
      <div className="eyebrow">Admin</div>
      <h1>Signed in as {user.email}.</h1>
      <p className="muted">Organizations and jobs arrive in the next step.</p>
    </main>
  );
}
