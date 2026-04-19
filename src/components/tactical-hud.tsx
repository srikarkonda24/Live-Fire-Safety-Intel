"use client";

import { useState } from "react";
import type { SafetyBriefResponse } from "@/lib/briefing-reasoning-types";
import type { AddressBriefingAnchor, SafetyLevel } from "@/lib/briefing-presets";
import { LiveTimestamp } from "@/components/live-timestamp";

const R = 38;
const C = 2 * Math.PI * R;

/** Shared top offset so Intel + Met align (1.25rem = top-5). */
const HUD_TOP = "top-[1.25rem]";

const hudShell =
  "hud-panel font-tactical absolute z-[55] flex max-h-[min(calc(100vh-3rem),52rem)] flex-col overflow-hidden rounded-sm text-[8px] leading-tight text-zinc-300";

/** Wider + taller + larger type than MET panel */
const intelHudShell =
  "hud-panel font-tactical absolute z-[55] flex max-h-[min(calc(100vh-2.5rem),58rem)] flex-col overflow-hidden rounded-sm text-[10px] leading-snug text-zinc-300";

const hdr =
  "font-mono text-[6px] font-bold uppercase tracking-[0.1em] text-amber-500/80";

const intelHdr =
  "font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-amber-500/80";

const subHdr =
  "mb-0 font-mono text-[6px] font-bold uppercase tracking-[0.1em] text-zinc-500";

const intelSubHdr =
  "mb-0 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-zinc-500";

function ActionChevron() {
  return (
    <svg
      className="mt-0.5 h-2 w-2 shrink-0 text-amber-500/85"
      viewBox="0 0 8 8"
      aria-hidden
    >
      <path fill="currentColor" d="M1.5 0.5 L6.5 4 L1.5 7.5 z" />
    </svg>
  );
}

function RadialGauge({
  value,
  max,
  label,
  sub,
  gid,
}: {
  value: number;
  max: number;
  label: string;
  sub?: string;
  gid: string;
}) {
  const t = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const dash = C * t;
  return (
    <div className="flex w-[4.5rem] shrink-0 flex-col items-center gap-0.5">
      <svg
        viewBox="0 0 100 100"
        className="h-14 w-14 shrink-0 drop-shadow-[0_0_8px_rgba(251,191,36,0.2)]"
        aria-hidden
      >
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="#1e293b"
          strokeWidth="5"
        />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
          transform="rotate(-90 50 50)"
        />
        <polygon
          points="50,12 58,26 42,26"
          fill="#334155"
          stroke="#64748b"
          strokeWidth="0.5"
        />
      </svg>
      <p className="max-w-[4.5rem] text-center font-mono text-[6px] font-bold uppercase tracking-[0.1em] text-amber-400/85">
        {label}
      </p>
      <p className="font-mono text-xs font-bold tabular-nums text-amber-100 [text-shadow:0_0_8px_rgba(251,191,36,0.3)]">
        {Number.isFinite(value) ? Math.round(value) : "—"}
      </p>
      {sub ? (
        <p className="line-clamp-2 max-w-[4.5rem] text-center font-mono text-[6px] leading-tight text-zinc-500">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function smokeLoad01(safety: SafetyLevel): number {
  if (safety === "EXTREME") return 0.92;
  if (safety === "HIGH") return 0.72;
  if (safety === "MODERATE") return 0.45;
  return 0.18;
}

/** Thin border + backlit-style glow; no filled chip backgrounds */
function riskPillClass(risk: SafetyLevel): string {
  if (risk === "EXTREME" || risk === "HIGH")
    return "border-red-400/45 text-red-300 [text-shadow:0_0_10px_rgba(248,113,113,0.45)]";
  if (risk === "MODERATE")
    return "border-amber-400/50 text-amber-200 [text-shadow:0_0_12px_rgba(251,191,36,0.55),0_0_24px_rgba(245,158,11,0.2)]";
  return "border-emerald-400/45 text-emerald-200 [text-shadow:0_0_10px_rgba(52,211,153,0.4)]";
}

function demoEtaHoursLabel(etaMin: number | null): string | null {
  if (etaMin == null || !Number.isFinite(etaMin)) return null;
  const h = etaMin / 60;
  if (h >= 10) return `~${Math.round(h)} h`;
  const rounded = Math.round(h * 10) / 10;
  const s = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
  return `~${s} h`;
}

export type TacticalHudBriefing = {
  anchor: AddressBriefingAnchor;
  smoke: string;
  safety: SafetyLevel;
  miles: number | null;
  nearest: { name: string } | null;
  etaMin: number | null;
  advice: string | null;
  route: { summary: string; turnText: string[] };
};

export type TacticalHudProps = {
  briefing: TacticalHudBriefing | null;
  onRegenerateAi: () => void;
  onClearPin: () => void;
  geocoding: boolean;
  geocodeError: string | null;
  firesLoading: boolean;
  pinnedAnchor: AddressBriefingAnchor | null;
  safetyBrief: SafetyBriefResponse | null;
  safetyBriefUpdated: string | null;
  aiLoading: boolean;
  aiError: string | null;
};

export function TacticalHud({
  briefing,
  onRegenerateAi,
  onClearPin,
  geocoding,
  geocodeError,
  firesLoading,
  pinnedAnchor,
  safetyBrief,
  safetyBriefUpdated,
  aiLoading,
  aiError,
}: TacticalHudProps) {
  const [intelOpen, setIntelOpen] = useState(true);
  const [metOpen, setMetOpen] = useState(true);

  const displayRisk: SafetyLevel | null = safetyBrief
    ? safetyBrief.risk
    : briefing?.safety ?? null;

  const topActions = safetyBrief
    ? safetyBrief.recommendedActions.slice(0, 3)
    : [];

  return (
    <div className="pointer-events-none absolute inset-0 z-[50]">
      {!intelOpen ? (
        <button
          type="button"
          onClick={() => setIntelOpen(true)}
          className="pointer-events-auto absolute left-0 top-[42%] z-[56] flex h-16 w-7 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-r-sm border border-l-0 border-[rgba(255,255,255,0.1)] bg-black/30 px-0.5 font-tactical text-[9px] text-amber-500/90 shadow-md backdrop-blur-[20px] hover:bg-black/40 hover:text-amber-300"
          style={{ WebkitBackdropFilter: "blur(20px)" }}
          aria-label="Expand intelligence panel"
        >
          <span className="text-[10px] leading-none" aria-hidden>
            ▶
          </span>
          <span className="max-w-[2.5rem] text-center text-[6px] font-bold uppercase tracking-[0.1em] text-zinc-500">
            INTEL
          </span>
        </button>
      ) : null}

      {intelOpen ? (
        <div
          className={`${intelHudShell} left-5 w-[min(420px,calc(100vw-3rem))] ${HUD_TOP} ${aiLoading ? "intel-regen-pulse" : ""}`}
        >
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[rgba(255,255,255,0.1)] px-2.5 py-1.5">
            <div className="min-w-0 pt-0.5">
              <p className={`${intelHdr} text-amber-400/75`}>INTEL / CLAUDE</p>
              {displayRisk ? (
                <span
                  className={`mt-1 inline-flex rounded-full border bg-transparent px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${riskPillClass(displayRisk)}`}
                >
                  Risk · {displayRisk}
                </span>
              ) : (
                <span className="mt-1 inline-flex rounded-full border border-zinc-500/40 bg-transparent px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                  Risk · —
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <LiveTimestamp compact />
              <button
                type="button"
                onClick={() => setIntelOpen(false)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[rgba(255,255,255,0.12)] bg-transparent text-base leading-none text-zinc-400 hover:border-white/25 hover:text-zinc-100"
                aria-label="Minimize intelligence panel"
              >
                −
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-2.5 py-1.5">
            <p className="text-[9px] leading-snug text-zinc-500">
              Pin from{" "}
              <span className="text-amber-500/75">location</span> below.
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {briefing ? (
                <button
                  type="button"
                  onClick={onRegenerateAi}
                  disabled={aiLoading || geocoding || firesLoading}
                  className="rounded border border-[rgba(255,255,255,0.12)] bg-transparent px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-300 hover:border-white/20 disabled:opacity-40"
                >
                  {aiLoading ? "Regenerating…" : "Regen AI"}
                </button>
              ) : null}
              {pinnedAnchor ? (
                <button
                  type="button"
                  onClick={onClearPin}
                  className="rounded border border-[rgba(255,255,255,0.1)] bg-transparent px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-zinc-500 hover:text-zinc-200"
                >
                  Clear pin
                </button>
              ) : null}
            </div>
            {geocoding ? (
              <p className="mt-0.5 font-mono text-[9px] text-orange-300/85">
                Geocoding…
              </p>
            ) : null}
            {geocodeError ? (
              <p className="mt-1 rounded border border-red-500/35 bg-red-950/20 px-2 py-1.5 font-mono text-[9px] leading-snug text-red-300">
                Location lookup failed: {geocodeError}
              </p>
            ) : null}
            {safetyBriefUpdated ? (
              <p className="mt-0.5 font-mono text-[8px] tabular-nums text-amber-600/90">
                {safetyBriefUpdated}
              </p>
            ) : null}

            <div className="mt-1.5 border-t border-[rgba(255,255,255,0.08)] pt-1.5">
              {!briefing ? (
                aiLoading ? (
                  <p className="py-2 text-center font-mono text-[11px] text-amber-200/55">
                    UPLINK…
                  </p>
                ) : (
                  <p className="py-2 text-center font-mono text-[10px] text-zinc-500">
                    {aiError ? (
                      <span className="text-red-400">{aiError}</span>
                    ) : (
                      <>
                        Set location via{" "}
                        <span className="text-amber-400/75">FIRMS time</span>.
                      </>
                    )}
                  </p>
                )
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 font-mono text-[9px] leading-tight text-amber-100/95">
                    <div className="border-b border-r border-[rgba(255,255,255,0.1)] py-1.5 pr-1.5">
                      <p className={intelSubHdr}>Fire</p>
                      <p className="tabular-nums text-amber-200/95">
                        {briefing.miles != null
                          ? `${briefing.miles.toFixed(1)} mi`
                          : "—"}
                      </p>
                      {briefing.nearest ? (
                        <p className="truncate text-[8px] text-zinc-500">
                          {briefing.nearest.name}
                        </p>
                      ) : null}
                    </div>
                    <div className="border-b border-[rgba(255,255,255,0.1)] py-1.5 pl-1.5">
                      <p className={intelSubHdr}>Wind</p>
                      <p className="tabular-nums text-amber-200/95">
                        {briefing.anchor.weather.windMph} mph
                      </p>
                      <p className="text-[8px] text-zinc-500">
                        {briefing.anchor.weather.windFromTo}
                      </p>
                    </div>
                    <div className="border-r border-[rgba(255,255,255,0.1)] py-1.5 pr-1.5">
                      <p className={intelSubHdr}>Temp</p>
                      <p className="tabular-nums text-amber-200/95">
                        {briefing.anchor.weather.tempF}°F
                      </p>
                    </div>
                    <div className="py-1.5 pl-1.5">
                      <p className={intelSubHdr}>ETA</p>
                      <p className="tabular-nums text-amber-200/95">
                        {briefing.etaMin != null ? `${briefing.etaMin}m` : "—"}
                      </p>
                      {demoEtaHoursLabel(briefing.etaMin) ? (
                        <p className="text-[8px] text-zinc-500">
                          {demoEtaHoursLabel(briefing.etaMin)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {safetyBrief ? (
                    <>
                      {aiError ? (
                        <p className="border-l-2 border-red-500/45 pl-2 font-mono text-[9px] text-red-300">
                          {aiError}
                        </p>
                      ) : null}
                      <section className="border-t border-[rgba(255,255,255,0.08)] pt-1.5">
                        <h3 className={intelHdr}>Situation</h3>
                        <p
                          className="mt-0.5 line-clamp-[14] whitespace-pre-line text-[9px] leading-[1.25] text-amber-50/90"
                          title={safetyBrief.situation}
                        >
                          {safetyBrief.situation}
                        </p>
                      </section>
                      <section className="border-t border-[rgba(255,255,255,0.08)] pt-1.5">
                        <h3 className={intelHdr}>Why</h3>
                        <p
                          className="mt-0.5 line-clamp-8 text-[9px] leading-[1.3] text-amber-50/88"
                          title={safetyBrief.reasoning}
                        >
                          {safetyBrief.reasoning}
                        </p>
                      </section>
                      <section className="border-t border-[rgba(255,255,255,0.08)] pt-1.5">
                        <h3 className={intelHdr}>Meaning</h3>
                        <p
                          className="mt-0.5 line-clamp-8 text-[9px] leading-[1.25] text-amber-50/88"
                          title={safetyBrief.whatThisMeans}
                        >
                          {safetyBrief.whatThisMeans}
                        </p>
                      </section>
                      <section className="border-t border-[rgba(255,255,255,0.08)] pt-1.5">
                        <h3 className={intelHdr}>Actions</h3>
                        <ul className="mt-0.5 list-none space-y-1 text-[9px] leading-[1.3] text-amber-100/92">
                          {topActions.map((a, i) => (
                            <li key={i} className="flex gap-1">
                              <ActionChevron />
                              <span className="min-w-0 flex-1">{a}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </>
                  ) : aiLoading ? (
                    <p className="py-1.5 text-center font-mono text-[11px] text-amber-200/55">
                      AI brief incoming…
                    </p>
                  ) : (
                    <div className="border-t border-[rgba(255,255,255,0.08)] pt-1.5 text-center">
                      {aiError ? (
                        <p className="font-mono text-[9px] text-red-400">
                          {aiError}
                        </p>
                      ) : (
                        <p className="font-mono text-[9px] text-zinc-500">
                          Use <span className="text-amber-500/80">Regen AI</span>{" "}
                          for Situation / Why / Actions.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="mt-1 border-t border-[rgba(255,255,255,0.06)] pt-1 text-center font-mono text-[8px] text-zinc-600">
              © OpenStreetMap · Not guidance
            </p>
          </div>
        </div>
      ) : null}

      {!metOpen ? (
        <button
          type="button"
          onClick={() => setMetOpen(true)}
          className="pointer-events-auto absolute right-0 top-[42%] z-[56] flex h-16 w-7 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-l-sm border border-r-0 border-[rgba(255,255,255,0.1)] bg-black/30 px-0.5 font-tactical text-[9px] text-cyan-500/90 shadow-md backdrop-blur-[20px] hover:bg-black/40 hover:text-cyan-300"
          style={{ WebkitBackdropFilter: "blur(20px)" }}
          aria-label="Expand meteorology panel"
        >
          <span className="text-[10px] leading-none" aria-hidden>
            ◀
          </span>
          <span className="max-w-[2.5rem] text-center text-[6px] font-bold uppercase tracking-[0.1em] text-zinc-500">
            MET
          </span>
        </button>
      ) : null}

      {metOpen ? (
        <div
          className={`${hudShell} right-5 w-[min(300px,calc(100vw-2.5rem))] ${HUD_TOP}`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.1)] px-2 py-1">
            <p className="font-mono text-[7px] font-bold uppercase tracking-[0.1em] text-cyan-400/75">
              Meteorology
            </p>
            <button
              type="button"
              onClick={() => setMetOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded border border-[rgba(255,255,255,0.12)] bg-transparent text-sm leading-none text-zinc-400 hover:border-white/25 hover:text-zinc-100"
              aria-label="Minimize meteorology panel"
            >
              −
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-1.5 py-1">
            {!briefing ? (
              <p className="py-2 text-center font-mono text-[8px] text-zinc-500">
                Set location in FIRMS time for gauges.
              </p>
            ) : (
              <>
                <div className="flex flex-nowrap items-start justify-between gap-0.5">
                  <RadialGauge
                    gid="gg-temp"
                    label="Temp °F"
                    value={briefing.anchor.weather.tempF}
                    max={120}
                    sub="Pin"
                  />
                  <RadialGauge
                    gid="gg-wind"
                    label="Wind"
                    value={briefing.anchor.weather.windMph}
                    max={60}
                    sub={briefing.anchor.weather.windFromTo}
                  />
                  <RadialGauge
                    gid="gg-smoke"
                    label="Smoke"
                    value={smokeLoad01(briefing.safety) * 100}
                    max={100}
                    sub={
                      briefing.smoke.slice(0, 36) +
                      (briefing.smoke.length > 36 ? "…" : "")
                    }
                  />
                </div>
                <div className="mt-1.5 border-t border-[rgba(255,255,255,0.08)] pt-1.5 font-mono text-[7px] text-zinc-400">
                  <div className="grid grid-cols-2 text-center">
                    <div className="border-b border-r border-[rgba(255,255,255,0.1)] px-1 py-0.5">
                      <p className={subHdr}>Safety</p>
                      <p className="text-amber-200/90">{briefing.safety}</p>
                    </div>
                    <div className="border-b border-[rgba(255,255,255,0.1)] px-1 py-0.5">
                      <p className={subHdr}>Nearest</p>
                      <p className="text-amber-200/90">
                        {briefing.miles != null
                          ? `${briefing.miles.toFixed(1)} mi`
                          : "—"}
                      </p>
                    </div>
                    <div className="border-r border-[rgba(255,255,255,0.1)] px-1 py-0.5">
                      <p className={subHdr}>ETA</p>
                      <p className="text-amber-200/90">
                        {briefing.etaMin != null ? `${briefing.etaMin}m` : "—"}
                      </p>
                    </div>
                    <div className="px-1 py-0.5">
                      <p className={subHdr}>Hotspot</p>
                      <p className="truncate text-amber-200/90">
                        {briefing.nearest?.name ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
