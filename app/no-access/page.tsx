export default function NoAccess() {
  return (
    <main className="wrap stack">
      <div className="eyebrow">No access</div>
      <h1 style={{ fontSize: "clamp(28px, 4.5vw, 40px)" }}>This email doesn't have access.</h1>
      <p className="muted" style={{ maxWidth: "56ch" }}>If you were expecting to sign in, ask the person who set up your interview.</p>
      <form method="post" action="/logout"><button className="btn ghost" type="submit">Sign out</button></form>
    </main>
  );
}
