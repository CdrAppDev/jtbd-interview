"use client";

import { useFormState, useFormStatus } from "react-dom";
import { startInterview, type StartState } from "@/lib/interview";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? "Starting…" : "Start the interview"}</button>;
}

export default function StartForm({ token, defaultRole }: { token: string; defaultRole: string }) {
  const [state, action] = useFormState<StartState, FormData>(startInterview.bind(null, token), {});
  return (
    <form action={action} className="stack">
      <div className="field">
        <label htmlFor="role">Your role</label>
        <input id="role" name="role" type="text" required defaultValue={defaultRole} />
        <p className="hint">Change this if it doesn't describe what you do.</p>
      </div>
      <div className="field">
        <label htmlFor="name">Your name (optional)</label>
        <input id="name" name="name" type="text" autoComplete="name" />
      </div>
      {state.error && <p className="err">{state.error}</p>}
      <div><Submit /></div>
    </form>
  );
}
