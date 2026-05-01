"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from "recharts";

const RouteMap = dynamic(() => import("../components/RouteMap"), { ssr: false });
const AC = "#4ade80";
const LM = "#fef08a";
const tooltipStyle = { backgroundColor: "#111", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 13, color: "#e8e8e8" };

interface Split { mile: number; distance_mi: number; elapsed: string; moving: string; pace: string; elevation_ft: number; avg_hr: number | null }

function buildHistogram(data: number[], bins: number = 20): { bin: string; count: number }[] {
  if (data.length === 0) return [];
  const min = Math.min(...data); const max = Math.max(...data);
  if (min === max) return [{ bin: `${Math.round(min)}`, count: data.length }];
  const step = (max - min) / bins;
  const buckets = new Array(bins).fill(0);
  for (const v of data) { const i = Math.min(Math.floor((v - min) / step), bins - 1); buckets[i]++; }
  return buckets.map((count, i) => ({ bin: `${Math.round(min + i * step)}`, count }));
}

function MiniHistogram({ data, color, label, unit }: { data: number[]; color: string; label: string; unit: string }) {
  const hist = buildHistogram(data, 15);
  if (hist.length === 0) return null;
  return (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, textAlign: "center" }}>{label} ({unit})</div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={hist} margin={{ top: 0, right: 2, bottom: 0, left: 2 }}>
          <Bar dataKey="count" fill={color} opacity={0.7} />
          <XAxis dataKey="bin" stroke={LM} fontSize={8} interval={Math.max(0, Math.floor(hist.length / 4))} tick={{ fill: LM }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ActivityContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (!id) return; fetch(`/api/activities/detail?id=${id}`).then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false)); }, [id]);
  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: LM, fontSize: 16 }}>Loading...</div>;
  if (!data?.activity) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: LM, fontSize: 16 }}>Activity not found</div>;
  const { activity, chartData, splits, hasHeartrate, hasPower, route } = data;

  // Build distribution data from chart stream data
  const elevationData = chartData.filter((p: any) => p.elevation_ft != null).map((p: any) => p.elevation_ft);
  const speedData = chartData.filter((p: any) => p.speed_mph != null && p.speed_mph > 0).map((p: any) => p.speed_mph);
  const hrData = chartData.filter((p: any) => p.heartrate != null && p.heartrate > 0).map((p: any) => p.heartrate);
  const cadenceData = chartData.filter((p: any) => p.cadence != null && p.cadence > 0).map((p: any) => p.cadence);
  const wattsData = chartData.filter((p: any) => p.watts != null && p.watts > 0).map((p: any) => p.watts);
  const hasDistributions = elevationData.length > 0 || speedData.length > 0 || hrData.length > 0;

  return (
    <div style={{ minHeight: "100vh",  }}>
      <div style={{ height: 3, background: AC }} />
      <header style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)", padding: "16px 24px" }}>
        <a href="/" style={{ fontSize: 13, color: LM, textDecoration: "none", letterSpacing: 1, textTransform: "uppercase" }}>Back to dashboard</a>
        <h1 style={{ fontSize: 26, fontWeight: 500, color: "#e8e8e8", marginTop: 8 }}>{activity.name}</h1>
        <p style={{ fontSize: 14, color: LM, marginTop: 4 }}>{activity.date} // {activity.type}</p>
      </header>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 24px 60px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, marginBottom: 24, border: "0.5px solid rgba(255,255,255,0.1)" }}>
          {[
            ["Distance", `${activity.distance_mi} mi`],
            ["Duration", activity.duration],
            ["Elevation", `${activity.elevation_ft.toLocaleString()} ft`],
            ["Pace", activity.avg_pace || `${activity.avg_speed_mph} mph`],
            ...(activity.avg_hr ? [["Avg HR", `${activity.avg_hr} bpm`]] : []),
            ...(activity.max_hr ? [["Max HR", `${activity.max_hr} bpm`]] : []),
            ...(activity.calories ? [["Calories", `${activity.calories}`]] : []),
            ...(activity.suffer_score ? [["Effort", `${activity.suffer_score}`]] : []),
          ].map(([label, value], i) => (
            <div key={i} style={{ padding: "14px 16px", borderRight: "0.5px solid rgba(255,255,255,0.08)", borderBottom: "0.5px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
              <div style={{ fontSize: 20, color: i === 0 ? AC : "#e8e8e8", fontWeight: 500, marginTop: 4 }}>{value}</div>
            </div>
          ))}
        </div>

        {route && route.length > 0 && <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}><div style={{ height: 400 }}><RouteMap route={route} /></div></div>}

        {chartData.length > 0 && chartData[0].elevation_ft !== undefined && (
          <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: "2px solid #22c55e", padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Elevation</div>
            <ResponsiveContainer width="100%" height={200}><AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="none" /><XAxis dataKey="distance_mi" stroke={LM} fontSize={11} tickFormatter={(v) => `${v}`} /><YAxis stroke={LM} fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v} ft`, "Elevation"]} labelFormatter={(v) => `${v} mi`} />
              <Area type="monotone" dataKey="elevation_ft" stroke="#22c55e" fill="#0a2a0a" strokeWidth={1.5} dot={false} />
            </AreaChart></ResponsiveContainer>
          </div>
        )}

        {hasHeartrate && (
          <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: "2px solid #ef4444", padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Heart rate</div>
            <ResponsiveContainer width="100%" height={200}><LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="none" /><XAxis dataKey="distance_mi" stroke={LM} fontSize={11} tickFormatter={(v) => `${v}`} /><YAxis stroke={LM} fontSize={11} domain={["dataMin - 10", "dataMax + 10"]} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v} bpm`, "HR"]} labelFormatter={(v) => `${v} mi`} />
              <Line type="monotone" dataKey="heartrate" stroke="#ef4444" strokeWidth={1.5} dot={false} />
            </LineChart></ResponsiveContainer>
          </div>
        )}

        {chartData.length > 0 && chartData[0].speed_mph !== undefined && (
          <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: "2px solid #3b82f6", padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Speed</div>
            <ResponsiveContainer width="100%" height={200}><LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="none" /><XAxis dataKey="distance_mi" stroke={LM} fontSize={11} tickFormatter={(v) => `${v}`} /><YAxis stroke={LM} fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v} mph`, "Speed"]} labelFormatter={(v) => `${v} mi`} />
              <Line type="monotone" dataKey="speed_mph" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
            </LineChart></ResponsiveContainer>
          </div>
        )}

        {/* Distribution histograms - VeloViewer style */}
        {hasDistributions && (
          <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: `2px solid ${AC}`, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 16 }}>Distributions</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {elevationData.length > 0 && <MiniHistogram data={elevationData} color="#22c55e" label="Elevation" unit="ft" />}
              {speedData.length > 0 && <MiniHistogram data={speedData} color="#3b82f6" label="Speed" unit="mph" />}
              {hrData.length > 0 && <MiniHistogram data={hrData} color="#ef4444" label="Heart rate" unit="bpm" />}
              {cadenceData.length > 0 && <MiniHistogram data={cadenceData} color="#a855f7" label="Cadence" unit="rpm" />}
              {wattsData.length > 0 && <MiniHistogram data={wattsData} color="#eab308" label="Power" unit="W" />}
            </div>
          </div>
        )}

        {splits.length > 0 && (
          <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12 }}>
            <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, padding: "16px 16px 10px" }}>Mile splits</div>
            <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
                {["Mile","Pace","Time","Elev","HR"].map(h => (<th key={h} style={{ textAlign: "left", padding: "10px 16px", fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>))}
              </tr></thead>
              <tbody>{splits.map((s: Split) => (
                <tr key={s.mile} style={{ borderBottom: "1px solid #111" }}>
                  <td style={{ padding: "10px 16px", color: AC, fontWeight: 500, fontSize: 15 }}>{s.mile}</td>
                  <td style={{ padding: "10px 16px", color: "#e8e8e8", fontSize: 15 }}>{s.pace}</td>
                  <td style={{ padding: "10px 16px", color: LM }}>{s.moving}</td>
                  <td style={{ padding: "10px 16px", color: LM }}>{s.elevation_ft > 0 ? "+" : ""}{s.elevation_ft} ft</td>
                  <td style={{ padding: "10px 16px", color: LM }}>{s.avg_hr || "-"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ActivityPage() {
  return (<Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#fef08a", fontSize: 16 }}>Loading...</div>}><ActivityContent /></Suspense>);
}


