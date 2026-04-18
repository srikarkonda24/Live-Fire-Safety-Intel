"use client";

import { useEffect, useState } from "react";

function formatLocal() {
  const d = new Date();
  return {
    date: new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d),
    time: new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(d),
  };
}

export function LiveTimestamp() {
  const [stamp, setStamp] = useState<ReturnType<typeof formatLocal> | null>(
    null,
  );

  useEffect(() => {
    setStamp(formatLocal());
    const id = window.setInterval(() => setStamp(formatLocal()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="pointer-events-none rounded border border-white/10 bg-black/70 px-3 py-2 font-mono text-[11px] text-zinc-200 shadow-lg backdrop-blur-md">
      <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
        Local
      </div>
      <div className="text-xs text-zinc-100">{stamp?.date ?? "…"}</div>
      <div className="text-lg font-bold tabular-nums tracking-tight text-orange-200">
        {stamp?.time ?? "—:—:—"}
      </div>
    </div>
  );
}
