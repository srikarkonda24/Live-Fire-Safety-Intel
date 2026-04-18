"use client";

import type { SafetyBriefResponse } from "@/lib/briefing-reasoning-types";
import type { AddressBriefingAnchor, SafetyLevel } from "@/lib/briefing-presets";

export type HudPanel = "surveillance" | "meteorology" | "operations";

const BLAST = "cubic-bezier(0.22, 0.61, 0.36, 1)";

const R = 38;
const C = 2 * Math.PI * R;

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
    <div className="flex flex-col items-center gap-1">
      <svg
        viewBox="0 0 100 100"
        className="h-24 w-24 shrink-0 drop-shadow-[0_0_12px_rgba(251,191,36,0.25)] md:h-28 md:w-28"
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
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-amber-400/90">
        {label}
      </p>
      <p className="font-mono text-lg font-bold tabular-nums text-amber-100 [text-shadow:0_0_14px_rgba(251,191,36,0.35)] md:text-xl">
        {Number.isFinite(value) ? Math.round(value) : "—"}
      </p>
      {sub ? (
        <p className="max-w-[9rem] text-center font-mono text-[9px] leading-tight text-zinc-500">
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

function riskRowClass(risk: SafetyLevel): string {
  if (risk === "EXTREME" || risk === "HIGH")
    return "text-red-400 [text-shadow:0_0_12px_rgba(248,113,113,0.45)]";
  if (risk === "MODERATE")
    return "text-amber-300 [text-shadow:0_0_10px_rgba(251,191,36,0.35)]";
  return "text-emerald-300 [text-shadow:0_0_10px_rgba(52,211,153,0.35)]";
}

function riskHeadlineEmoji(risk: SafetyLevel): string {
  if (risk === "EXTREME" || risk === "HIGH") return "🔴";
  if (risk === "MODERATE") return "🟡";
  return "🟢";
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
  openPanel: HudPanel | null;
  onTogglePanel: (id: HudPanel) => void;
  onClosePanel: () => void;
  briefing: TacticalHudBriefing | null;
  onRegenerateAi: () => void;
  onClearPin: () => void;
  geocoding: boolean;
  firesLoading: boolean;
  pinnedAnchor: AddressBriefingAnchor | null;
  safetyBrief: SafetyBriefResponse | null;
  safetyBriefUpdated: string | null;
  aiLoading: boolean;
  aiError: string | null;
};

export function TacticalHud({
  openPanel,
  onTogglePanel,
  onClosePanel,
  briefing,
  onRegenerateAi,
  onClearPin,
  geocoding,
  firesLoading,
  pinnedAnchor,
  safetyBrief,
  safetyBriefUpdated,
  aiLoading,
  aiError,
}: TacticalHudProps) {
  const dockBtn = (id: HudPanel, label: string) => {
    const active = openPanel === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onTogglePanel(id)}
        className={`border-r border-slate-800 px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.24em] last:border-r-0 md:px-5 md:text-[10px] md:tracking-[0.28em] ${
          active
            ? "bg-amber-950/40 text-amber-200 [text-shadow:0_0_12px_rgba(251,191,36,0.45)]"
            : "text-amber-400/90 hover:bg-black/30 hover:text-amber-200"
        }`}
      >
        {label}
      </button>
    );
  };

  const open = openPanel !== null;

  return (
    <>
      <div className="pointer-events-none fixed left-0 right-0 top-0 z-[60] flex justify-center pt-3 md:pt-4">
        <div
          className="pointer-events-auto flex overflow-hidden rounded border border-slate-800 bg-black/70 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md"
          role="toolbar"
          aria-label="Tactical dock"
        >
          {dockBtn("surveillance", "Surveillance")}
          {dockBtn("meteorology", "Meteorology")}
          {dockBtn("operations", "Operations")}
        </div>
      </div>

      <div
        className={`fixed left-0 right-0 top-0 z-[55] flex justify-center pt-[3.25rem] md:pt-14 ${
          open ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div
          className={`flex h-[80vh] w-full max-w-[100vw] flex-col overflow-hidden border-x border-b border-slate-800 bg-black/40 shadow-2xl backdrop-blur-lg transition-transform duration-[720ms] ${
            open ? "translate-y-0" : "-translate-y-full"
          }`}
          style={{ transitionTimingFunction: BLAST }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 md:px-8 md:pt-6">
            {openPanel === "surveillance" && (
              <div className="mx-auto max-w-3xl space-y-6">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.35em] text-amber-400/80">
                    Surveillance / Claude
                  </p>
                  <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
                    Location is set from the{" "}
                    <span className="text-amber-500/70">address field under FIRMS time</span>{" "}
                    (bottom bar). Briefing refreshes automatically after geocode.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {briefing ? (
                      <button
                        type="button"
                        onClick={onRegenerateAi}
                        disabled={aiLoading || geocoding || firesLoading}
                        className="rounded border border-slate-700 bg-black/40 px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-300 hover:border-slate-500 disabled:opacity-40"
                      >
                        {aiLoading ? "Generating…" : "Regenerate AI"}
                      </button>
                    ) : null}
                    {pinnedAnchor ? (
                      <button
                        type="button"
                        onClick={onClearPin}
                        className="rounded border border-slate-700 px-3 py-2 font-mono text-[10px] uppercase text-zinc-500 hover:text-zinc-300"
                      >
                        Clear pin
                      </button>
                    ) : null}
                  </div>
                  {geocoding ? (
                    <p className="mt-2 font-mono text-[10px] text-orange-300/80">
                      Resolving address…
                    </p>
                  ) : null}
                </div>

                {aiError && safetyBrief ? (
                  <p className="rounded border border-red-500/30 bg-red-950/30 px-3 py-2 font-mono text-xs text-red-300">
                    {aiError}
                  </p>
                ) : null}
                <div className="rounded-lg border border-slate-800/80 bg-black/35 p-5 ring-1 ring-amber-500/10">
                  {safetyBrief ? (
                    <div className="space-y-5">
                      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-amber-500/15 pb-4">
                        <p
                          className={`font-mono text-2xl font-bold tracking-tight md:text-3xl ${riskRowClass(safetyBrief.risk)}`}
                        >
                          {riskHeadlineEmoji(safetyBrief.risk)} RISK:{" "}
                          {safetyBrief.risk}
                        </p>
                        {safetyBriefUpdated ? (
                          <span className="font-mono text-xs tabular-nums text-amber-500/70 md:text-sm">
                            {safetyBriefUpdated}
                          </span>
                        ) : null}
                      </div>

                      {briefing ? (
                        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] leading-snug text-amber-100/95 md:grid-cols-4 md:gap-3 md:text-xs">
                          <div className="rounded border border-slate-800/90 bg-black/40 px-2.5 py-2 md:px-3">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                              Fire distance
                            </p>
                            <p className="mt-1 tabular-nums text-amber-200/95">
                              {briefing.miles != null
                                ? `${briefing.miles.toFixed(1)} mi`
                                : "—"}
                            </p>
                            {briefing.nearest ? (
                              <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                                {briefing.nearest.name}
                              </p>
                            ) : null}
                          </div>
                          <div className="rounded border border-slate-800/90 bg-black/40 px-2.5 py-2 md:px-3">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                              Wind
                            </p>
                            <p className="mt-1 tabular-nums text-amber-200/95">
                              {briefing.anchor.weather.windMph} mph
                            </p>
                            <p className="mt-0.5 text-[10px] text-zinc-400">
                              {briefing.anchor.weather.windFromTo}
                            </p>
                          </div>
                          <div className="rounded border border-slate-800/90 bg-black/40 px-2.5 py-2 md:px-3">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                              Temp
                            </p>
                            <p className="mt-1 tabular-nums text-amber-200/95">
                              {briefing.anchor.weather.tempF}°F
                            </p>
                          </div>
                          <div className="rounded border border-slate-800/90 bg-black/40 px-2.5 py-2 md:px-3">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                              Demo ETA
                            </p>
                            <p className="mt-1 tabular-nums text-amber-200/95">
                              {briefing.etaMin != null
                                ? `${briefing.etaMin} min`
                                : "—"}
                            </p>
                            {demoEtaHoursLabel(briefing.etaMin) ? (
                              <p className="mt-0.5 text-[10px] text-zinc-400">
                                {demoEtaHoursLabel(briefing.etaMin)} model-based
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      <section>
                        <h3 className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-amber-400/80">
                          📍 Situation
                        </h3>
                        <p className="mt-2 whitespace-pre-line font-mono text-sm leading-relaxed text-amber-50/95 [text-shadow:0_0_14px_rgba(251,191,36,0.1)] md:text-base">
                          {safetyBrief.situation}
                        </p>
                      </section>
                      <section>
                        <h3 className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-amber-400/80">
                          🧠 Why this matters
                        </h3>
                        <p className="mt-2 font-mono text-sm leading-relaxed text-amber-50/90 md:text-base">
                          {safetyBrief.reasoning}
                        </p>
                      </section>
                      <section>
                        <h3 className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-amber-400/80">
                          📊 What this means
                        </h3>
                        <p className="mt-2 font-mono text-sm leading-relaxed text-amber-50/90 md:text-base">
                          {safetyBrief.whatThisMeans}
                        </p>
                      </section>
                      <section>
                        <h3 className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-amber-400/80">
                          🚨 Suggested actions
                        </h3>
                        <ul className="mt-2.5 list-none space-y-2 font-mono text-sm leading-snug text-amber-100/95 md:text-base">
                          {safetyBrief.recommendedActions.map((a, i) => (
                            <li
                              key={i}
                              className="border-l-2 border-amber-500/35 pl-3 [text-shadow:0_0_10px_rgba(251,191,36,0.12)]"
                            >
                              {a}
                            </li>
                          ))}
                        </ul>
                      </section>
                    </div>
                  ) : aiLoading ? (
                    <p className="py-8 text-center font-mono text-lg text-amber-200/60 [text-shadow:0_0_24px_rgba(251,191,36,0.25)]">
                      UPLINK…
                    </p>
                  ) : (
                    <p className="py-6 text-center font-mono text-sm text-zinc-500">
                      {aiError ? (
                        <span className="text-red-400">{aiError}</span>
                      ) : (
                        <>
                          Enter an address under{" "}
                          <span className="text-amber-400/80">FIRMS time</span> to
                          populate surveillance.
                        </>
                      )}
                    </p>
                  )}
                </div>
                <p className="text-center font-mono text-[9px] text-zinc-600">
                  Geocoding © OpenStreetMap · Not operational guidance
                </p>
              </div>
            )}

            {openPanel === "meteorology" && (
              <div className="mx-auto flex max-w-4xl flex-col items-center">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.35em] text-amber-400/80">
                  Meteorology
                </p>
                {!briefing ? (
                  <p className="mt-8 text-center font-mono text-sm text-zinc-500">
                    Enter an address under FIRMS time to activate gauges.
                  </p>
                ) : (
                  <div className="mt-8 flex w-full flex-wrap items-start justify-center gap-10 md:gap-16">
                    <RadialGauge
                      gid="gg-temp"
                      label="Temp °F"
                      value={briefing.anchor.weather.tempF}
                      max={120}
                      sub="At pin"
                    />
                    <RadialGauge
                      gid="gg-wind"
                      label="Wind mph"
                      value={briefing.anchor.weather.windMph}
                      max={60}
                      sub={briefing.anchor.weather.windFromTo}
                    />
                    <div className="flex flex-col items-center gap-1">
                      <RadialGauge
                        gid="gg-smoke"
                        label="Smoke load"
                        value={smokeLoad01(briefing.safety) * 100}
                        max={100}
                        sub={briefing.smoke.slice(0, 72) + (briefing.smoke.length > 72 ? "…" : "")}
                      />
                    </div>
                  </div>
                )}
                {briefing ? (
                  <div className="mt-10 grid w-full max-w-xl grid-cols-2 gap-3 font-mono text-xs text-zinc-400 md:grid-cols-4">
                    <div className="rounded border border-slate-800 bg-black/30 px-3 py-2 text-center">
                      <p className="text-[9px] uppercase text-zinc-600">Safety</p>
                      <p className="mt-1 text-amber-200/90">{briefing.safety}</p>
                    </div>
                    <div className="rounded border border-slate-800 bg-black/30 px-3 py-2 text-center">
                      <p className="text-[9px] uppercase text-zinc-600">Nearest</p>
                      <p className="mt-1 text-amber-200/90">
                        {briefing.miles != null
                          ? `${briefing.miles.toFixed(1)} mi`
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded border border-slate-800 bg-black/30 px-3 py-2 text-center">
                      <p className="text-[9px] uppercase text-zinc-600">Demo ETA</p>
                      <p className="mt-1 text-amber-200/90">
                        {briefing.etaMin != null ? `${briefing.etaMin} min` : "—"}
                      </p>
                    </div>
                    <div className="col-span-2 rounded border border-slate-800 bg-black/30 px-3 py-2 text-center md:col-span-1">
                      <p className="text-[9px] uppercase text-zinc-600">Hotspot</p>
                      <p className="mt-1 truncate text-amber-200/90">
                        {briefing.nearest?.name ?? "None"}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {openPanel === "operations" && (
              <div className="mx-auto max-w-2xl space-y-6">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.35em] text-amber-400/80">
                  Operations
                </p>
                {!briefing ? (
                  <p className="text-center font-mono text-sm text-zinc-500">
                    Enter an address under FIRMS time for checklist and route
                    narrative.
                  </p>
                ) : (
                  <>
                    <section className="rounded-lg border border-slate-800 bg-black/35 p-4">
                      <h3 className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-amber-400/80">
                        Evacuation checklist
                      </h3>
                      {briefing.advice ? (
                        <p className="mt-3 font-mono text-sm leading-relaxed text-amber-50/90">
                          {briefing.advice}
                        </p>
                      ) : (
                        <ul className="mt-3 list-disc space-y-2 pl-5 font-mono text-sm text-zinc-400">
                          <li>Monitor official alerts and local evacuation maps.</li>
                          <li>Keep go-bag and vehicle fuel ready if in elevated band.</li>
                          <li>Verify rally point labels against real orders.</li>
                        </ul>
                      )}
                    </section>
                    <section className="rounded-lg border border-slate-800 bg-black/35 p-4">
                      <h3 className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-amber-400/80">
                        Route narrative (demo)
                      </h3>
                      <p className="mt-3 font-mono text-sm leading-relaxed text-cyan-100/90 [text-shadow:0_0_12px_rgba(34,211,238,0.15)]">
                        {briefing.route.summary}
                      </p>
                      <ol className="mt-4 list-decimal space-y-2 pl-5 font-mono text-sm text-cyan-50/85">
                        {briefing.route.turnText.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ol>
                      <p className="mt-4 font-mono text-[10px] text-zinc-600">
                        Cyan map polyline: demo geometry only — not OSRM/Google
                        routing.
                      </p>
                    </section>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-800 bg-black/50 py-3">
            <button
              type="button"
              onClick={onClosePanel}
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 font-mono text-sm text-amber-500/80 hover:border-amber-500/40 hover:bg-amber-950/30 hover:text-amber-200"
              aria-label="Close panel"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
