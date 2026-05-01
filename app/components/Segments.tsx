"use client";
import { useEffect, useState } from "react";
const AC = "#4ade80";
const LM = "#fef08a";

interface Segment { id: number; name: string; distance_mi: number; avg_grade: number; max_grade: number; elevation_ft: number; city: string; state: string; climb_category: number; activity_type: string; pr: string | null; prDate: string | null; totalEfforts: number; rank: number | null; totalEntries: number | null; recentEfforts: { date: string; time: string; avg_hr: number | null; avg_watts: number | null }[]; }

export default function Segments() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filterCity, setFilterCity] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [filterClimb, setFilterClimb] = useState("All");
  const [cities, setCities] = useState<string[]>([]);
  const [actTypes, setActTypes] = useState<string[]>([]);
  const [climbCats, setClimbCats] = useState<number[]>([]);

  useEffect(() => {
    fetch("/api/activities/segments").then(r => r.json()).then(d => {
      setSegments(d.segments || []); setCities(d.filterOptions?.cities || []);
      setActTypes(d.filterOptions?.actTypes || []); setClimbCats(d.filterOptions?.climbCats || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: LM, fontSize: 16 }}>Loading segments... this may take a moment</div>;
  if (segments.length === 0) return <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: "2px solid #1a1a1a", padding: 20, color: LM, fontSize: 15 }}>No starred segments. Star segments in Strava to see them here.</div>;

  const climbLabels: Record<number, string> = { 0: "NC", 1: "Cat 4", 2: "Cat 3", 3: "Cat 2", 4: "Cat 1", 5: "HC" };
  const filtered = segments.filter(s => {
    if (filterCity !== "All" && s.city !== filterCity) return false;
    if (filterType !== "All" && s.activity_type !== filterType) return false;
    if (filterClimb !== "All" && s.climb_category !== parseInt(filterClimb)) return false;
    return true;
  });
  const selectStyle = { background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, border: "0.5px solid rgba(255,255,255,0.1)", color: LM, padding: "6px 12px", fontSize: 13, cursor: "pointer", appearance: "none" as const, paddingRight: 24, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23fef08a'%3E%3Cpath d='M2 4l4 4 4-4'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5 }}>Filter</div>
        {cities.length > 0 && <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} style={selectStyle}><option value="All">All locations</option>{cities.map(c => <option key={c} value={c}>{c}</option>)}</select>}
        {actTypes.length > 1 && <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={selectStyle}><option value="All">All types</option>{actTypes.map(t => <option key={t} value={t}>{t}</option>)}</select>}
        <select value={filterClimb} onChange={(e) => setFilterClimb(e.target.value)} style={selectStyle}><option value="All">All climbs</option>{climbCats.map(c => <option key={c} value={c.toString()}>{climbLabels[c] || `Cat ${c}`}</option>)}</select>
        <span style={{ fontSize: 13, color: LM }}>{filtered.length} of {segments.length} segments</span>
      </div>
      {filtered.map(seg => (
        <div key={seg.id} style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: `2px solid ${expanded === seg.id ? AC : "#1a1a1a"}`, marginBottom: 2, transition: "border-color 0.15s" }}>
          <button onClick={() => setExpanded(expanded === seg.id ? null : seg.id)} style={{ width: "100%", textAlign: "left", padding: "16px 18px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, color: "#e8e8e8", fontWeight: 500 }}>{seg.name}</span>
                {seg.climb_category > 0 && <span style={{ fontSize: 11, padding: "2px 8px", background: "#0a2a0a", color: AC, textTransform: "uppercase", letterSpacing: 0.5 }}>{climbLabels[seg.climb_category]}</span>}
                <span style={{ fontSize: 11, color: LM, opacity: 0.6 }}>{seg.activity_type}</span>
              </div>
              <div style={{ fontSize: 13, color: LM, marginTop: 4 }}>{seg.distance_mi} mi // {seg.avg_grade}% avg // {seg.elevation_ft} ft{seg.city ? ` // ${seg.city}, ${seg.state}` : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              {seg.pr && <div style={{ fontSize: 16, fontWeight: 500, color: AC }}>{seg.pr}</div>}
              {seg.rank && seg.totalEntries && (
                <div style={{ fontSize: 13, color: LM, marginTop: 2 }}>Rank {seg.rank.toLocaleString()} / {seg.totalEntries.toLocaleString()}</div>
              )}
              <div style={{ fontSize: 12, color: LM, opacity: 0.6 }}>{seg.totalEfforts} efforts</div>
            </div>
          </button>
          {expanded === seg.id && seg.recentEfforts.length > 0 && (
            <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.08)", padding: "14px 18px" }}>
              <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Recent efforts</div>
              <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: "0.5px solid rgba(255,255,255,0.05)" }}>
                  {["Date","Time","HR","Power"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 0", fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>)}
                </tr></thead>
                <tbody>{seg.recentEfforts.map((e, i) => (
                  <tr key={i} style={{ borderBottom: "0.5px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "8px 0", color: LM }}>{e.date}</td>
                    <td style={{ padding: "8px 0", color: "#e8e8e8", fontWeight: 500, fontSize: 15 }}>{e.time}</td>
                    <td style={{ padding: "8px 0", color: LM }}>{e.avg_hr || "-"}</td>
                    <td style={{ padding: "8px 0", color: LM }}>{e.avg_watts ? `${e.avg_watts}W` : "-"}</td>
                  </tr>
                ))}</tbody>
              </table>
              {seg.prDate && <div style={{ fontSize: 13, color: LM, marginTop: 10 }}>PR set {seg.prDate}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

