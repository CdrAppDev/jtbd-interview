import { requireAdmin } from "@/lib/auth";
import NavBar from "@/components/NavBar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <>
      <NavBar home="/admin" label="Organizations" email={user.email ?? ""} />
      {children}
    </>
  );
}
