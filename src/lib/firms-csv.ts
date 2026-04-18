type PointGeom = { type: "Point"; coordinates: [number, number] };

type FireFeature = {
  type: "Feature";
  geometry: PointGeom;
  properties: Record<string, unknown>;
};

export type FirmsFeatureCollection = {
  type: "FeatureCollection";
  features: FireFeature[];
};

function normalizeConfidence(
  raw: string | undefined,
  numeric: number | undefined,
): "high" | "med" | "low" {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "high" || s === "h") return "high";
  if (s === "nominal" || s === "n") return "med";
  if (s === "low" || s === "l") return "low";
  if (numeric != null && Number.isFinite(numeric)) {
    if (numeric >= 80) return "high";
    if (numeric >= 50) return "med";
  }
  return "low";
}

function splitDelimitedLine(line: string): string[] {
  const delim = !line.includes(",") && line.includes("\t") ? "\t" : ",";
  if (delim === "\t") return line.split("\t").map((c) => c.trim());
  return splitCsvLine(line);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function headerIndex(
  header: string[],
  names: string[],
): number {
  const lower = header.map((h) => h.trim().toLowerCase());
  for (const n of names) {
    const i = lower.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

export function parseFirmsAreaCsv(
  text: string,
  maxPoints: number,
): FirmsFeatureCollection {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  if (nonEmpty.length < 2) {
    return { type: "FeatureCollection", features: [] };
  }

  let headerRow = -1;
  let header: string[] = [];
  const scanLimit = Math.min(nonEmpty.length, 40);
  for (let i = 0; i < scanLimit; i++) {
    const row = splitDelimitedLine(nonEmpty[i]);
    const latI = headerIndex(row, ["latitude", "lat"]);
    const lonI = headerIndex(row, ["longitude", "lon", "long"]);
    if (latI >= 0 && lonI >= 0) {
      headerRow = i;
      header = row;
      break;
    }
  }

  if (headerRow < 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const latIdx = headerIndex(header, ["latitude", "lat"]);
  const lonIdx = headerIndex(header, ["longitude", "lon", "long"]);
  const frpIdx = headerIndex(header, ["frp"]);
  const confIdx = headerIndex(header, ["confidence"]);
  const dateIdx = headerIndex(header, ["acq_date", "date"]);
  const timeIdx = headerIndex(header, ["acq_time", "time"]);

  if (latIdx < 0 || lonIdx < 0) {
    return { type: "FeatureCollection", features: [] };
  }

  type Row = { lat: number; lon: number; frp: number; f: FireFeature };
  const rows: Row[] = [];

  for (let li = headerRow + 1; li < nonEmpty.length; li++) {
    const cols = splitDelimitedLine(nonEmpty[li]);
    const lat = Number(cols[latIdx]);
    const lon = Number(cols[lonIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const frpRaw = frpIdx >= 0 ? Number(cols[frpIdx]) : NaN;
    const frp = Number.isFinite(frpRaw) ? frpRaw : 0;
    const confRaw = confIdx >= 0 ? cols[confIdx] : undefined;
    const confNum = confRaw != null && /^\d+(\.\d+)?$/.test(confRaw)
      ? Number(confRaw)
      : undefined;
    const confidence = normalizeConfidence(confRaw, confNum);

    const d = dateIdx >= 0 ? cols[dateIdx] : "";
    const t = timeIdx >= 0 ? cols[timeIdx] : "";
    const name =
      d || t
        ? `Hotspot ${d}${d && t ? " " : ""}${t}`.trim()
        : `Thermal (${frp ? `${frp} MW` : "detection"})`;

    const f: FireFeature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        name,
        frp,
        confidence,
        focus: false,
      },
    };
    rows.push({ lat, lon, frp, f });
  }

  rows.sort((a, b) => b.frp - a.frp);
  const cap = Math.max(1, maxPoints);
  const features = rows.slice(0, cap).map((r) => r.f);
  if (features.length > 0) {
    const props = features[0].properties;
    if (props && typeof props === "object" && !Array.isArray(props)) {
      (props as Record<string, unknown>).focus = true;
    }
  }

  return { type: "FeatureCollection", features };
}
