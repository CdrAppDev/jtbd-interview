import Link from "next/link";

export default function NavBar({ home, label, email }: { home: string; label: string; email: string }) {
  return (
    <nav className="nav-bar">
      <Link href={home} className="brand">{label}</Link>
      <span className="muted small">{email}</span>
      <form method="post" action="/logout"><button className="btn ghost small" type="submit">Sign out</button></form>
    </nav>
  );
}
