"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Drives a run by asking the server for one unit at a time, and shows where
// it has got to. Closing the page pauses the run; coming back resumes it.

type State = { status: "running" | "done" | "failed"; done: number; total: number; label: string; error: string | null };

export default function RunProgress({ runId, initial }: { runId: string; initial: State }) {
  const [state, setState] = useState<State>(initial);
  const [working, setWorking] = useState(initial.status === "running");
  const router = useRouter();
  const running = useRef(false);

  const step = useCallback(async () => {
    const res = await fetch(`/admin/api/runs/${runId}/work`, { method: "POST" });
    return (await res.json()) as State;
  }, [runId]);

  useEffect(() => {
    if (!working || running.current) return;
    running.current = true;
    let stopped = false;
    (async () => {
      let now = state;
      while (!stopped && now.status === "running") {
        try {
          now = await step();
        } catch {
          now = { ...now, status: "failed", error: "Lost the connection to the server." };
        }
        if (!stopped) setState(now);
      }
      running.current = false;
      if (!stopped) {
        setWorking(false);
        if (now.status === "done") router.refresh();
      }
    })();
    return () => { stopped = true; running.current = false; };
    // Restarting is driven by `working` alone: state changes every unit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working, runId]);

  const pct = state.total ? Math.round((state.done / state.total) * 100) : 0;

  if (state.status === "failed") {
    return (
      <div className="stack" style={{ gap: 8 }}>
        <p className="notice">The run stopped: {state.error ?? "something went wrong."}</p>
        <div><button className="btn" onClick={() => { setState({ ...state, status: "running", error: null }); setWorking(true); }}>Resume</button></div>
      </div>
    );
  }

  if (state.status === "done") return <p className="muted">Done. Refresh if you do not see the results yet.</p>;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="progress">
        <div className="bar"><span style={{ width: `${pct}%` }} /></div>
        <span className="muted small">{state.done} of {state.total}</span>
      </div>
      <p className="muted small">{state.label || "Starting"}</p>
      <p className="hint">Keep this page open while it runs. If you close it, the run pauses until you come back.</p>
    </div>
  );
}
