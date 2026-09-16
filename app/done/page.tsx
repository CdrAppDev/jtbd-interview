export default function Done() {
  return (
    <main className="wrap stack">
      <div className="eyebrow">Interview complete</div>
      <h1 style={{ fontSize: "clamp(28px, 4.5vw, 40px)" }}>Thanks. That's the whole job.</h1>
      <p className="muted" style={{ maxWidth: "56ch" }}>
        Your answers are saved. Once everyone has been through it, the results page shows where the friction is and which data the job actually depends on.
      </p>
      <p><a href="/results">See the results so far</a></p>
    </main>
  );
}
