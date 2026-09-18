export default function Done() {
  return (
    <main className="wrap stack">
      <div className="eyebrow">Interview complete</div>
      <h1 style={{ fontSize: "clamp(28px, 4.5vw, 40px)" }}>Thanks. That's the whole job.</h1>
      <p className="muted" style={{ maxWidth: "56ch" }}>Your answers are saved.</p>
    </main>
  );
}
