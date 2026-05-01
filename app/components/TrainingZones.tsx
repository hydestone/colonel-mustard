"use client";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const AC = "#4ade80";
const LM = "#fef08a";
const tooltipStyle = { backgroundColor: "#111", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 13, color: "#e8e8e8" };

interface Zone { zone: string; label: string; min: number; max: number; color: string; time: number; timeFormatted: string; pct: number; range: string }

export default function TrainingZones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [weeklyZones, setWeeklyZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("3m");
  const [type, setType] = useState("all");
  const [maxHR, setMaxHR] = useState(0);
  const [totalTime, setTotalTime] = useState("");
  const [actCount, setActCount] = useState(0);
  const [actTypes, setActTypes] = useState<string[]>([]);

  async function loadZones(r?: string, t?: string) {
    setLoading(true);
    const rr = r || range; const tt = t || type;
    const res = await fetch(`/api/activities/zones?range=${rr}&type=${tt}`);
    const data = await res.json();
    setZones(data.zones || []);
    setWeeklyZones(data.weeklyZones || []);
    setMaxHR(data.estimatedMaxHR || 0);
    setTotalTime(data.totalTime || "");
    setActCount(data.activityCount || 0);
    setActTypes(data.activityTypes || []);
    setLoading(false);
  }

  useEffect(() => { loadZones(); }, []);

  const ranges = [["7d","7 Day"],["1m","1 Month"],["3m","3 Month"],["6m","6 Month"],["1y","1 Year"],["all","All Time"]];
  const maxPct = Math.max(...zones.map(z => z.pct), 1);

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {ranges.map(([val, label]) => (
            <button key={val} onClick={() => { setRange(val); loadZones(val, type); }} style={{
              background: range === val ? AC : "transparent", border: range === val ? "none" : "1px solid #1a1a1a",
              color: range === val ? "#000" : LM, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500,
            }}>{label}</button>
          ))}
        </div>
        <select value={type} onChange={(e) => { setType(e.target.value); loadZones(range, e.target.value); }}
          style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, border: "0.5px solid rgba(255,255,255,0.1)", color: LM, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>
          <option value="all">All activities</option>
          <option value="Ride">Rides</option>
          <option value="Run">Runs</option>
          <option value="VirtualRide">Virtual rides</option>
        </select>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: "center", color: LM }}>Loading zones...</div> : (
        <>
          {/* Summary */}
          <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid #1a1a1a", paddingBottom: 20 }}>
            <div style={{ flex: 1, paddingRight: 20 }}>
              <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5 }}>Max HR</div>
              <div style={{ fontSize: 42, fontWeight: 500, color: "#e8e8e8", lineHeight: 1, marginTop: 4 }}>{maxHR}</div>
              <div style={{ fontSize: 14, color: LM, marginTop: 4 }}>bpm estimated</div>
            </div>
            <div style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
            <div style={{ flex: 1, padding: "0 20px" }}>
              <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5 }}>Total time</div>
              <div style={{ fontSize: 42, fontWeight: 500, color: "#e8e8e8", lineHeight: 1, marginTop: 4 }}>{totalTime}</div>
              <div style={{ fontSize: 14, color: LM, marginTop: 4 }}>in {actCount} activities</div>
            </div>
            <div style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
            <div style={{ flex: 1, paddingLeft: 20 }}>
              <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5 }}>Top zone</div>
              <div style={{ fontSize: 42, fontWeight: 500, color: zones[0]?.pct > 0 ? zones.reduce((a, b) => a.pct > b.pct ? a : b).color : "#e8e8e8", lineHeight: 1, marginTop: 4 }}>
                {zones.length > 0 ? zones.reduce((a, b) => a.pct > b.pct ? a : b).zone : "-"}
              </div>
              <div style={{ fontSize: 14, color: LM, marginTop: 4 }}>{zones.length > 0 ? zones.reduce((a, b) => a.pct > b.pct ? a : b).label : ""}</div>
            </div>
          </div>

          {/* Zone bars */}
          <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: "2px solid #ef4444", padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 16 }}>Heart rate zones</div>
            {zones.map(z => (
              <div key={z.zone} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 30, fontSize: 14, color: z.color, fontWeight: 500 }}>{z.zone}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ height: 24, background: "rgba(255,255,255,0.08)", position: "relative" }}>
                    <div style={{ height: 24, background: z.color, width: `${(z.pct / maxPct) * 100}%`, opacity: 0.8, transition: "width 0.3s" }} />
                  </div>
                </div>
                <div style={{ width: 70, fontSize: 14, color: "#e8e8e8", fontWeight: 500, textAlign: "right" }}>{z.timeFormatted}</div>
                <div style={{ width: 40, fontSize: 13, color: LM, textAlign: "right" }}>{z.pct}%</div>
                <div style={{ width: 120, fontSize: 12, color: LM, textAlign: "right" }}>{z.range}</div>
              </div>
            ))}
            {/* Zone legend */}
            <div style={{ display: "flex", gap: 16, marginTop: 16, paddingTop: 12, borderTop: "0.5px solid rgba(255,255,255,0.08)", flexWrap: "wrap" }}>
              {zones.map(z => (
                <div key={z.zone} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 12, height: 12, background: z.color }} />
                  <span style={{ fontSize: 12, color: LM }}>{z.zone} {z.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly stacked chart */}
          {weeklyZones.length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: "2px solid #1a1a1a", padding: 20 }}>
              <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Time in zones by week // hours</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklyZones} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="none" />
                  <XAxis dataKey="week" stroke={LM} fontSize={10} interval={Math.max(0, Math.floor(weeklyZones.length / 12))} />
                  <YAxis stroke={LM} fontSize={11} tickFormatter={(v) => `${v}h`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => {
                    const labels: Record<string, string> = { z1: "Recovery", z2: "Endurance", z3: "Tempo", z4: "Threshold", z5: "VO2 Max" };
                    return [`${v}h`, labels[n] || n];
                  }} />
                  <Bar dataKey="z1" stackId="a" fill="#94a3b8" />
                  <Bar dataKey="z2" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="z3" stackId="a" fill="#22c55e" />
                  <Bar dataKey="z4" stackId="a" fill="#eab308" />
                  <Bar dataKey="z5" stackId="a" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

