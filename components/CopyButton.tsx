"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      window.prompt("Copy this link", text);
    }
  }
  return <button type="button" className="btn ghost small" onClick={copy}>{done ? "Copied" : "Copy link"}</button>;
}
