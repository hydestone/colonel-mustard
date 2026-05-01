"use client";
import { useEffect, useState } from "react";
const AC = "#4ade80";
const LM = "#fef08a";

interface PeakActivity { id: number; name: string; type: string; distance_mi: number; elevation_ft: number; duration: string; pace: string | null; speed_mph: number | null; date: string; max_heartrate?: number; suffer_score?: number; }

function PeakTable({ title, rows, columns }: { title: string; rows: PeakActivity[]; columns: { key: string; label: string; width?: number; fmt?: (v: any) => string }[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: `2px solid ${AC}`, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, padding: "16px 16px 10px" }}>{title}</div>
      <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead><tr style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
          <th style={{ textAlign: "left", padding: "8px 16px", fontSize: 11, color: LM, letterSpacing: 1, textTransform: "uppercase", width: 30 }}>#</th>
          {columns.map(c => <th key={c.key} style={{ textAlign: "left", padding: "8px 16px", fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1, width: c.width || "auto" }}>{c.label}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #111", cursor: "pointer" }}
              onClick={() => window.location.href = `/activity?id=${r.id}`}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <td style={{ padding: "10px 16px", color: LM, width: 30 }}>{i + 1}</td>
              {columns.map(c => (
                <td key={c.key} style={{ padding: "10px 16px", color: c.key === "name" ? "#e8e8e8" : LM, fontSize: c.key === "name" ? 15 : 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.fmt ? c.fmt((r as any)[c.key]) : (r as any)[c.key] || "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PeakPerformance() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/activities/peaks").then(r => r.json()).then(d => { setData(d); setLoading(false); }); }, []);
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: LM, fontSize: 16 }}>Loading records...</div>;
  if (!data) return null;
  const nameDate = [{ key: "name", label: "Activity", width: 250 }, { key: "date", label: "Date", width: 130 }];
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ fontSize: 11, color: AC, textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>Running</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <PeakTable title="Fastest 5K" rows={data.running?.pr5k || []} columns={[...nameDate, { key: "duration", label: "Time", width: 90 }, { key: "pace", label: "Pace", width: 100 }]} />
        <PeakTable title="Fastest 10K" rows={data.running?.pr10k || []} columns={[...nameDate, { key: "duration", label: "Time", width: 90 }, { key: "pace", label: "Pace", width: 100 }]} />
        <PeakTable title="Fastest half marathon" rows={data.running?.prHalf || []} columns={[...nameDate, { key: "duration", label: "Time", width: 90 }, { key: "pace", label: "Pace", width: 100 }]} />
        <PeakTable title="Longest runs" rows={data.running?.longestRuns || []} columns={[...nameDate, { key: "distance_mi", label: "Dist", width: 80 }, { key: "duration", label: "Time", width: 100 }]} />
      </div>
      <div style={{ fontSize: 11, color: AC, textTransform: "uppercase", letterSpacing: 2, margin: "24px 0 16px" }}>Cycling</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <PeakTable title="Longest rides" rows={data.cycling?.longestRides || []} columns={[...nameDate, { key: "distance_mi", label: "Dist", width: 80 }, { key: "duration", label: "Time", width: 100 }]} />
        <PeakTable title="Most elevation" rows={data.cycling?.mostElevRides || []} columns={[...nameDate, { key: "elevation_ft", label: "Elev", width: 90, fmt: (v: number) => v?.toLocaleString() || "-" }, { key: "distance_mi", label: "Dist", width: 80 }]} />
        <PeakTable title="Fastest rides" rows={data.cycling?.fastestRides || []} columns={[...nameDate, { key: "speed_mph", label: "MPH", width: 70 }, { key: "distance_mi", label: "Dist", width: 80 }]} />
      </div>
      <div style={{ fontSize: 11, color: AC, textTransform: "uppercase", letterSpacing: 2, margin: "24px 0 16px" }}>Overall</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <PeakTable title="Highest heart rate" rows={data.overall?.highestHR || []} columns={[...nameDate, { key: "type", label: "Type", width: 80 }, { key: "max_heartrate", label: "Max HR", width: 80 }]} />
        <PeakTable title="Highest effort" rows={data.overall?.highestEffort || []} columns={[...nameDate, { key: "type", label: "Type", width: 80 }, { key: "suffer_score", label: "Score", width: 70 }]} />
      </div>
    </div>
  );
}

