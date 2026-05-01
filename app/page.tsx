"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
  ComposedChart, ReferenceLine,
} from "recharts";
import PeakPerformance from "./components/PeakPerformance";
import SegmentsView from "./components/Segments";
import TrainingZones from "./components/TrainingZones";

const HeatmapMap = dynamic(() => import("./components/HeatmapMap"), { ssr: false });

const YEAR_COLORS: Record<string, string> = {};
const PALETTE = ["#4ade80","#3b82f6","#22c55e","#ef4444","#eab308","#a855f7","#ec4899","#06b6d4","#84cc16","#c026d3","#f97316","#14b8a6"];
const AC = "#4ade80";
const LM = "#fef08a";

type Metric = "distance" | "elevation" | "time";
type Tab = "overview" | "yoy" | "pmc" | "zones" | "activities" | "heatmap" | "peaks" | "segments";
type ActFilter = "All" | "Ride" | "Run" | "VirtualRide" | "Walk" | "Hike" | "Other";

const METRIC_LABELS: Record<Metric, string> = { distance: "Distance (mi)", elevation: "Elevation (ft)", time: "Time (hrs)" };
const MONTH_TICKS = [1,31,61,91,121,151,181,211,244,274,304,334];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatDay(day: number): string {
  const idx = MONTH_TICKS.findIndex((t, i) => i < MONTH_TICKS.length - 1 ? day < MONTH_TICKS[i + 1] : true);
  return MONTH_NAMES[idx] || "";
}

interface YearTotals { distance: number; elevation: number; time: number; count: number }
interface PMCPoint { date: string; tss: number; ctl: number; atl: number; tsb: number }
interface CalDay { date: string; distance: number; count: number; time: number }
interface SummaryBlock { distance: number; elevation: number; time: number; count: number }
interface GearItem { id: string; name: string; distance: number; time: number; count: number; lastUsed: string; retired: boolean }
interface TypeItem { type: string; count: number; distance: number; time: number }

function CalendarHeatmap({ data }: { data: CalDay[] }) {
  if (data.length === 0) return null;
  const maxDist = Math.max(...data.map(d => d.distance), 1);
  const weeks: CalDay[][] = [];
  for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i + 7));
  function getColor(dist: number): string {
    if (dist === 0) return "#161616";
    const intensity = Math.min(dist / maxDist, 1);
    if (intensity < 0.25) return "#0a2a0a";
    if (intensity < 0.5) return "#1a4a1a";
    if (intensity < 0.75) return "#2d8a2d";
    return AC;
  }
  const dayLabels = ["","M","","W","","F",""];
  const monthLabels: { week: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => { if (week[0]) { const m = new Date(week[0].date).getMonth(); if (m !== lastMonth) { monthLabels.push({ week: wi, label: MONTH_NAMES[m] }); lastMonth = m; } } });
  const filteredMonthLabels = monthLabels.filter((ml, i, arr) => i === 0 || (ml.week - arr[i-1].week) * 13 >= 30);
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 500 }}>
        <div style={{ display: "flex", marginLeft: 36, marginBottom: 6, position: "relative", height: 18 }}>
          {filteredMonthLabels.map((ml, i) => (<div key={i} style={{ position: "absolute", left: ml.week * 13, fontSize: 10, color: LM, letterSpacing: 0.3, whiteSpace: "nowrap" }}>{ml.label}</div>))}
        </div>
        <div style={{ display: "flex", gap: 1 }}><div style={{ display: "flex", flexDirection: "column", gap: 1, marginRight: 4 }}>
            {dayLabels.map((d, i) => (<div key={i} style={{ width: 12, height: 12, display: "flex", alignItems: "center", justifyContent: "flex-end", fontSize: 9, color: LM, paddingRight: 2 }}>{d}</div>))}
          </div>
          <div style={{ display: "flex", gap: 1 }}>{weeks.map((week, wi) => (<div key={wi} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {week.map((day, di) => (<div key={di} style={{ width: 12, height: 12, background: getColor(day.distance), cursor: "default" }} title={`${day.date}: ${day.distance} mi, ${day.count} activities`} />))}
            </div>))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, marginLeft: 36, fontSize: 14, color: LM }}>
          <span>Less</span>
          {["#161616","#0a2a0a","#1a4a1a","#2d8a2d",AC].map((c, i) => (<div key={i} style={{ width: 12, height: 12, background: c }} />))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

const tooltipStyle = { backgroundColor: "#111", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 13, color: "#e8e8e8" };

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [athleteName, setAthleteName] = useState("");
  const [athleteId, setAthleteId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  const [years, setYears] = useState<string[]>([]);
  const [cumData, setCumData] = useState<Record<string, unknown>[]>([]);
  const [monthlyData, setMonthlyData] = useState<Record<string, unknown>[]>([]);
  const [yearTotals, setYearTotals] = useState<Record<string, YearTotals>>({});
  const [metric, setMetric] = useState<Metric>("distance");
  const [visibleYears, setVisibleYears] = useState<Set<string>>(new Set());

  const [pmcData, setPmcData] = useState<PMCPoint[]>([]);
  const [currentCTL, setCurrentCTL] = useState(0);
  const [currentATL, setCurrentATL] = useState(0);
  const [currentTSB, setCurrentTSB] = useState(0);

  const [runProfile, setRunProfile] = useState<any[]>([]);
  const [rideProfile, setRideProfile] = useState<any[]>([]);
  const [calendar, setCalendar] = useState<CalDay[]>([]);
  const [summary, setSummary] = useState<Record<string, SummaryBlock>>({});
  const [typeBreakdown, setTypeBreakdown] = useState<TypeItem[]>([]);
  const [gearList, setGearList] = useState<GearItem[]>([]);

  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  const [actList, setActList] = useState<any[]>([]);
  const [actTotal, setActTotal] = useState(0);
  const [actPage, setActPage] = useState(1);
  const [actLoading, setActLoading] = useState(false);
  const [actFilter, setActFilter] = useState<ActFilter>("All");
  const [actSort, setActSort] = useState<string>("start_date_local");
  const [actSortDir, setActSortDir] = useState<string>("desc");

  const [showTypeModal, setShowTypeModal] = useState<string | null>(null);
  const [typeModalData, setTypeModalData] = useState<any[]>([]);
  const [typeModalLoading, setTypeModalLoading] = useState(false);
  const [showRetiredGear, setShowRetiredGear] = useState(false);
  const [gearNames, setGearNames] = useState<Record<string, string>>({});
  const [chartLoading, setChartLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>("all");

  useEffect(() => {
    fetch("/api/me").then(r => r.json()).then(data => {
      if (data.authenticated) { setAuthenticated(true); setAthleteId(data.athleteId); if (data.athlete) setAthleteName(data.athlete.firstname || ""); loadAllData(); fetch("/api/activities/gear-names").then(r => r.json()).then(d => setGearNames(d.names || {})); }
      setLoading(false);
    });
  }, []);

  async function loadTypeModal(type: string) {
    setShowTypeModal(type);
    setTypeModalLoading(true);
    const res = await fetch(`/api/activities/list?page=1&limit=200&type=${type}&sort=start_date_local&dir=desc`);
    const data = await res.json();
    setTypeModalData(data.activities || []);
    setTypeModalLoading(false);
  }

  async function loadAllData() { setChartLoading(true); await Promise.all([loadYoY(), loadPMC(), loadOverview(), loadPowerProfile()]); setChartLoading(false); }
  async function loadYoY() {
    const res = await fetch("/api/activities/yearly"); const data = await res.json();
    setYears(data.years || []); setCumData(data.cumulativeChart || []); setMonthlyData(data.monthlyChart || []); setYearTotals(data.yearTotals || {});
    const yrs = data.years || []; setVisibleYears(new Set(yrs.slice(-3)));
    [...yrs].reverse().forEach((y: string, i: number) => { YEAR_COLORS[y] = PALETTE[i % PALETTE.length]; });
  }
  async function loadPowerProfile() {
    const res = await fetch("/api/activities/power-profile");
    const data = await res.json();
    setRunProfile(data.runProfile || []);
    setRideProfile(data.rideProfile || []);
  }
  async function loadPMC() { const res = await fetch("/api/activities/pmc"); const data = await res.json(); setPmcData(data.pmc || []); setCurrentCTL(data.currentCTL || 0); setCurrentATL(data.currentATL || 0); setCurrentTSB(data.currentTSB || 0); }
  async function loadOverview() {
    const res = await fetch("/api/activities/overview"); const data = await res.json(); setCalendar(data.calendar || []); setSummary(data.summary || {}); setTypeBreakdown(data.typeBreakdown || []);
    setGearList(data.gearList || []);
    const gm: Record<string, string> = {}; for (const g of (data.gearList || [])) { gm[g.id] = g.name; }
    setGearNames(gm); }

  async function loadActivities(page: number = 1, type?: string, sort?: string, dir?: string) {
    setActLoading(true);
    const t = type ?? actFilter; const s = sort ?? actSort; const d = dir ?? actSortDir;
    let url = `/api/activities/list?page=${page}&limit=50&sort=${s}&dir=${d}`;
    if (t !== "All") {
      if (t === "Other") { url += "&type=other"; } else { url += `&type=${t}`; }
    }
    const res = await fetch(url); const data = await res.json();
    setActList(data.activities || []); setActTotal(data.total || 0); setActPage(page); setActLoading(false);
  }

  function handleActSort(col: string) {
    const newDir = actSort === col && actSortDir === "desc" ? "asc" : "desc";
    setActSort(col); setActSortDir(newDir);
    loadActivities(1, undefined, col, newDir);
  }

  function handleFilterChange(f: ActFilter) { setActFilter(f); loadActivities(1, f); }

  async function handleSync(fullSync: boolean) {
    if (!athleteId) return; setSyncing(true); setSyncResult(null);
    const res = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ athleteId, fullSync }) });
    const data = await res.json(); setSyncing(false); setSyncResult(res.ok ? data.message : "Error: " + data.error);
    if (res.ok && data.count > 0) loadAllData();
  }
  function toggleYear(year: string) { setVisibleYears(prev => { const next = new Set(prev); if (next.has(year)) next.delete(year); else next.add(year); return next; }); }

  useEffect(() => {
    if (tab === "activities" && actList.length === 0) loadActivities();
    if (tab === "heatmap" && heatmapData.length === 0) { setHeatmapLoading(true); fetch("/api/activities/heatmap").then(r => r.json()).then(d => { setHeatmapData(d.polylines || []); setHeatmapLoading(false); }); }
  }, [tab]);

  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a" }}><div style={{ color: LM, fontSize: 16 }}>Loading...</div></div>;

  if (!authenticated) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0a0a0a" }}>
      <div style={{ fontSize: 15, color: AC, letterSpacing: 4, textTransform: "uppercase", marginBottom: 8 }}>Colonel Mustard</div>
      <div style={{ fontSize: 36, fontWeight: 500, color: "#e8e8e8", marginBottom: 32 }}>Training dashboard</div>
      <a href="/api/auth/strava" style={{ background: AC, color: "#000", padding: "14px 32px", textDecoration: "none", fontSize: 15, fontWeight: 500, letterSpacing: 1, textTransform: "uppercase" }}>Connect with Strava</a>
    </div>
  );

  const displayYears = [...years].reverse();
  const tabs: [Tab, string][] = [["overview","Dashboard"],["yoy","Year // Year"],["pmc","Fitness"],["zones","Zones"],["activities","Rides"],["heatmap","Map"],["peaks","Records"],["segments","Segments"]];
  const sw = summary.thisWeek || { distance:0, elevation:0, time:0, count:0 };
  const lw = summary.lastWeek || { distance:0, elevation:0, time:0, count:0 };
  const pctChange = lw.distance > 0 ? Math.round(((sw.distance - lw.distance) / lw.distance) * 100) : 0;
  const sortArrow = (col: string) => actSort === col ? (actSortDir === "desc" ? " â–¼" : " â–²") : "";
  const actFilters: ActFilter[] = ["All","Ride","Run","VirtualRide","Walk","Hike","Other"];

  return (
    <div style={{ minHeight: "100vh" }}>
      <div style={{ height: 3, background: AC }} />
      <header style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10, background: "rgba(10,10,10,0.7)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
        <div style={{ fontSize: 14, color: AC, letterSpacing: 2, textTransform: "uppercase", fontWeight: 500 }}>Colonel Mustard</div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {tabs.map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, color: tab === t ? AC : LM, letterSpacing: 0.5, transition: "color 0.15s" }}>{label}</button>
          ))}
          <div style={{ width: 1, height: 16, background: "#1a1a1a" }} />
          <button onClick={() => handleSync(false)} disabled={syncing} style={{ background: "none", border: `1px solid ${AC}`, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: AC, textTransform: "uppercase", letterSpacing: 1, opacity: syncing ? 0.4 : 1 }}>{syncing ? "..." : "Sync"}</button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px" }}>
        {syncResult && <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: `2px solid ${AC}`, padding: "10px 14px", marginBottom: 20, fontSize: 14, fontFamily: "monospace", color: LM }}>{syncResult}</div>}

        {/* ===== OVERVIEW ===== */}
        {tab === "overview" && (
          <div>
            {/* Year selector cards */}
            <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
              <button onClick={() => { setSelectedYear("all"); setVisibleYears(new Set(years)); }} style={{ background: selectedYear === "all" ? AC : "transparent", border: selectedYear === "all" ? "none" : "1px solid #1a1a1a", color: selectedYear === "all" ? "#000" : LM, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>All time</button>
              {displayYears.map(y => (
                <button key={y} onClick={() => { setSelectedYear(y); setVisibleYears(new Set([y])); }} style={{ background: selectedYear === y ? AC : "transparent", border: selectedYear === y ? "none" : "1px solid #1a1a1a", color: selectedYear === y ? "#000" : LM, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>{y}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 0, marginBottom: 28, borderBottom: "0.5px solid rgba(255,255,255,0.08)", paddingBottom: 24 }}>
              <div style={{ flex: 1, paddingRight: 20 }}>
                <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5 }}>This week</div>
                <div style={{ fontSize: 56, fontWeight: 500, color: "#e8e8e8", lineHeight: 1, marginTop: 4, letterSpacing: -2 }}>{sw.distance}</div>
                <div style={{ fontSize: 14, color: AC, marginTop: 4 }}>miles {pctChange !== 0 ? `// ${pctChange > 0 ? "+" : ""}${pctChange}%` : ""}</div>
              </div>
              <div style={{ width: 1, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />
              <div style={{ flex: 1, padding: "0 20px" }}>
                <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5 }}>Fitness</div>
                <div style={{ fontSize: 56, fontWeight: 500, color: "#e8e8e8", lineHeight: 1, marginTop: 4, letterSpacing: -2 }}>{currentCTL}</div>
                <div style={{ fontSize: 14, color: LM, marginTop: 4 }}>CTL // 42 day</div>
              </div>
              <div style={{ width: 1, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />
              <div style={{ flex: 1, paddingLeft: 20 }}>
                <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5 }}>Form</div>
                <div style={{ fontSize: 56, fontWeight: 500, color: currentTSB >= 0 ? "#22c55e" : "#ef4444", lineHeight: 1, marginTop: 4, letterSpacing: -2 }}>{currentTSB > 0 ? "+" : ""}{currentTSB}</div>
                <div style={{ fontSize: 14, color: LM, marginTop: 4 }}>{currentTSB >= 0 ? "Fresh // send it" : "Fatigued // recover"}</div>
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: `2px solid ${AC}`, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Cumulative distance // YTD</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={cumData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="none" /><XAxis dataKey="day" tickFormatter={formatDay} ticks={MONTH_TICKS} interval={0} stroke={LM} fontSize={11} /><YAxis stroke={LM} fontSize={11} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [Number(v).toLocaleString() + " mi", n.replace("_distance","")]} labelFormatter={(d) => formatDay(Number(d))} />
                  {displayYears.map((year, i) => visibleYears.has(year) ? <Line key={year} type="monotone" dataKey={`${year}_distance`} stroke={PALETTE[i % PALETTE.length]} strokeWidth={i === 0 ? 2 : 1} dot={false} name={`${year}_distance`} /> : null)}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: "2px solid #1a1a1a", padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Activity // Last 12 months</div>
              <CalendarHeatmap data={calendar} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: `2px solid ${AC}`, padding: 20 }}>
                <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Activity breakdown</div>
                {typeBreakdown.map((t, i) => (
                  <div key={t.type} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 14, color: LM, cursor: "pointer", textDecoration: "underline", textDecorationColor: "#1a1a1a", textUnderlineOffset: 3 }} onClick={(e) => { e.stopPropagation(); loadTypeModal(t.type); }}>{t.type}</span>
                      <span style={{ fontSize: 13, color: LM }}>{t.count} // {t.distance.toLocaleString()} mi</span>
                    </div>
                    <div style={{ height: 4, background: "#1a1a1a" }}><div style={{ height: 4, background: PALETTE[i % PALETTE.length], width: `${(t.count / (typeBreakdown[0]?.count || 1)) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
              <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: "2px solid #1a1a1a", padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5 }}>Gear</div>
                  <button onClick={() => setShowRetiredGear(!showRetiredGear)} style={{ background: "none", border: "0.5px solid rgba(255,255,255,0.1)", color: LM, padding: "3px 10px", cursor: "pointer", fontSize: 11 }}>
                    {showRetiredGear ? "Hide retired" : "Show retired"}
                  </button>
                </div>
                {gearList.filter(g => showRetiredGear || !g.retired).map(g => (
                  <div key={g.id} style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)", paddingBottom: 12, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 15, color: g.retired ? LM : "#e8e8e8" }}>{g.name}{g.retired && <span style={{ fontSize: 10, color: "#555", marginLeft: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Retired</span>}</span>
                      <span style={{ fontSize: 15, color: AC, fontWeight: 500 }}>{g.distance.toLocaleString()} mi</span>
                    </div>
                    <div style={{ fontSize: 13, color: LM, marginTop: 4 }}>{g.count} activities // {g.time} hrs // Last: {g.lastUsed}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== YoY ===== */}
        {tab === "yoy" && (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {displayYears.map(year => {
                const t = yearTotals[year]; if (!t) return null;
                const active = visibleYears.has(year);
                return (
                  <button key={year} onClick={() => toggleYear(year)} style={{ background: active ? "#111" : "#0e0e0e", border: "none", borderLeft: `3px solid ${active ? YEAR_COLORS[year] : "#1a1a1a"}`, padding: "10px 14px", cursor: "pointer", textAlign: "left", opacity: active ? 1 : 0.4, transition: "all 0.15s" }}>
                    <div style={{ fontSize: 13, color: YEAR_COLORS[year], fontWeight: 500 }}>{year}</div>
                    <div style={{ fontSize: 20, color: "#e8e8e8", fontWeight: 500, marginTop: 2 }}>{t.distance.toLocaleString()} mi</div>
                    <div style={{ fontSize: 13, color: LM, marginTop: 2 }}>{t.elevation.toLocaleString()} ft // {t.count} activities</div>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
              {(["distance","elevation","time"] as Metric[]).map(m => (
                <button key={m} onClick={() => setMetric(m)} style={{ background: metric === m ? AC : "transparent", border: metric === m ? "none" : "1px solid #1a1a1a", color: metric === m ? "#000" : LM, padding: "7px 16px", cursor: "pointer", fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>{m}</button>
              ))}
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: `2px solid ${AC}`, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Cumulative {metric}</div>
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={cumData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="none" /><XAxis dataKey="day" tickFormatter={formatDay} ticks={MONTH_TICKS} interval={0} stroke={LM} fontSize={11} /><YAxis stroke={LM} fontSize={11} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => { const unit = metric === "distance" ? " mi" : metric === "elevation" ? " ft" : " hrs"; return [Number(v).toLocaleString() + unit, n.replace(`_${metric}`,"")]; }} labelFormatter={(d) => formatDay(Number(d))} />
                  {displayYears.map(year => visibleYears.has(year) ? <Line key={year} type="monotone" dataKey={`${year}_${metric}`} stroke={YEAR_COLORS[year]} strokeWidth={year === displayYears[0] ? 2.5 : 1.5} dot={false} name={`${year}_${metric}`} /> : null)}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: "2px solid #1a1a1a", padding: 20 }}>
              <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Monthly {metric}</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="none" /><XAxis dataKey="month" stroke={LM} fontSize={11} /><YAxis stroke={LM} fontSize={11} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => { const unit = metric === "distance" ? " mi" : metric === "elevation" ? " ft" : " hrs"; return [Number(v).toLocaleString() + unit, n.replace(`_${metric}`,"")]; }} />
                  <Legend formatter={(v) => v.replace(`_${metric}`,"")} wrapperStyle={{ fontSize: 13, color: LM }} />
                  {displayYears.map(year => visibleYears.has(year) ? <Bar key={year} dataKey={`${year}_${metric}`} fill={YEAR_COLORS[year]} name={`${year}_${metric}`} /> : null)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ===== PMC ===== */}
        {tab === "pmc" && (
          <div>
            <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "0.5px solid rgba(255,255,255,0.08)", paddingBottom: 20 }}>
              <div style={{ flex: 1, paddingRight: 20 }}>
                <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5 }}>Fitness // CTL</div>
                <div style={{ fontSize: 48, fontWeight: 500, color: "#3b82f6", lineHeight: 1, marginTop: 4 }}>{currentCTL}</div>
                <div style={{ fontSize: 14, color: LM, marginTop: 4 }}>42-day load</div>
              </div>
              <div style={{ width: 1, background: "#1a1a1a" }} />
              <div style={{ flex: 1, padding: "0 20px" }}>
                <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5 }}>Fatigue // ATL</div>
                <div style={{ fontSize: 48, fontWeight: 500, color: "#ef4444", lineHeight: 1, marginTop: 4 }}>{currentATL}</div>
                <div style={{ fontSize: 14, color: LM, marginTop: 4 }}>7-day load</div>
              </div>
              <div style={{ width: 1, background: "#1a1a1a" }} />
              <div style={{ flex: 1, paddingLeft: 20 }}>
                <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5 }}>Form // TSB</div>
                <div style={{ fontSize: 48, fontWeight: 500, color: currentTSB >= 0 ? "#22c55e" : "#ef4444", lineHeight: 1, marginTop: 4 }}>{currentTSB > 0 ? "+" : ""}{currentTSB}</div>
                <div style={{ fontSize: 14, color: LM, marginTop: 4 }}>{currentTSB >= 0 ? "Fresh" : "Fatigued"}</div>
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: "2px solid #3b82f6", padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Performance management chart // 365 days</div>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={pmcData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="none" />
                  <XAxis dataKey="date" stroke={LM} fontSize={11} tickFormatter={(d) => { const dt = new Date(d); return MONTH_NAMES[dt.getMonth()]; }} interval={30} />
                  <YAxis stroke={LM} fontSize={11} /><ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} formatter={(v: any, n: any) => { const labels: Record<string, string> = { ctl: "Fitness", atl: "Fatigue", tsb: "Form", tss: "TSS" }; return [Number(v).toFixed(1), labels[n] || n]; }} />
                  <Bar dataKey="tss" fill="#1a1a1a" barSize={2} name="tss" />
                  <Line type="monotone" dataKey="ctl" stroke="#3b82f6" strokeWidth={2} dot={false} name="ctl" />
                  <Line type="monotone" dataKey="atl" stroke="#ef4444" strokeWidth={1.5} dot={false} name="atl" />
                  <Line type="monotone" dataKey="tsb" stroke="#22c55e" strokeWidth={1} dot={false} name="tsb" strokeDasharray="4 2" />
                </ComposedChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div style={{ display: "flex", gap: 20, marginTop: 16, paddingTop: 12, borderTop: "0.5px solid rgba(255,255,255,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 20, height: 3, background: "#3b82f6" }} /><span style={{ fontSize: 13, color: LM }}>Fitness (CTL) // 42-day avg</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 20, height: 3, background: "#ef4444" }} /><span style={{ fontSize: 13, color: LM }}>Fatigue (ATL) // 7-day avg</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 20, height: 3, background: "#22c55e", borderTop: "1px dashed #22c55e" }} /><span style={{ fontSize: 13, color: LM }}>Form (TSB) // CTL minus ATL</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 20, height: 8, background: "#1a1a1a" }} /><span style={{ fontSize: 13, color: LM }}>Daily training stress</span></div>
              </div>
            </div>
            {/* How to read */}
            <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: "2px solid #1a1a1a", padding: 20 }}>
              <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>How to use this chart</div>
              <div style={{ fontSize: 14, color: LM, lineHeight: 1.8 }}>
                <strong style={{ color: "#3b82f6" }}>Fitness (CTL)</strong> is your long-term training load. Higher means you've been consistently training. It takes weeks to build and weeks to lose.<br/>
                <strong style={{ color: "#ef4444" }}>Fatigue (ATL)</strong> is your short-term load. It spikes after hard training blocks and drops quickly with rest.<br/>
                <strong style={{ color: "#22c55e" }}>Form (TSB)</strong> is the gap between fitness and fatigue. When positive, you're fresh and ready to perform. When negative, you're carrying fatigue and should consider recovery.<br/><br/>
                <span style={{ color: "#e8e8e8" }}>Sweet spot:</span> TSB between -10 and +15 is ideal for race readiness. Deep negative (below -20) means you're overreaching. High positive (above +25) means you're losing fitness from too much rest.
              </div>
            </div>
            {/* Power Profile */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
              <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: "2px solid #4ade80", padding: 20 }}>
                <div style={{ fontSize: 11, color: "#fef08a", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 16 }}>Running bests</div>
                {runProfile.map((r: any) => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "0.5px solid rgba(255,255,255,0.08)", padding: "10px 0" }}>
                    <div>
                      <div style={{ fontSize: 14, color: "#e8e8e8", fontWeight: 500 }}>{r.label}</div>
                      {r.date && <div style={{ fontSize: 12, color: "#fef08a" }}>{r.date}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {r.pace ? (<><div style={{ fontSize: 18, color: "#4ade80", fontWeight: 500 }}>{r.time}</div><div style={{ fontSize: 12, color: "#fef08a" }}>{r.pace} /mi</div></>) : (<div style={{ fontSize: 14, color: "#fef08a" }}>--</div>)}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, borderLeft: "2px solid #3b82f6", padding: 20 }}>
                <div style={{ fontSize: 11, color: "#fef08a", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 16 }}>Cycling bests</div>
                {rideProfile.map((r: any) => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "0.5px solid rgba(255,255,255,0.08)", padding: "10px 0" }}>
                    <div>
                      <div style={{ fontSize: 14, color: "#e8e8e8", fontWeight: 500 }}>{r.label}</div>
                      {r.date && <div style={{ fontSize: 12, color: "#fef08a" }}>{r.date}</div>}
                    </div>
                    <div style={{ fontSize: 18, color: r.value > 0 ? "#3b82f6" : "#fef08a", fontWeight: 500 }}>{r.formatted}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        
        {/* ===== ACTIVITIES ===== */}
        {tab === "activities" && (
          <div>
            {/* Type filter toggles */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
              {actFilters.map(f => (
                <button key={f} onClick={() => handleFilterChange(f)} style={{
                  background: actFilter === f ? AC : "transparent", border: actFilter === f ? "none" : "1px solid #1a1a1a",
                  color: actFilter === f ? "#000" : LM, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500,
                }}>{f === "VirtualRide" ? "Virtual" : f}</button>
              ))}
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12 }}>
              <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
                    {[
                      { key: "start_date_local", label: "Date" },
                      { key: "name", label: "Name" },
                      { key: "type", label: "Type" },
                      { key: "distance", label: "Distance" },
                      { key: "moving_time", label: "Duration" },
                      { key: "average_speed", label: "Pace" },
                      { key: "total_elevation_gain", label: "Elev" },
                      { key: "gear_id", label: "Gear" },{ key: "average_heartrate", label: "HR" },
                    ].map(h => (
                      <th key={h.key} onClick={() => handleActSort(h.key)} style={{
                        textAlign: h.key === "name" || h.key === "start_date_local" || h.key === "type" || h.key === "gear_id" ? "left" : "right",
                        padding: "12px 14px", fontSize: 11, color: actSort === h.key ? AC : LM, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", userSelect: "none",
                      }}>{h.label}{sortArrow(h.key)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {actLoading ? <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: LM }}>Loading...</td></tr> :
                    actList.map((a: any) => (
                      <tr key={a.id} style={{ borderBottom: "1px solid #111", cursor: "pointer" }} onClick={() => window.location.href = `/activity?id=${a.id}`}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ padding: "12px 14px", color: LM, whiteSpace: "nowrap" }}>{a.date}</td>
                        <td style={{ padding: "12px 14px", color: "#e8e8e8", fontWeight: 500, fontSize: 15, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</td>
                        <td style={{ padding: "12px 14px", color: LM }}>{a.type}</td>
                        <td style={{ padding: "12px 14px", textAlign: "right", color: AC, fontSize: 15 }}>{a.distance_mi} mi</td>
                        <td style={{ padding: "12px 14px", textAlign: "right", color: LM }}>{a.duration}</td>
                        <td style={{ padding: "12px 14px", textAlign: "right", color: LM }}>{a.pace || "-"}</td>
                        <td style={{ padding: "12px 14px", textAlign: "right", color: LM }}>{a.elevation_ft} ft</td>
                        <td style={{ padding: "12px 14px", color: LM, fontSize: 13, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{gearNames[a.gear_id] || "-"}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", color: LM }}>{a.average_heartrate ? Math.round(a.average_heartrate) : "-"}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
              {actTotal > 50 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px", borderTop: "0.5px solid rgba(255,255,255,0.08)" }}>
                  <span style={{ fontSize: 13, color: LM }}>{(actPage-1)*50+1}-{Math.min(actPage*50, actTotal)} of {actTotal}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => loadActivities(actPage - 1)} disabled={actPage <= 1} style={{ background: "none", border: "0.5px solid rgba(255,255,255,0.1)", color: LM, padding: "5px 14px", cursor: "pointer", fontSize: 13, opacity: actPage <= 1 ? 0.3 : 1 }}>Prev</button>
                    <button onClick={() => loadActivities(actPage + 1)} disabled={actPage * 50 >= actTotal} style={{ background: "none", border: "0.5px solid rgba(255,255,255,0.1)", color: LM, padding: "5px 14px", cursor: "pointer", fontSize: 13, opacity: actPage * 50 >= actTotal ? 0.3 : 1 }}>Next</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "heatmap" && (
          <div>
            <div style={{ fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Route heatmap // {heatmapData.length} activities</div>
            <div style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 12, height: 600, overflow: "hidden" }}>
              {heatmapLoading ? <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: LM }}>Loading routes...</div> : <HeatmapMap polylines={heatmapData} />}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 14, color: LM }}>
              <span><span style={{ display: "inline-block", width: 14, height: 3, background: AC, marginRight: 6, verticalAlign: "middle" }} />Runs</span>
              <span><span style={{ display: "inline-block", width: 14, height: 3, background: "#3b82f6", marginRight: 6, verticalAlign: "middle" }} />Rides</span>
              <span><span style={{ display: "inline-block", width: 14, height: 3, background: "#22c55e", marginRight: 6, verticalAlign: "middle" }} />Other</span>
            </div>
          </div>
        )}

        {tab === "zones" && <TrainingZones />}

        {tab === "peaks" && <PeakPerformance />}
        {tab === "segments" && <SegmentsView />}

        {/* Activity Type Modal */}
        {showTypeModal && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(10,10,30,0.7)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowTypeModal(null)}>
            <div style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "0.5px solid rgba(255,255,255,0.1)", width: "90%", maxWidth: 900, maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 14, color: AC, textTransform: "uppercase", letterSpacing: 1.5 }}>{showTypeModal} activities // {typeModalData.length}</div>
                <button onClick={() => setShowTypeModal(null)} style={{ background: "none", border: "none", color: LM, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>x</button>
              </div>
              <div style={{ overflow: "auto", flex: 1 }}>
                {typeModalLoading ? (
                  <div style={{ padding: 40, textAlign: "center", color: LM }}>Loading...</div>
                ) : (
                  <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
                    <thead><tr style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)", position: "sticky", top: 0, background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
                      {["Date","Name","Distance","Duration","Pace","Elev","HR"].map(h => (
                        <th key={h} style={{ textAlign: h === "Name" || h === "Date" ? "left" : "right", padding: "10px 14px", fontSize: 11, color: LM, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {typeModalData.map((a: any) => (
                        <tr key={a.id} style={{ borderBottom: "1px solid #111", cursor: "pointer" }}
                          onClick={() => { setShowTypeModal(null); window.location.href = `/activity?id=${a.id}`; }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <td style={{ padding: "10px 14px", color: LM, whiteSpace: "nowrap" }}>{a.date}</td>
                          <td style={{ padding: "10px 14px", color: "#e8e8e8", fontWeight: 500, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: AC }}>{a.distance_mi} mi</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: LM }}>{a.duration}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: LM }}>{a.pace || "-"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: LM }}>{a.elevation_ft} ft</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: LM }}>{a.average_heartrate ? Math.round(a.average_heartrate) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}





