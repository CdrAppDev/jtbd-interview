"use client";

import { useFormState, useFormStatus } from "react-dom";
import { startInterview, type StartState } from "@/lib/interview";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? "Starting…" : "Start the interview"}</button>;
}

export default function StartForm({ token }: { token: string }) {
  const [state, action] = useFormState<StartState, FormData>(startInterview.bind(null, token), {});
  return (
    <form action={action} className="stack">
      <div className="field">
        <label htmlFor="role">Your role</label>
        <input id="role" name="role" type="text" required placeholder="What you do, not your title. For example: delivery lead, account executive" />
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
