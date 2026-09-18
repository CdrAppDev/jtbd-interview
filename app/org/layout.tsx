import { requireMembership } from "@/lib/auth";
import NavBar from "@/components/NavBar";

export const dynamic = "force-dynamic";

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireMembership();
  return (
    <>
      <NavBar home="/org" label="Your interviews" email={user.email ?? ""} />
      {children}
    </>
  );
}
