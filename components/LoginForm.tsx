"use client";

import { useFormState, useFormStatus } from "react-dom";
import { sendLink, type LoginState } from "@/app/login/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending}>{pending ? "Sending…" : "Send me a link"}</button>;
}

export default function LoginForm() {
  const [state, action] = useFormState<LoginState, FormData>(sendLink, {});
  if (state.sent) return <p>Check your email for a sign-in link. Open it in this browser.</p>;
  return (
    <form action={action} className="stack">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state.error && <p className="err">{state.error}</p>}
      <div><Submit /></div>
    </form>
  );
}
