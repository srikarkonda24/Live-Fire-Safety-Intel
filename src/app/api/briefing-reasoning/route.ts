import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  parseBriefingReasoningRequest,
  parseSafetyBriefResponse,
} from "@/lib/briefing-reasoning-types";

const SYSTEM = `You are a wildfire awareness assistant for a hackathon demo (not an official emergency service).
The UI already shows distance, wind, temperature, and a demo ETA in a fact strip. Your job is a tight spoken BRIEFING a judge can scan in under 15 seconds — not a report.

Rules:
- Use ONLY facts from the user JSON. Do not invent roads, closures, or official orders.
- risk MUST be exactly one of: LOW, MODERATE, HIGH, EXTREME — match the app safety band unless a single conservative step is justified by wind/smoke (stay conservative).
- Be brief. No filler, no repeated ideas, no long chains of clauses.
- FORBIDDEN in all text: vendor or product names (e.g. Open-Meteo, NASA, VIIRS), "blended data", "middle waypoint", "modeled congestion", "routing engine", apologies, or stack/meta talk about how data was computed. If the demo path matters, say at most once: "highlighted demo route on the map" (no technical detail).

JSON keys (exact): risk, situation, reasoning, whatThisMeans, recommendedActions

- situation: 2–4 SHORT lines separated by the newline character \\n. Facts only (fire distance if known, wind in plain words, temp, smoke/air). No topic sentences or "Overall,".
- reasoning: MAX 2 sentences. This is "why it matters" — one clear link between wind/distance/smoke and the person. No jargon.
- whatThisMeans: MAX 3 sentences. Plain implications; say if immediate evacuation is or is not implied. If demo ETA exists in facts, mention approximate hours ONCE (no fake decimal precision).
- recommendedActions: 3–5 strings, each MAX 12 words, imperative, distinct. No near-duplicates.

Output ONLY valid JSON. No markdown fences, no text outside JSON.`;

function stripJsonFences(s: string): string {
  const t = s.trim();
  if (t.startsWith("```")) {
    return t
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/[\s\n]*```[\s\n]*$/i, "")
      .trim();
  }
  return t;
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server." },
      { status: 503 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, {
      status: 400,
    });
  }

  const payload = parseBriefingReasoningRequest(raw);
  if (!payload) {
    return NextResponse.json({ error: "Invalid briefing payload." }, {
      status: 400,
    });
  }

  const userJson = JSON.stringify(payload, null, 2);
  const dist =
    payload.nearestFireMiles != null
      ? `${payload.nearestFireMiles.toFixed(1)} MI`
      : "UNKNOWN (NO NEAREST POINT)";
  const wind = `${payload.weather.windMph} MPH — ${payload.weather.windFromTo}`;
  const smoke = `${payload.smokeSummary} | ANCHOR FIELD: ${payload.weather.smokeLevel}`;

  const etaNote =
    payload.etaMin != null && Number.isFinite(payload.etaMin)
      ? `${payload.etaMin} minutes (for whatThisMeans, convert to ~hours once, round sensibly)`
      : "N/A — omit hour estimates";

  const user = `LIVE FACTS (the app shows these numbers in the UI; do NOT repeat them as a table in your JSON — add context only):
Nearest hotspot: ${dist} | label: ${payload.nearestFireName ?? "NONE"}
Wind: ${wind}
Smoke / air: ${smoke}
Location: ${payload.displayName}
App safety band: ${payload.safety}
Temperature °F: ${payload.weather.tempF}
Demo time-to-impact (illustrative): ${etaNote}
Demo evacuation line on map (labels only — not a real route): ${payload.demoRouteSummary}
Steps: ${JSON.stringify(payload.demoRouteSteps)}

Full JSON:
${userJson}

Return ONLY compact JSON:
{"risk":"MODERATE","situation":"Fire hotspot about X miles away\\nWind: …\\nTemp: …°F\\n…","reasoning":"…","whatThisMeans":"…","recommendedActions":["…","…","…"]}`;

  const model =
    process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514";

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: 650,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });

    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFences(text));
    } catch {
      return NextResponse.json(
        { error: "Model did not return valid JSON.", rawPreview: text.slice(0, 400) },
        { status: 502 },
      );
    }

    const brief = parseSafetyBriefResponse(parsed);
    if (!brief) {
      return NextResponse.json(
        { error: "Model JSON did not match the expected schema." },
        { status: 502 },
      );
    }

    return NextResponse.json(brief, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Anthropic request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
