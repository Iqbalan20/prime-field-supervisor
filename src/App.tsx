// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { storage, loadRemoteData } from "./lib/storage";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { signInWithPassword, getSession as getSupabaseSession, signOut as supabaseSignOut, supabaseConfigured, createAuthAccount } from "./lib/supabase";

/* ============================================================
   PRIME FIELD SUPERVISOR — interactive prototype
   Design tokens (Prime brand palette):
   - bg canvas (Off White):  #F2F2F2
   - surface (White):        #FFFFFF
   - ink (Charcoal Black):   #282828
   - ink-mute:                #6B6B6B
   - line:                    #E2E2E2
   - navy/dark chrome (Dark Black): #222222
   - navy-2 (Charcoal Black): #282828
   - amber/primary accent (Prime Red): #9F1211
   - danger (Light Red):      #C06565
   - success:    #1F9D63
   - warning:    #E0A93A
   - info:       #2E6FE0
   Type: display = "Space Grotesk", body = "Inter", mono (ids/gps/data) = "IBM Plex Mono"
   ============================================================ */

const FONT_LINK_ID = "pfs-fonts";
function useFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }, []);
}

const GLOBAL_STYLE_ID = "pfs-global-styles";
function useGlobalStyles() {
  useEffect(() => {
    if (document.getElementById(GLOBAL_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = GLOBAL_STYLE_ID;
    style.textContent = `
      * { box-sizing: border-box; }
      html, body, #root { width: 100%; max-width: 100vw; overflow-x: hidden; margin: 0; padding: 0; }
      @media (max-width: 860px) {
        .pfs-admin-sidebar { width: 64px !important; }
        .pfs-admin-sidebar .pfs-nav-label,
        .pfs-admin-sidebar .pfs-brand-label,
        .pfs-admin-sidebar .pfs-user-block { display: none !important; }
        .pfs-admin-search { width: 100% !important; max-width: 100% !important; }
        .pfs-admin-topbar { flex-wrap: wrap; gap: 8px; }
      }
    `;
    document.head.appendChild(style);
  }, []);
}

/* ---------------------------------------------------------------- */
/* Utilities                                                          */
/* ---------------------------------------------------------------- */

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDuration(startIso, endIso) {
  if (!startIso || !endIso) return "—";
  const ms = new Date(endIso) - new Date(startIso);
  if (ms < 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------- */
/* Demo data seed                                                     */
/* ---------------------------------------------------------------- */

// Base coordinates roughly around Gurugram/Delhi NCR for realistic clustering
const BASE = { lat: 28.45, lng: 77.03 };
function jitter(n) {
  return n + (Math.random() - 0.5) * 0.09;
}

const CLIENT_NAMES = ["ABC Manufacturing", "XYZ Industries", "Prime Logistics", "Global Auto Components"];
const SITE_TEMPLATES = [
  ["Faridabad Plant", "ABC Manufacturing"],
  ["Gurugram Warehouse", "Prime Logistics"],
  ["Noida Factory", "XYZ Industries"],
  ["Delhi Office", "Global Auto Components"],
  ["Manesar Unit-2", "ABC Manufacturing"],
  ["Okhla Depot", "Prime Logistics"],
  ["Sector 63 Facility", "XYZ Industries"],
  ["Dwarka Corporate Park", "Global Auto Components"],
  ["Sonipat Warehouse", "Prime Logistics"],
  ["Bahadurgarh Unit", "ABC Manufacturing"],
];
const FIRST_NAMES = ["Ravi", "Ankit", "Suresh", "Manoj", "Deepak", "Vikram", "Sanjay", "Rahul", "Amit", "Pramod",
  "Neha", "Priya", "Kavita", "Sunita", "Pooja"];
const LAST_NAMES = ["Kumar", "Sharma", "Singh", "Verma", "Yadav", "Gupta", "Rana", "Chauhan", "Mehta", "Joshi"];
function personName(i) {
  return `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[(i * 3) % LAST_NAMES.length]}`;
}

function buildSeed() {
  const sites = SITE_TEMPLATES.map((t, i) => ({
    id: uid("site"),
    name: t[0],
    client: t[1],
    address: `${t[0]}, NCR Region`,
    lat: jitter(BASE.lat),
    lng: jitter(BASE.lng),
    geofenceM: 100,
    employeeCount: 6 + Math.floor(Math.random() * 14),
    visitFrequency: "Daily",
    status: "Active",
    supervisorId: null,
  }));

  const supervisors = Array.from({ length: 10 }).map((_, i) => ({
    id: uid("sup"),
    empId: `PFS-SUP-${String(i + 1).padStart(3, "0")}`,
    name: personName(i),
    phone: `98${String(10000000 + i * 137).slice(0, 8)}`,
    email: `${personName(i).toLowerCase().replace(" ", ".")}@primefield.com`,
    password: `Prime@${String(i + 1).padStart(3, "0")}`,
    department: "Operations",
    joined: "2023-0" + ((i % 9) + 1) + "-12",
    status: i < 8 ? "Active" : "Inactive",
    assignedSiteIds: [],
  }));

  // assign 1-2 sites per supervisor, ensure every site has a supervisor
  sites.forEach((s, i) => {
    const sup = supervisors[i % supervisors.length];
    sup.assignedSiteIds.push(s.id);
    s.supervisorId = sup.id;
  });

  const employees = [];
  sites.forEach((s) => {
    for (let i = 0; i < s.employeeCount; i++) {
      employees.push({
        id: uid("emp"),
        empId: `EMP-${employees.length + 1}`.padStart(7, "0"),
        name: personName(employees.length + 3),
        designation: ["Security Guard", "Housekeeping", "Technician", "Machine Operator", "Helper"][
          employees.length % 5
        ],
        client: s.client,
        siteId: s.id,
        shift: employees.length % 2 === 0 ? "Day (9-6)" : "Night (9-6)",
        status: "Active",
        supervisorId: s.supervisorId || null,
      });
    }
  });

  const today = todayStr();
  const visits = [];
  const attendance = [];
  supervisors.forEach((sup) => {
    sup.assignedSiteIds.forEach((siteId, idx) => {
      if (idx === 0 && Math.random() > 0.35) {
        const site = sites.find((s) => s.id === siteId);
        const ci = new Date();
        ci.setHours(9, 20 + Math.floor(Math.random() * 30), 0, 0);
        const co = new Date(ci);
        co.setHours(ci.getHours() + 1, ci.getMinutes() + 35, 0, 0);
        const completed = Math.random() > 0.4;
        visits.push({
          id: uid("visit"),
          supervisorId: sup.id,
          siteId,
          date: today,
          checkinTime: ci.toISOString(),
          checkoutTime: completed ? co.toISOString() : null,
          distance: Math.floor(Math.random() * 60),
          status: completed ? "Completed" : "In Progress",
          notes: "",
        });
        // seed attendance for that site
        employees
          .filter((e) => e.siteId === siteId)
          .forEach((e) => {
            const r = Math.random();
            attendance.push({
              id: uid("att"),
              employeeId: e.id,
              siteId,
              date: today,
              status: r > 0.9 ? "Absent" : r > 0.82 ? "Late" : "Present",
              markedBy: sup.id,
              time: ci.toISOString(),
            });
          });
      }
    });
  });

  const incidents = [
    {
      id: uid("inc"),
      siteId: sites[1].id,
      supervisorId: supervisors[1].id,
      date: new Date().toISOString(),
      category: "Safety issue",
      severity: "High",
      description: "Damaged fire extinguisher near loading bay, needs replacement.",
      status: "Open",
    },
    {
      id: uid("inc"),
      siteId: sites[3].id,
      supervisorId: supervisors[3].id,
      date: new Date(Date.now() - 86400000).toISOString(),
      category: "Worker issue",
      severity: "Medium",
      description: "Two housekeeping staff arrived without uniform, verbal warning issued.",
      status: "Under Review",
    },
    {
      id: uid("inc"),
      siteId: sites[0].id,
      supervisorId: supervisors[0].id,
      date: new Date(Date.now() - 2 * 86400000).toISOString(),
      category: "Equipment issue",
      severity: "Critical",
      description: "Forklift battery leaking, unit taken out of service pending inspection.",
      status: "Resolved",
    },
  ];

  const tasks = supervisors.slice(0, 6).map((sup, i) => ({
    id: uid("task"),
    title: [
      "Verify fire safety equipment",
      "Collect signed attendance sheet",
      "Inspect CCTV coverage",
      "Review uniform compliance",
      "Update site contact register",
      "Submit weekly stock count",
    ][i],
    description: "Routine compliance check for the assigned site.",
    supervisorId: sup.id,
    siteId: sup.assignedSiteIds[0],
    priority: ["Low", "Medium", "High", "Critical", "Medium", "Low"][i],
    dueDate: new Date(Date.now() + (i - 2) * 86400000).toISOString().slice(0, 10),
    status: i < 2 ? "Completed" : i === 5 ? "Overdue" : "Pending",
  }));

  const reports = [];

  const requirements = [
    { id: uid("req"), title: "Security Guards – Day Shift", client: "ABC Manufacturing", siteId: sites[0].id, designation: "Security Guard", openings: 8, closedOpenings: 3, salary: 18000, priority: "High", deadline: new Date(Date.now()+7*86400000).toISOString().slice(0,10), description: "Immediate requirement for day shift guards.", status: "Open", supervisorId: supervisors[0].id, createdAt: new Date().toISOString() },
    { id: uid("req"), title: "Housekeeping Staff", client: "Prime Logistics", siteId: sites[1].id, designation: "Housekeeping", openings: 5, closedOpenings: 2, salary: 15500, priority: "Medium", deadline: new Date(Date.now()+14*86400000).toISOString().slice(0,10), description: "Housekeeping manpower for warehouse operations.", status: "Open", supervisorId: supervisors[1].id, createdAt: new Date().toISOString() },
  ];
  return { sites, supervisors, employees, visits, attendance, incidents, tasks, reports, notifications: [], requirements, labour: [], supervisorAttendance: [] };
}

/* ---------------------------------------------------------------- */
/* Persistence                                                        */
/* ---------------------------------------------------------------- */

const STORAGE_KEY = "pfs-data-v1";

async function loadData() {
  try {
    const res = await storage.get(STORAGE_KEY);
    if (res && res.value) {
      const d = JSON.parse(res.value);
      // Backward-compatible migration for data created by the original prototype.
      d.requirements = d.requirements || [];
      d.labour = d.labour || [];
      d.supervisorAttendance = d.supervisorAttendance || [];
      return d;
    }
  } catch (e) { /* not found or storage unavailable */ }
  return null;
}
async function saveData(data) {
  try {
    await storage.set(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    /* ignore */
  }
}

/* ---------------------------------------------------------------- */
/* Small UI primitives                                                */
/* ---------------------------------------------------------------- */

const COLORS = {
  navy: "#222222",     // Dark Black — was navy blue, now the dark chrome color
  navy2: "#282828",    // Charcoal Black — secondary dark shade
  amber: "#9F1211",    // Prime Red — primary brand accent (buttons, active states)
  success: "#1F9D63",
  danger: "#C06565",   // Light Red — from brand palette, used for error/danger states
  warning: "#E0A93A",
  info: "#2E6FE0",
  ink: "#282828",      // Charcoal Black — body text
  inkMute: "#6B6B6B",
  line: "#E2E2E2",
  canvas: "#F2F2F2",   // Off White — app background
};

function Badge({ tone = "grey", children }) {
  const map = {
    green: { bg: "#E8F7EF", fg: "#177A4C" },
    red: { bg: "#FCEBEC", fg: "#B23336" },
    orange: { bg: "#FDF1E3", fg: "#B36A1F" },
    blue: { bg: "#E9F1FD", fg: "#20509E" },
    grey: { bg: "#EEF0F3", fg: "#5B6572" },
  };
  const c = map[tone] || map.grey;
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        fontSize: 11.5,
        letterSpacing: 0.2,
        padding: "3px 9px",
        borderRadius: 999,
        display: "inline-block",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function statusTone(status) {
  const s = (status || "").toLowerCase();
  if (["active", "present", "completed", "resolved", "online", "approved", "synced"].includes(s)) return "green";
  if (["absent", "critical", "failed", "offline", "overdue", "rejected", "open"].includes(s)) return "red";
  if (["pending", "warning", "late", "under review", "scheduled"].includes(s)) return "orange";
  if (["in progress", "information", "moving", "on site", "submitted", "assigned"].includes(s)) return "blue";
  return "grey";
}

function Card({ children, style, ...rest }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.line}`,
        borderRadius: 18,
        boxShadow: "0 2px 10px rgba(34,34,34,0.05)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

function Button({ children, variant = "primary", size = "md", style, ...rest }) {
  const sizes = { sm: { padding: "7px 12px", fontSize: 12.5 }, md: { padding: "10px 16px", fontSize: 13.5 }, lg: { padding: "14px 18px", fontSize: 15 } };
  const variants = {
    primary: { background: COLORS.navy, color: "#fff", border: "1px solid " + COLORS.navy },
    amber: { background: COLORS.amber, color: "#fff", border: "1px solid " + COLORS.amber },
    ghost: { background: "#fff", color: COLORS.ink, border: `1px solid ${COLORS.line}` },
    danger: { background: "#fff", color: COLORS.danger, border: `1px solid #F3C6C6` },
    subtle: { background: COLORS.canvas, color: COLORS.ink, border: `1px solid ${COLORS.line}` },
  };
  return (
    <button
      style={{
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        borderRadius: 12,
        cursor: "pointer",
        transition: "opacity .15s, transform .05s",
        ...sizes[size],
        ...variants[variant],
        ...style,
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      {...rest}
    >
      {children}
    </button>
  );
}

function Empty({ title, sub }) {
  return (
    <div style={{ textAlign: "center", padding: "36px 16px", color: COLORS.inkMute }}>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 14, color: COLORS.ink }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function KPI({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: "16px 16px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.inkMute, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</div>
      <div
        style={{
          fontFamily: "Space Grotesk, sans-serif",
          fontWeight: 700,
          fontSize: 26,
          marginTop: 6,
          color: tone || COLORS.ink,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const tone = toast.type === "error" ? COLORS.danger : toast.type === "warn" ? COLORS.warning : COLORS.success;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        background: COLORS.navy,
        color: "#fff",
        padding: "12px 18px",
        borderRadius: 12,
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 8px 24px rgba(16,24,38,0.35)",
        zIndex: 999,
        maxWidth: "90%",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 99, background: tone, flexShrink: 0 }} />
      {toast.msg}
    </div>
  );
}

/* Simple positional SVG map — plots sites/supervisors by lat/lng within bounding box.
   This is a lightweight in-house map visual (no external tile dependency);
   swap for Mapbox/Google Maps/Leaflet in production via the same lat/lng props. */
function GeoMap({ sites, supervisors, activeSiteId, onSelectSite, height = 260, locationRecords = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  // Init the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Redraw markers whenever the data changes, without recreating the map/tiles.
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const bounds = [];
    sites.forEach((s) => {
      bounds.push([s.lat, s.lng]);
      const isActive = s.id === activeSiteId;
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:${isActive ? 16 : 11}px;height:${isActive ? 16 : 11}px;border-radius:50% 50% 50% 0;background:${COLORS.navy2};transform:rotate(-45deg);box-shadow:${isActive ? "0 0 0 6px rgba(226,121,46,0.3)" : "0 1px 3px rgba(0,0,0,0.4)"};border:1.5px solid #fff;"></div>`,
        iconSize: [isActive ? 16 : 11, isActive ? 16 : 11],
        iconAnchor: [isActive ? 8 : 5.5, isActive ? 16 : 11],
      });
      const marker = L.marker([s.lat, s.lng], { icon }).addTo(layer);
      marker.bindTooltip(`${s.name} — ${s.client}`, { direction: "top", offset: [0, -10] });
      if (onSelectSite) marker.on("click", () => onSelectSite(s.id));
    });

    supervisors.forEach((sup) => {
      const site = sites.find((s) => s.id === sup.assignedSiteIds?.[0]);
      if (!site) return;
      const live = locationRecords.find((a) => a.supervisorId === sup.id && a.status === "On Duty");
      const lat = live?.currentLat ?? site.lat, lng = live?.currentLng ?? site.lng;
      const online = sup.status === "Active";
      bounds.push([lat, lng]);
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:11px;height:11px;border-radius:99px;background:${online ? COLORS.success : "#98A2B3"};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
        iconSize: [11, 11],
        iconAnchor: [5.5, 5.5],
      });
      L.marker([lat, lng], { icon }).addTo(layer).bindTooltip(sup.name, { direction: "top", offset: [0, -6] });
    });

    if (bounds.length === 1) map.setView(bounds[0], 15);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }, [sites, supervisors, activeSiteId, locationRecords, onSelectSite]);

  // Leaflet needs an explicit size recalculation if the container was hidden/resized.
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 60);
    return () => clearTimeout(t);
  }, [height]);

  return (
    <div style={{ position: "relative", height, borderRadius: 12, overflow: "hidden", border: `1px solid ${COLORS.line}` }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%", background: "#EAF0F8" }} />
      <div style={{ position: "absolute", bottom: 8, left: 10, zIndex: 1000, fontSize: 10.5, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.8)", fontFamily: "IBM Plex Mono, monospace", display: "flex", gap: 10, pointerEvents: "none" }}>
        <span>◆ site</span>
        <span>● supervisor online</span>
      </div>
    </div>
  );
}
function jitter2(n) {
  return n + (Math.random() - 0.5) * 0.01;
}

/* ---------------------------------------------------------------- */
/* Root App                                                           */
/* ---------------------------------------------------------------- */

const DEMO_ACCOUNTS = [
  { role: "SUPER_ADMIN", label: "Super Admin", name: "Alok Mehra", sub: "Full system access" },
  { role: "ADMIN", label: "Operations Manager", name: "Ritu Bansal", sub: "Manage & monitor operations" },
  { role: "SUPERVISOR", label: "Field Supervisor", name: null, sub: "Mobile check-in & site workflows" },
];
const MANAGEMENT_ACCOUNTS = [
  { email: "admin@primegroupco.com", password: "Prime@123", role: "SUPER_ADMIN", name: "Alok Mehra" },
  { email: "manager@primegroupco.com", password: "Prime@456", role: "ADMIN", name: "Ritu Bansal" },
];

export default function App() {
  useFonts();
  useGlobalStyles();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null); // {role, supervisorId?, name}
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const seed = buildSeed();
      const stored = await loadData();
      const sb = getSupabaseSession();
      if (sb && supabaseConfigured) {
        const isManagement = !(sb.user?.email || '').toLowerCase().endsWith('@primefield.local');
        const remote = await loadRemoteData(stored || seed, isManagement);
        if (remote) {
          setData(remote);
          setSession({ role: isManagement ? 'ADMIN' : 'SUPERVISOR', supervisorId: isManagement ? undefined : remote.supervisors[0]?.id, name: isManagement ? (sb.user?.user_metadata?.full_name || sb.user?.email) : remote.supervisors[0]?.name, email: sb.user?.email, empId: remote.supervisors[0]?.empId });
        } else if (stored) setData(stored);
        else setData(seed);
      } else if (stored) setData(stored);
      else { setData(seed); await saveData(seed); }
      setLoading(false);
    })();
  }, []);

  const persist = useCallback((next) => {
    setData(next);
    saveData(next);
  }, []);

  // Background sync: without this, one session's changes (a supervisor
  // clocking in, management adding a site) never appear in an already-open
  // session on the other side until a manual page reload. Poll every 20s
  // and quietly merge in whatever's changed server-side.
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => {
    if (!session || !supabaseConfigured) return;
    const isManagement = session.role !== "SUPERVISOR";
    const interval = setInterval(async () => {
      try {
        const remote = await loadRemoteData(dataRef.current, isManagement);
        if (remote) setData(remote);
      } catch (e) { console.warn("Background sync failed", e); }
    }, 20000);
    return () => clearInterval(interval);
  }, [session?.role]);

  const notify = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  if (loading || !data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.canvas, fontFamily: "Inter, sans-serif", color: COLORS.inkMute }}>
        Loading Prime Field Supervisor…
      </div>
    );
  }

  if (!session) {
    return <LoginScreen data={data} onLogin={setSession} />;
  }

  if (session.role === "SUPERVISOR") {
    return (
      <>
        <SupervisorApp data={data} persist={persist} session={session} onLogout={() => { supabaseSignOut(); setSession(null); }} notify={notify} />
        <Toast toast={toast} />
      </>
    );
  }

  return (
    <>
      <AdminApp data={data} persist={persist} session={session} onLogout={() => { supabaseSignOut(); setSession(null); }} notify={notify} />
      <Toast toast={toast} />
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Login                                                              */
/* ---------------------------------------------------------------- */

function LoginScreen({ data, onLogin }) {
  const [mode, setMode] = useState("management");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      if (!supabaseConfigured) throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      const email = mode === "management" ? identifier.trim().toLowerCase() : `${identifier.trim().toLowerCase()}@primefield.local`;
      const sb = await signInWithPassword(email, password);
      const isManagement = mode === "management";
      const remote = await loadRemoteData(buildSeed(), isManagement);
      const sup = !isManagement ? remote?.supervisors?.find(s => s.empId.toLowerCase() === identifier.trim().toLowerCase()) : null;
      if (!isManagement && !sup) throw new Error("Employee ID is not provisioned in Supabase.");
      if (!isManagement && sup.status !== "Active") throw new Error("This account is inactive. Contact your administrator.");
      onLogin(isManagement ? { role: "ADMIN", name: sb.user?.user_metadata?.full_name || sb.user?.email, email: sb.user?.email } : { role: "SUPERVISOR", supervisorId: sup.id, name: sup.name, empId: sup.empId, email: sb.user?.email });
      window.location.reload();
    } catch (err) { setError(err?.message || "Unable to sign in."); } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:`radial-gradient(1200px 500px at 20% -10%, #282828 0%, ${COLORS.navy} 55%, #141414 100%)`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Inter, sans-serif", padding:20 }}>
      <div style={{ width:"100%", maxWidth:430 }}>
        <div style={{ textAlign:"center", marginBottom:26 }}>
          <div style={{ width:56,height:56,margin:"0 auto 14px",borderRadius:14,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",boxShadow:"0 4px 14px rgba(0,0,0,0.25)" }}><img src="/logo.png" alt="Prime" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
          <div style={{ fontFamily:"Space Grotesk",fontWeight:700,fontSize:22,color:"#fff" }}>Prime Field Supervisor</div>
          <div style={{ color:"#9FB0C9",fontSize:12.5,marginTop:4 }}>Secure workforce & field operations</div>
        </div>
        <Card style={{ padding:22 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,background:COLORS.canvas,padding:5,borderRadius:11,marginBottom:18 }}>
            {[["management","Management"],["supervisor","Field Supervisor"]].map(([v,l]) => (
              <button key={v} type="button" onClick={()=>{setMode(v);setIdentifier("");setPassword("");setError("");}} style={{ border:0,borderRadius:8,padding:"10px 6px",background:mode===v?COLORS.navy:"transparent",color:mode===v?"#fff":COLORS.inkMute,fontWeight:700,cursor:"pointer" }}>{l}</button>
            ))}
          </div>
          <div style={{ fontWeight:700,fontSize:16,marginBottom:4 }}>{mode==="management"?"Management Login":"Supervisor Login"}</div>
          <div style={{ fontSize:12,color:COLORS.inkMute,marginBottom:16 }}>{mode==="management"?"Use your authorized management email.":"Use your Employee ID issued by Prime."}</div>
          <form onSubmit={submit}>
            <Field label={mode==="management"?"Email":"Employee ID"}>
              <input autoComplete="username" value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder={mode==="management"?"admin@primegroupco.com":"PFS-SUP-001"} style={inputStyle}/>
            </Field>
            <Field label="Password">
              <input autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter password" style={inputStyle}/>
            </Field>
            {error && <div style={{ color:COLORS.danger,fontSize:12,background:"#FCEBEC",padding:"9px 11px",borderRadius:8,marginBottom:12 }}>{error}</div>}
            <Button type="submit" variant="amber" style={{width:"100%"}}>{busy ? "Signing in…" : "Sign in securely"}</Button>
          </form>
          <div style={{marginTop:16,fontSize:10.5,color:COLORS.inkMute,lineHeight:1.55}}>
            Production authentication is handled by Supabase. Management uses email/password; supervisors use their Employee ID/password provisioned in Supabase.
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============================================================
   SUPERVISOR MOBILE APP
   ============================================================ */

function SupervisorApp({ data, persist, session, onLogout, notify }) {
  const [tab, setTab] = useState("home");
  const [activeVisitSite, setActiveVisitSite] = useState(null);
  const sup = data.supervisors.find((s) => s.id === session.supervisorId);
  const today = todayStr();

  const mySites = data.sites.filter((s) => sup.assignedSiteIds.includes(s.id));
  const myVisitsToday = data.visits.filter((v) => v.supervisorId === sup.id && v.date === today);
  const openVisit = data.visits.find((v) => v.supervisorId === sup.id && v.status === "In Progress");

  // Keep the supervisor's live location updated while on duty.
  useEffect(() => {
    if (!openVisit || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(pos => {
      const { latitude, longitude, accuracy } = pos.coords;
      const now = new Date().toISOString();
      persist({
        ...data,
        visits: data.visits.map(v => v.id===openVisit.id ? {...v, currentLat:latitude, currentLng:longitude, lastLocationAt:now, gpsAccuracy:accuracy} : v),
        supervisorAttendance: (data.supervisorAttendance||[]).map(a => a.id===openVisit.id ? {...a, currentLat:latitude, currentLng:longitude, lastLocationAt:now, gpsAccuracy:accuracy} : a)
      });
    }, ()=>{}, {enableHighAccuracy:true, maximumAge:5000, timeout:10000});
    return () => navigator.geolocation.clearWatch(watch);
  }, [openVisit?.id]);

  const visitedCount = new Set(myVisitsToday.map((v) => v.siteId)).size;
  const myEmployees = data.employees.filter((e) => mySites.some((s) => s.id === e.siteId));
  const presentToday = data.attendance.filter(
    (a) => a.date === today && a.markedBy === sup.id && a.status === "Present"
  ).length;
  const myIncidentsToday = data.incidents.filter(
    (i) => i.supervisorId === sup.id && i.date.slice(0, 10) === today
  ).length;

  return (
    <div style={{ minHeight: "100vh", background: "#141414", fontFamily: "Inter, sans-serif", padding: "18px 0 0" }}>
      <div
        style={{
          maxWidth: 430,
          margin: "0 auto",
          background: COLORS.canvas,
          minHeight: "94vh",
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* top bar */}
        <div style={{ background: COLORS.navy, padding: "16px 18px 20px", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 12, color: "#9FB0C9" }}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
              <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 19, marginTop: 2 }}>
                Good morning, {sup.name.split(" ")[0]}
              </div>
            </div>
            <button onClick={onLogout} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
              Sign out
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 16 }}>
            {[
              ["Sites", mySites.length],
              ["Visited", visitedCount],
              ["Present", presentToday],
              ["Issues", myIncidentsToday],
            ].map(([l, v]) => (
              <div key={l} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 4px", textAlign: "center" }}>
                <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 17 }}>{v}</div>
                <div style={{ fontSize: 10, color: "#9FB0C9", marginTop: 1 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 90px" }}>
          {tab === "home" && (
            <SupHome
              data={data}
              persist={persist}
              sup={sup}
              mySites={mySites}
              openVisit={openVisit}
              notify={notify}
              goTo={setTab}
              onStartVisit={(siteId) => {
                setActiveVisitSite(siteId);
                setTab("checkin");
              }}
            />
          )}
          {tab === "sites" && (
            <SupSites
              mySites={mySites}
              data={data}
              sup={sup}
              onStartVisit={(siteId) => {
                setActiveVisitSite(siteId);
                setTab("checkin");
              }}
            />
          )}
          {tab === "checkin" && (
            <SupCheckIn
              data={data}
              persist={persist}
              sup={sup}
              siteId={activeVisitSite || (openVisit ? openVisit.siteId : mySites[0]?.id)}
              openVisit={openVisit}
              notify={notify}
              onDone={() => setTab("home")}
            />
          )}
          {tab === "attendance" && <SupAttendance data={data} persist={persist} sup={sup} mySites={mySites} notify={notify} />}
          {tab === "tasks" && <SupTasks data={data} persist={persist} sup={sup} notify={notify} />}
          {tab === "incidents" && <SupIncidentForm data={data} persist={persist} sup={sup} mySites={mySites} notify={notify} goHome={() => setTab("home")} />}
          {tab === "report" && <SupDailyReport data={data} persist={persist} sup={sup} mySites={mySites} notify={notify} goHome={() => setTab("home")} />}
          {tab === "requirements" && <SupRequirements data={data} sup={sup} />}
          {tab === "labour" && <SupLabourMaster data={data} persist={persist} sup={sup} notify={notify} />}
          {tab === "myattendance" && <SupOwnAttendance data={data} sup={sup} />}
          {tab === "profile" && <SupProfile data={data} sup={sup} />}
        </div>

        {/* bottom nav */}
        <div style={{ position: "sticky", bottom: 0, background: "#fff", borderTop: `1px solid ${COLORS.line}`, display: "flex", justifyContent: "space-around", padding: "8px 6px", paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}>
          {[
            ["home", "Home", "⌂"],
            ["requirements", "Jobs", "▣"],
            ["myattendance", "Hours", "◷"],
            ["labour", "ESIC/EPF", "✓"],
            ["profile", "Profile", "◍"],
          ].map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                color: tab === key ? COLORS.amber : COLORS.inkMute,
                fontWeight: 600,
                fontSize: 10,
                padding: "4px 8px",
              }}
            >
              <span style={{ fontSize: 16 }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SupHome({ data, mySites, openVisit, goTo, onStartVisit }) {
  const actions = [
    { key: "checkin", label: openVisit ? "Continue visit / Check out" : "Check in to site", tone: "amber" },
    { key: "attendance", label: "Mark attendance", tone: "primary" },
    { key: "tasks", label: "View tasks", tone: "ghost" },
    { key: "incidents", label: "Report incident", tone: "ghost" },
    { key: "report", label: "Daily report", tone: "ghost" },
    { key: "requirements", label: "Current requirements", tone: "ghost" },
    { key: "labour", label: "ESIC / EPF (my labour)", tone: "ghost" },
    { key: "myattendance", label: "My attendance & hours", tone: "ghost" },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {actions.map((a) => (
          <Button key={a.key} variant={a.tone} onClick={() => goTo(a.key)} style={{ width: "100%", padding: "14px 10px", fontSize: 12.5 }}>
            {a.label}
          </Button>
        ))}
      </div>

      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 14.5, marginBottom: 10, color: COLORS.ink }}>
        Today's assigned sites
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {mySites.map((s) => {
          const visit = data.visits.find((v) => v.siteId === s.id && v.supervisorId === mySites[0] && v.date === todayStr());
          const todaysVisit = data.visits.find((v) => v.siteId === s.id && v.date === todayStr());
          const empCount = data.employees.filter((e) => e.siteId === s.id).length;
          return (
            <Card key={s.id} style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: COLORS.ink }}>{s.name}</div>
                  <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginTop: 2 }}>{s.client}</div>
                </div>
                <Badge tone={statusTone(todaysVisit ? todaysVisit.status : "Scheduled")}>
                  {todaysVisit ? todaysVisit.status : "Not visited"}
                </Badge>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11, color: COLORS.inkMute, fontFamily: "IBM Plex Mono, monospace" }}>
                <span>{empCount} employees</span>
                <span>geofence {s.geofenceM}m</span>
              </div>
              <Button variant="subtle" size="sm" style={{ marginTop: 10, width: "100%" }} onClick={() => onStartVisit(s.id)}>
                {todaysVisit && todaysVisit.status === "In Progress" ? "Resume visit" : "Start visit"}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SupSites({ mySites, data, onStartVisit }) {
  return (
    <div>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 10 }}>My assigned sites</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {mySites.map((s) => (
          <Card key={s.id} style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginTop: 2 }}>{s.address}</div>
            <div style={{ fontSize: 10.5, color: COLORS.inkMute, marginTop: 6, fontFamily: "IBM Plex Mono, monospace" }}>
              {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
            </div>
            <Button variant="ghost" size="sm" style={{ marginTop: 10 }} onClick={() => onStartVisit(s.id)}>
              Open site
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SupCheckIn({ data, persist, sup, siteId, openVisit, notify, onDone }) {
  const [selectedSiteId, setSelectedSiteId] = useState(siteId || sup.assignedSiteIds[0]);
  const [coords, setCoords] = useState(null);
  const [geoStatus, setGeoStatus] = useState("idle");
  const [distance, setDistance] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const activeVisit = openVisit || null;
  const site = data.sites.find(s => s.id === (activeVisit?.siteId || selectedSiteId));

  const [geoError, setGeoError] = useState("");
  const locate = () => {
    if (!site) return;
    setGeoStatus("locating");
    setGeoError("");
    if (!navigator.geolocation) { setGeoStatus("error"); setGeoError("This browser doesn't support location services."); return; }

    const onOk = (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      setCoords({ lat: latitude, lng: longitude, accuracy });
      setDistance(Math.round(haversineMeters(latitude, longitude, site.lat, site.lng)));
      setGeoStatus("ok");
    };
    const messageFor = (err) => {
      if (err.code === 1) return "Location permission denied — enable it for this site in your browser/app settings.";
      if (err.code === 2) return "GPS signal unavailable — try moving outdoors or near a window.";
      return "Location request timed out — retrying with a faster, lower-accuracy method…";
    };

    // First attempt: high accuracy GPS, generous timeout.
    navigator.geolocation.getCurrentPosition(onOk, (err) => {
      setGeoError(messageFor(err));
      if (err.code === 1) { setGeoStatus("error"); return; } // permission denied — retrying won't help
      // Fallback attempt: lower accuracy (network/cell-based), which is faster and more
      // reliable indoors — this is what was missing before and caused clock-out failures.
      navigator.geolocation.getCurrentPosition(onOk, (err2) => {
        setGeoStatus("error");
        setGeoError(messageFor(err2));
      }, { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 });
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});
      setCameraOpen(true);
      setTimeout(()=>{ if(videoRef.current){ videoRef.current.srcObject=stream; videoRef.current.play(); } },50);
    } catch { notify("Camera permission is required for the selfie.", "error"); }
  };
  const stopCamera = () => {
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach(t=>t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  };
  const captureSelfie = () => {
    const video=videoRef.current, canvas=canvasRef.current;
    if (!video || !canvas) return;
    canvas.width=video.videoWidth||640; canvas.height=video.videoHeight||480;
    canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
    setSelfie(canvas.toDataURL("image/jpeg",0.72));
    stopCamera();
  };

  const outOfRange = coords && distance > site.geofenceM;
  const overrideApproved = activeVisit?.overrideStatus === "approved";
  const overridePending = activeVisit?.overrideStatus === "pending";
  const overrideDenied = activeVisit?.overrideStatus === "denied";

  const requestOverride = () => {
    if (!activeVisit) return;
    persist({ ...data, visits: data.visits.map(v => v.id === activeVisit.id ? { ...v, overrideStatus: "pending", overrideRequestedAt: new Date().toISOString() } : v) });
    notify("Request sent to management. You'll be able to clock out once approved.");
  };

  const saveVisit = (checkout=false) => {
    const blockedByGeofence = outOfRange && !(checkout && overrideApproved);
    if (!coords || blockedByGeofence) { notify("Verify your live GPS location inside the site geofence first.","error"); return; }
    if (!selfie) { notify("Take a selfie before clocking in/out.","error"); return; }
    if (checkout) {
      const todayReport = data.reports.find(r=>r.supervisorId===sup.id && r.date===todayStr());
      if (!todayReport) { notify("You cannot clock out until today's daily report is submitted.","error"); return; }
      const now=new Date().toISOString();
      persist({...data, visits:data.visits.map(v=>v.id===activeVisit.id?{...v,checkoutTime:now,checkoutLat:coords.lat,checkoutLng:coords.lng,checkoutSelfie:selfie,status:"Completed"}:v),
        supervisorAttendance:data.supervisorAttendance.map(a=>a.id===activeVisit.id?{...a,clockOut:now,clockOutLat:coords.lat,clockOutLng:coords.lng,clockOutSelfie:selfie,status:"Completed"}:a)});
      notify("Clock-out completed. Working hours recorded.");
      onDone();
    } else {
      const already=data.visits.find(v=>v.supervisorId===sup.id&&v.status==="In Progress");
      if(already){notify("You are already clocked in.","error");return;}
      const now=new Date().toISOString();
      const visit={id:uid("visit"),supervisorId:sup.id,siteId:site.id,date:todayStr(),checkinTime:now,checkoutTime:null,distance,status:"In Progress",notes:"",lat:coords.lat,lng:coords.lng,checkinSelfie:selfie,overrideStatus:"none"};
      const att={id:visit.id,supervisorId:sup.id,siteId:site.id,date:todayStr(),clockIn:now,clockOut:null,clockInLat:coords.lat,clockInLng:coords.lng,clockInSelfie:selfie,status:"On Duty"};
      persist({...data,visits:[visit,...data.visits],supervisorAttendance:[att,...data.supervisorAttendance]});
      notify("Clock-in successful. You are now on duty.");
      onDone();
    }
  };

  if (!site) return <Empty title="No company location assigned"/>;
  return <div>
    <div style={{fontFamily:"Space Grotesk",fontWeight:700,fontSize:16,marginBottom:4}}>{activeVisit?"Clock-out / Working Session":"Clock-in"}</div>
    <div style={{fontSize:12,color:COLORS.inkMute,marginBottom:14}}>Live GPS verification + selfie are required.</div>
    {!activeVisit && <Field label="Select company location">
      <select value={selectedSiteId} onChange={e=>{setSelectedSiteId(e.target.value);setCoords(null);setDistance(null);setGeoStatus("idle");}} style={inputStyle}>
        {data.sites.filter(s=>sup.assignedSiteIds.includes(s.id)).map(s=><option key={s.id} value={s.id}>{s.name} — {s.client}</option>)}
      </select>
    </Field>}
    <Card style={{padding:16,marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><b>{site.name}</b><Badge tone={activeVisit?"blue":"grey"}>{activeVisit?"On Duty":"Ready"}</Badge></div>
      <div style={{fontSize:11.5,color:COLORS.inkMute}}>{site.address}</div>
      <div style={{margin:"16px 0",padding:18,textAlign:"center",background:withinRadiusColor(distance,site.geofenceM),borderRadius:12}}>
        <div style={{fontSize:28}}>📍</div>
        <div style={{fontFamily:"IBM Plex Mono",fontWeight:700,fontSize:18}}>{distance===null?"—":`${distance}m`}</div>
        <div style={{fontSize:11,color:COLORS.inkMute}}>GPS distance • geofence {site.geofenceM}m</div>
      </div>
      {geoStatus==="idle" && <Button onClick={locate} style={{width:"100%"}}>Get live location</Button>}
      {geoStatus==="locating" && <Button disabled style={{width:"100%"}}>Getting live location…</Button>}
      {geoStatus==="error" && <><div style={{color:COLORS.danger,fontSize:12,marginBottom:8}}>{geoError || "Location permission or GPS failed."}</div><Button variant="ghost" onClick={locate} style={{width:"100%"}}>Try again</Button></>}
      {geoStatus==="ok" && outOfRange && !(activeVisit && overrideApproved) && <div style={{color:COLORS.danger,fontSize:12}}>You are outside the allowed geofence.</div>}
      {geoStatus==="ok" && (!outOfRange || (activeVisit && overrideApproved)) && <div style={{color:COLORS.success,fontSize:12,fontWeight:700}}>Location verified {coords?.accuracy?`• accuracy ±${Math.round(coords.accuracy)}m`:""}</div>}
    </Card>
    {activeVisit && geoStatus==="ok" && outOfRange && (
      <Card style={{padding:14,marginBottom:12,background:overrideApproved?"#E8F7EF":overrideDenied?"#FCEBEC":"#FDF1E3"}}>
        {overrideApproved && <div style={{fontSize:12.5,fontWeight:700,color:COLORS.success}}>Management approved an out-of-range clock-out. You can now clock out below.</div>}
        {overridePending && <div style={{fontSize:12.5,color:"#8A5518"}}>Request sent — waiting for management to approve your out-of-range clock-out.</div>}
        {overrideDenied && <div style={{fontSize:12.5,color:COLORS.danger}}>Management denied your out-of-range clock-out request. Please return within the geofence to clock out.</div>}
        {(!activeVisit.overrideStatus || activeVisit.overrideStatus === "none" || overrideDenied) && (
          <Button variant="ghost" onClick={requestOverride} style={{width:"100%",marginTop:8}}>Request permission to clock out from here</Button>
        )}
      </Card>
    )}
    <Card style={{padding:16,marginBottom:12}}>
      <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>Selfie verification</div>
      {selfie ? <img src={selfie} alt="Clock verification selfie" style={{width:"100%",maxHeight:240,objectFit:"cover",borderRadius:10}}/> : <div style={{padding:25,textAlign:"center",background:COLORS.canvas,borderRadius:10,color:COLORS.inkMute,fontSize:12}}>No selfie captured</div>}
      <Button variant="ghost" onClick={startCamera} style={{width:"100%",marginTop:10}}>{selfie?"Retake selfie":"Take selfie"}</Button>
    </Card>
    <Button variant="amber" disabled={!coords||(outOfRange && !(activeVisit && overrideApproved))||!selfie} onClick={()=>saveVisit(!!activeVisit)} style={{width:"100%"}}>
      {activeVisit?"Clock out":"Clock in"}
    </Button>
    {activeVisit && !data.reports.find(r=>r.supervisorId===sup.id&&r.date===todayStr()) && <div style={{marginTop:10,padding:10,borderRadius:9,background:"#FDF1E3",fontSize:11.5,color:"#8A5518"}}>Clock-out is locked until today's daily report is submitted.</div>}
    {cameraOpen && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.78)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{width:"100%",maxWidth:430,padding:14}}><video ref={videoRef} playsInline muted style={{width:"100%",borderRadius:10,background:"#000"}}/><canvas ref={canvasRef} style={{display:"none"}}/><div style={{display:"flex",gap:8,marginTop:10}}><Button variant="ghost" onClick={stopCamera} style={{flex:1}}>Cancel</Button><Button variant="amber" onClick={captureSelfie} style={{flex:1}}>Capture</Button></div></Card>
    </div>}
  </div>;
}
function withinRadiusColor(distance, radius) {
  if (distance===null) return "#F5F6F8";
  return distance<=radius ? "#E8F7EF" : "#FCEBEC";
}

function SupAttendance({ data, persist, sup, mySites, notify }) {
  const [siteId, setSiteId] = useState(mySites[0]?.id);
  const today = todayStr();
  const employees = data.employees.filter((e) => e.siteId === siteId);
  const existing = (empId) => data.attendance.find((a) => a.employeeId === empId && a.date === today);

  const setStatus = (empId, status) => {
    const record = existing(empId);
    let next;
    if (record) {
      next = data.attendance.map((a) => (a.id === record.id ? { ...a, status, markedBy: sup.id, time: new Date().toISOString() } : a));
    } else {
      next = [
        ...data.attendance,
        { id: uid("att"), employeeId: empId, siteId, date: today, status, markedBy: sup.id, time: new Date().toISOString() },
      ];
    }
    persist({ ...data, attendance: next });
  };

  const markAllPresent = () => {
    let next = [...data.attendance];
    employees.forEach((e) => {
      const record = next.find((a) => a.employeeId === e.id && a.date === today);
      if (record) {
        next = next.map((a) => (a.id === record.id ? { ...a, status: "Present" } : a));
      } else {
        next.push({ id: uid("att"), employeeId: e.id, siteId, date: today, status: "Present", markedBy: sup.id, time: new Date().toISOString() });
      }
    });
    persist({ ...data, attendance: next });
    notify("All employees marked present.");
  };

  const statuses = ["Present", "Absent", "Late", "Half Day", "Leave"];

  return (
    <div>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Mark attendance</div>
      <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.line}`, marginBottom: 10, fontSize: 13, fontFamily: "Inter, sans-serif" }}>
        {mySites.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <Button variant="ghost" size="sm" style={{ width: "100%", marginBottom: 12 }} onClick={markAllPresent}>
        Select all present
      </Button>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {employees.length === 0 && <Empty title="No employees at this site" />}
        {employees.map((e) => {
          const rec = existing(e.id);
          return (
            <Card key={e.id} style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{e.name}</div>
                  <div style={{ fontSize: 10.5, color: COLORS.inkMute, fontFamily: "IBM Plex Mono, monospace" }}>{e.empId} · {e.designation}</div>
                </div>
                {rec && <Badge tone={statusTone(rec.status)}>{rec.status}</Badge>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {statuses.map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatus(e.id, st)}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: "5px 9px",
                      borderRadius: 8,
                      cursor: "pointer",
                      border: `1px solid ${rec && rec.status === st ? COLORS.navy : COLORS.line}`,
                      background: rec && rec.status === st ? COLORS.navy : "#fff",
                      color: rec && rec.status === st ? "#fff" : COLORS.inkMute,
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SupTasks({ data, persist, sup, notify }) {
  const myTasks = data.tasks.filter((t) => t.supervisorId === sup.id);
  const setTaskStatus = (id, status) => {
    persist({ ...data, tasks: data.tasks.map((t) => (t.id === id ? { ...t, status } : t)) });
    notify(`Task marked ${status.toLowerCase()}.`);
  };
  return (
    <div>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 10 }}>My tasks</div>
      {myTasks.length === 0 && <Empty title="No tasks assigned" />}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {myTasks.map((t) => (
          <Card key={t.id} style={{ padding: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
              <Badge tone={statusTone(t.status)}>{t.status}</Badge>
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginTop: 4 }}>{t.description}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <Badge tone={t.priority === "Critical" || t.priority === "High" ? "red" : "grey"}>{t.priority}</Badge>
              <span style={{ fontSize: 10.5, color: COLORS.inkMute }}>due {fmtDate(t.dueDate)}</span>
            </div>
            {t.status !== "Completed" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {t.status === "Pending" && (
                  <Button size="sm" variant="ghost" onClick={() => setTaskStatus(t.id, "In Progress")}>Start</Button>
                )}
                <Button size="sm" variant="primary" onClick={() => setTaskStatus(t.id, "Completed")}>Complete</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function SupIncidentForm({ data, persist, sup, mySites, notify, goHome }) {
  const [siteId, setSiteId] = useState(mySites[0]?.id);
  const [category, setCategory] = useState("Safety issue");
  const [severity, setSeverity] = useState("Medium");
  const [description, setDescription] = useState("");

  const submit = () => {
    if (!description.trim()) {
      notify("Please add a description before submitting.", "error");
      return;
    }
    const incident = { id: uid("inc"), siteId, supervisorId: sup.id, date: new Date().toISOString(), category, severity, description, status: "Open" };
    persist({ ...data, incidents: [incident, ...data.incidents] });
    notify(severity === "Critical" ? "Critical incident submitted — admin notified." : "Incident reported.");
    setDescription("");
    goHome();
  };

  return (
    <div>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Report incident</div>
      <Field label="Site">
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={inputStyle}>
          {mySites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
          {["Worker issue", "Client complaint", "Safety issue", "Equipment issue", "Absenteeism", "Security issue", "Operational issue", "Other"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Severity">
        <div style={{ display: "flex", gap: 6 }}>
          {["Low", "Medium", "High", "Critical"].map((s) => (
            <button key={s} onClick={() => setSeverity(s)} style={{ flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${severity === s ? COLORS.navy : COLORS.line}`, background: severity === s ? COLORS.navy : "#fff", color: severity === s ? "#fff" : COLORS.inkMute }}>
              {s}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What happened, where, and any immediate action taken…" style={{ ...inputStyle, resize: "vertical" }} />
      </Field>
      <div style={{ fontSize: 11, color: COLORS.inkMute, marginBottom: 12 }}>📷 Photo capture attaches here in production build.</div>
      <Button variant="amber" style={{ width: "100%" }} onClick={submit}>Submit incident</Button>
    </div>
  );
}

function normalizePhone(v) {
  return String(v || "").replace(/\D/g, "").slice(-10);
}

function SupDailyReport({ data, persist, sup, mySites, notify, goHome }) {
  const today = todayStr();
  const visitsToday = data.visits.filter((v) => v.supervisorId === sup.id && v.date === today);
  const attToday = data.attendance.filter((a) => a.markedBy === sup.id && a.date === today);
  const present = attToday.filter((a) => a.status === "Present").length;
  const absent = attToday.filter((a) => a.status === "Absent").length;
  const tasksCompleted = data.tasks.filter((t) => t.supervisorId === sup.id && t.status === "Completed").length;
  const issuesToday = data.incidents.filter((i) => i.supervisorId === sup.id && i.date.slice(0, 10) === today).length;
  const [remarks, setRemarks] = useState("");
  const alreadyCount = data.reports.filter((r) => r.supervisorId === sup.id && r.date === today).length;
  const defaultClient = mySites[0]?.client || "";
  const defaultSiteId = mySites[0]?.id || "";
  const blankRow = () => ({ key: uid("row"), name: "", fatherName: "", contact: "", clientName: defaultClient, siteId: defaultSiteId });
  const [labourRows, setLabourRows] = useState([]);

  const addRow = () => setLabourRows((rows) => [...rows, blankRow()]);
  const updateRow = (key, patch) => setLabourRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key) => setLabourRows((rows) => rows.filter((r) => r.key !== key));

  const incompleteRow = labourRows.some(
    (r) => !r.name.trim() || !r.fatherName.trim() || normalizePhone(r.contact).length !== 10 || !r.clientName.trim()
  );

  const submit = () => {
    if (incompleteRow) {
      notify("Fill in every field for each manpower entry before submitting (or remove the incomplete row).", "error");
      return;
    }
    const nextLabour = [...(data.labour || [])];
    const nextEmployees = [...(data.employees || [])];
    const labourIds = [];
    for (const row of labourRows) {
      const normalized = normalizePhone(row.contact);
      const existing = nextLabour.find((l) => normalizePhone(l.contactNumber) === normalized);
      if (existing) {
        labourIds.push(existing.id);
      } else {
        const rec = {
          id: uid("lab"),
          name: row.name.trim(),
          fatherName: row.fatherName.trim(),
          contactNumber: row.contact.trim(),
          clientName: row.clientName.trim(),
          siteId: row.siteId || null,
          supervisorId: sup.id,
          onboardingStatus: "Pending Onboarding",
          uan: "",
          esicNumber: "",
          dateAdded: new Date().toISOString(),
        };
        nextLabour.push(rec);
        labourIds.push(rec.id);
        // Also add them to the site's Employee roster so they immediately show
        // up in the Employees list and become available for attendance marking —
        // matched by the same phone-number key so this stays in sync with labour.
        if (row.siteId && !nextEmployees.some((e) => e._labourId === rec.id)) {
          nextEmployees.push({
            id: uid("emp"),
            empId: `EMP-${String(nextEmployees.length + 1).padStart(6, "0")}`,
            name: rec.name,
            designation: "Labour",
            client: rec.clientName,
            siteId: rec.siteId,
            shift: "Day (9-6)",
            status: "Active",
            supervisorId: sup.id,
            _labourId: rec.id,
          });
        }
      }
    }
    const report = {
      id: uid("rep"),
      supervisorId: sup.id,
      date: today,
      sitesVisited: visitsToday.length,
      present,
      absent,
      tasksCompleted,
      issues: issuesToday,
      remarks,
      labourIds,
      status: "Submitted",
      submittedAt: new Date().toISOString(),
    };
    persist({
      ...data,
      reports: [report, ...data.reports],
      labour: nextLabour,
      employees: nextEmployees,
    });
    notify(labourIds.length ? `Daily report submitted with ${labourIds.length} manpower record(s).` : "Daily report submitted.");
    goHome();
  };

  return (
    <div>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Daily report — {fmtDate(today)}</div>
      <Card style={{ padding: 14, marginBottom: 12 }}>
        {[
          ["Sites visited", visitsToday.length],
          ["Employees present", present],
          ["Employees absent", absent],
          ["Tasks completed", tasksCompleted],
          ["Issues reported", issuesToday],
        ].map(([l, v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12.5, borderBottom: `1px solid ${COLORS.line}` }}>
            <span style={{ color: COLORS.inkMute }}>{l}</span>
            <span style={{ fontWeight: 700, fontFamily: "IBM Plex Mono, monospace" }}>{v}</span>
          </div>
        ))}
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Manpower deployed / hired today</div>
        <Button variant="ghost" onClick={addRow} style={{ padding: "6px 12px", fontSize: 11.5 }}>+ Add labour</Button>
      </div>
      {labourRows.length === 0 && (
        <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginBottom: 14 }}>
          No new manpower to report today. Tap "+ Add labour" if you deployed or hired anyone.
        </div>
      )}
      {labourRows.map((row) => (
        <Card key={row.key} style={{ padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button onClick={() => removeRow(row.key)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, color: COLORS.danger }}>Remove</button>
          </div>
          <Field label="Labour name">
            <input value={row.name} onChange={(e) => updateRow(row.key, { name: e.target.value })} placeholder="Full name" style={inputStyle} />
          </Field>
          <Field label="Father's name">
            <input value={row.fatherName} onChange={(e) => updateRow(row.key, { fatherName: e.target.value })} placeholder="Father's name" style={inputStyle} />
          </Field>
          <Field label="Contact number">
            <input value={row.contact} onChange={(e) => updateRow(row.key, { contact: e.target.value })} placeholder="10-digit mobile number" style={inputStyle} />
          </Field>
          <Field label="Client name">
            <input value={row.clientName} onChange={(e) => updateRow(row.key, { clientName: e.target.value })} placeholder="Client this labour is deployed for" style={inputStyle} />
          </Field>
        </Card>
      ))}

      <Field label="Additional remarks / client feedback">
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={4} placeholder="Notes for management…" style={{ ...inputStyle, resize: "vertical" }} />
      </Field>
      {alreadyCount > 0 && <div style={{ fontSize: 11.5, color: COLORS.warning, marginBottom: 10 }}>You've already submitted {alreadyCount} report{alreadyCount > 1 ? "s" : ""} today — this will be added as an additional one, not a replacement.</div>}
      <Button variant="amber" style={{ width: "100%" }} disabled={incompleteRow} onClick={submit}>Submit daily report</Button>
    </div>
  );
}

function SupRequirements({data, sup}) {
  const rows=(data.requirements||[]).filter(r=>!r.supervisorId||r.supervisorId===sup.id).sort((a,b)=>a.deadline.localeCompare(b.deadline));
  return <div><SectionTitle sub="Requirements uploaded by management">Current Requirements</SectionTitle>
    {rows.length===0?<Empty title="No current requirements"/>:<div style={{display:"flex",flexDirection:"column",gap:10}}>
      {rows.map(r=><Card key={r.id} style={{padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between"}}><div><b>{r.title}</b><div style={{fontSize:11.5,color:COLORS.inkMute,marginTop:3}}>{r.client} • {r.designation}</div></div><Badge tone={r.status==="Closed"?"green":r.priority==="High"?"red":"orange"}>{r.status}</Badge></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:12,fontSize:11.5}}>
          <span>Openings: <b>{r.openings}</b></span><span>Closed: <b>{r.closedOpenings||0}</b></span><span>Salary: <b>₹{Number(r.salary||0).toLocaleString("en-IN")}</b></span><span>Deadline: <b>{r.deadline}</b></span>
        </div>
        <div style={{fontSize:11.5,color:COLORS.inkMute,marginTop:9}}>{r.description}</div>
      </Card>)}
    </div>}
  </div>;
}

function SupLabourMaster({data,persist,sup,notify}) {
  const rows=(data.labour||[]).filter(l=>l.supervisorId===sup.id).sort((a,b)=>(b.dateAdded||"").localeCompare(a.dateAdded||""));
  const update=(id,patch)=>{persist({...data,labour:(data.labour||[]).map(l=>l.id===id?{...l,...patch,updatedAt:new Date().toISOString()}:l)}); notify("Labour record updated.");};
  return <div>
    <SectionTitle sub="Manpower you've deployed/hired — update onboarding status, UAN & ESIC">ESIC & EPF</SectionTitle>
    {rows.length===0 ? <Empty title="No labour submitted yet"/> : rows.map(l=>(
      <Card key={l.id} style={{padding:14,marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <div><b>{l.name}</b><div style={{fontSize:11.5,color:COLORS.inkMute,marginTop:2}}>{l.fatherName} • {l.contactNumber}</div></div>
          <Badge tone={l.onboardingStatus==="Onboarded"?"green":l.onboardingStatus==="Left Before Onboarding"?"red":"orange"}>{l.onboardingStatus}</Badge>
        </div>
        <div style={{fontSize:11.5,color:COLORS.inkMute,marginBottom:12}}>Client: {l.clientName} • Added {l.dateAdded?fmtDate(l.dateAdded):"—"}</div>
        <Field label="Onboarding status">
          <select value={l.onboardingStatus} onChange={e=>update(l.id,{onboardingStatus:e.target.value})} style={inputStyle}>
            <option>Pending Onboarding</option><option>Onboarded</option><option>Left Before Onboarding</option>
          </select>
        </Field>
        <Field label="UAN number">
          <input defaultValue={l.uan} placeholder="UAN number" onBlur={e=>e.target.value!==l.uan && update(l.id,{uan:e.target.value.trim()})} style={inputStyle}/>
        </Field>
        <Field label="ESIC number">
          <input defaultValue={l.esicNumber} placeholder="ESIC number" onBlur={e=>e.target.value!==l.esicNumber && update(l.id,{esicNumber:e.target.value.trim()})} style={inputStyle}/>
        </Field>
      </Card>
    ))}
  </div>;
}

function SupOwnAttendance({data,sup}) {
  const rows=(data.supervisorAttendance||[]).filter(a=>a.supervisorId===sup.id).sort((a,b)=>new Date(b.clockIn)-new Date(a.clockIn));
  const totalMs=rows.reduce((sum,a)=>sum+(a.clockIn&&a.clockOut?new Date(a.clockOut)-new Date(a.clockIn):0),0);
  return <div><SectionTitle sub="Your clock-in history and working hours">My Attendance</SectionTitle>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}><KPI label="Sessions" value={rows.length}/><KPI label="Total hours" value={`${Math.floor(totalMs/3600000)}h ${Math.floor(totalMs%3600000/60000)}m`} tone={COLORS.info}/></div>
    <Card style={{padding:10}}>{rows.length===0?<Empty title="No clock records yet"/>:<Table headers={["Date","Location","Clock in","Clock out","Hours","Status"]}>{rows.map(a=><tr key={a.id}><Td mono>{a.date}</Td><Td>{data.sites.find(s=>s.id===a.siteId)?.name}</Td><Td mono>{fmtTime(a.clockIn)}</Td><Td mono>{fmtTime(a.clockOut)}</Td><Td mono>{fmtDuration(a.clockIn,a.clockOut)}</Td><Td><Badge tone={statusTone(a.status)}>{a.status}</Badge></Td></tr>)}</Table>}</Card>
  </div>;
}

function SupProfile({ data, sup }) {
  const visits = data.visits.filter((v) => v.supervisorId === sup.id);
  const completed = visits.filter((v) => v.status === "Completed").length;
  const tasks = data.tasks.filter((t) => t.supervisorId === sup.id);
  const taskDone = tasks.filter((t) => t.status === "Completed").length;
  const score = Math.round(
    0.25 * 92 + 0.25 * Math.min(100, (completed / Math.max(1, visits.length)) * 100) + 0.2 * Math.min(100, (taskDone / Math.max(1, tasks.length)) * 100) + 0.15 * 88 + 0.15 * 90
  );
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: COLORS.navy2, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 22, margin: "0 auto" }}>
          {sup.name.split(" ").map((n) => n[0]).join("")}
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, marginTop: 8 }}>{sup.name}</div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMute, fontFamily: "IBM Plex Mono, monospace" }}>{sup.empId}</div>
      </div>
      <Card style={{ padding: 16, textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: COLORS.inkMute, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase" }}>Performance score</div>
        <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 34, color: score >= 90 ? COLORS.success : score >= 75 ? COLORS.info : COLORS.warning }}>{score}</div>
        <Badge tone={score >= 90 ? "green" : score >= 75 ? "blue" : "orange"}>{score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 60 ? "Average" : "Needs improvement"}</Badge>
      </Card>
      <Card style={{ padding: 14 }}>
        {[["Phone", sup.phone], ["Email", sup.email], ["Department", sup.department], ["Joined", sup.joined], ["Sites visited (total)", visits.length], ["Tasks completed", taskDone]].map(([l, v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 12.5, borderBottom: `1px solid ${COLORS.line}` }}>
            <span style={{ color: COLORS.inkMute }}>{l}</span>
            <span style={{ fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.inkMute, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${COLORS.line}`,
  fontSize: 13,
  fontFamily: "Inter, sans-serif",
  boxSizing: "border-box",
};

/* ============================================================
   ADMIN / OPS MANAGER APP
   ============================================================ */

const NAV = [
  { key: "dashboard", label: "Dashboard" },
  { key: "tracking", label: "Live Tracking" },
  { key: "clockoutRequests", label: "Clock-out Requests" },
  { key: "supervisors", label: "Supervisors" },
  { key: "sites", label: "Sites" },
  { key: "employees", label: "Employees" },
  { key: "attendance", label: "Attendance" },
  { key: "visits", label: "Site Visits" },
  { key: "tasks", label: "Tasks" },
  { key: "incidents", label: "Incidents" },
  { key: "reports", label: "Reports" },
  { key: "requirements", label: "Requirements" },
  { key: "compliance", label: "ESIC & EPF" },
  { key: "supervisorAttendance", label: "Supervisor Attendance" },
  { key: "analytics", label: "Analytics" },
];

function AdminApp({ data, persist, session, onLogout, notify }) {
  const [page, setPage] = useState("dashboard");
  const [query, setQuery] = useState("");

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const res = [];
    data.supervisors.forEach((s) => s.name.toLowerCase().includes(q) && res.push({ type: "Supervisor", label: s.name }));
    data.sites.forEach((s) => s.name.toLowerCase().includes(q) && res.push({ type: "Site", label: s.name }));
    data.employees.forEach((e) => e.name.toLowerCase().includes(q) && res.push({ type: "Employee", label: e.name }));
    data.incidents.forEach((i) => i.description.toLowerCase().includes(q) && res.push({ type: "Incident", label: i.description.slice(0, 40) }));
    return res.slice(0, 8);
  }, [query, data]);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.canvas, fontFamily: "Inter, sans-serif", display: "flex" }}>
      {/* sidebar */}
      <div className="pfs-admin-sidebar" style={{ width: 224, background: COLORS.navy, color: "#fff", display: "flex", flexDirection: "column", flexShrink: 0, transition: "width .15s" }}>
        <div style={{ padding: "20px 18px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}><img src="/logo.png" alt="Prime" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
          <div className="pfs-brand-label" style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 14.5 }}>Prime Field</div>
        </div>
        <div style={{ flex: 1, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setPage(n.key)}
              title={n.label}
              style={{
                textAlign: "left",
                border: "none",
                background: page === n.key ? "rgba(255,255,255,0.12)" : "transparent",
                color: page === n.key ? "#fff" : "#AEBCD1",
                borderRadius: 9,
                padding: "9px 12px",
                fontSize: 13,
                fontWeight: page === n.key ? 700 : 500,
                cursor: "pointer",
                borderLeft: page === n.key ? `3px solid ${COLORS.amber}` : "3px solid transparent",
              }}
            >
              <span className="pfs-nav-label">{n.label}</span>
            </button>
          ))}
        </div>
        <div className="pfs-user-block" style={{ padding: 14, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{session.name}</div>
          <div style={{ fontSize: 10.5, color: "#8DA0BC" }}>{session.role === "SUPER_ADMIN" ? "Super Admin" : "Operations Manager"}</div>
          <button onClick={onLogout} style={{ marginTop: 8, fontSize: 11, background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 7, padding: "6px 10px", cursor: "pointer" }}>Sign out</button>
        </div>
      </div>

      {/* main */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div className="pfs-admin-topbar" style={{ background: "#fff", borderBottom: `1px solid ${COLORS.line}`, padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
          <div className="pfs-admin-search" style={{ position: "relative", width: 340, maxWidth: "100%" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search supervisors, sites, employees, incidents…"
              style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: `1px solid ${COLORS.line}`, fontSize: 12.5, boxSizing: "border-box" }}
            />
            {searchResults.length > 0 && (
              <div style={{ position: "absolute", top: 38, left: 0, right: 0, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(16,24,38,0.12)", zIndex: 50 }}>
                {searchResults.map((r, i) => (
                  <div key={i} style={{ padding: "9px 12px", fontSize: 12.5, borderBottom: i < searchResults.length - 1 ? `1px solid ${COLORS.line}` : "none" }}>
                    <span style={{ color: COLORS.inkMute, marginRight: 8 }}>{r.type}</span>{r.label}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <NotifBell data={data} />
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: COLORS.navy2, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>
              {session.name.split(" ").map((n) => n[0]).join("")}
            </div>
          </div>
        </div>

        <div style={{ padding: 24, overflowY: "auto" }}>
          {page === "dashboard" && <AdminDashboard data={data} />}
          {page === "tracking" && <LiveTracking data={data} />}
          {page === "clockoutRequests" && <ClockoutRequestsPage data={data} persist={persist} notify={notify} />}
          {page === "supervisors" && <SupervisorsPage data={data} persist={persist} notify={notify} />}
          {page === "sites" && <SitesPage data={data} persist={persist} notify={notify} />}
          {page === "employees" && <EmployeesPage data={data} />}
          {page === "attendance" && <AttendancePage data={data} />}
          {page === "visits" && <VisitsPage data={data} />}
          {page === "tasks" && <TasksPage data={data} persist={persist} notify={notify} />}
          {page === "incidents" && <IncidentsPage data={data} persist={persist} notify={notify} />}
          {page === "reports" && <ReportsPage data={data} />}
          {page === "requirements" && <RequirementsPage data={data} persist={persist} notify={notify} />}
          {page === "compliance" && <LabourMasterPage data={data} persist={persist} notify={notify} />}
          {page === "supervisorAttendance" && <SupervisorAttendancePage data={data} />}
          {page === "analytics" && <AnalyticsPage data={data} />}
        </div>
      </div>
    </div>
  );
}

function NotifBell({ data }) {
  const openCritical = data.incidents.filter((i) => i.severity === "Critical" && i.status === "Open").length;
  const overdueTasks = data.tasks.filter((t) => t.status === "Overdue").length;
  const count = openCritical + overdueTasks;
  return (
    <div style={{ position: "relative" }}>
      <span style={{ fontSize: 17 }}>🔔</span>
      {count > 0 && (
        <span style={{ position: "absolute", top: -4, right: -6, background: COLORS.danger, color: "#fff", fontSize: 9.5, fontWeight: 700, borderRadius: 99, padding: "1px 5px" }}>{count}</span>
      )}
    </div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 19, color: COLORS.ink }}>{children}</div>
      {sub && <div style={{ fontSize: 12.5, color: COLORS.inkMute, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Th({ children }) {
  return <th style={{ textAlign: "left", padding: "9px 12px", fontSize: 10.5, fontWeight: 700, color: COLORS.inkMute, letterSpacing: 0.3, textTransform: "uppercase", borderBottom: `1px solid ${COLORS.line}` }}>{children}</th>;
}
function Td({ children, mono }) {
  return <td style={{ padding: "10px 12px", fontSize: 12.5, borderBottom: `1px solid ${COLORS.line}`, fontFamily: mono ? "IBM Plex Mono, monospace" : "Inter, sans-serif" }}>{children}</td>;
}
function Table({ headers, children }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{headers.map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function AdminDashboard({ data }) {
  const today = todayStr();
  const activeSupervisors = data.supervisors.filter((s) => s.status === "Active").length;
  const checkedInToday = new Set(data.visits.filter((v) => v.date === today).map((v) => v.supervisorId)).size;
  const sitesVisitedToday = new Set(data.visits.filter((v) => v.date === today).map((v) => v.siteId)).size;
  const attToday = data.attendance.filter((a) => a.date === today);
  const present = attToday.filter((a) => a.status === "Present").length;
  const absent = attToday.filter((a) => a.status === "Absent").length;
  const late = attToday.filter((a) => a.status === "Late").length;
  const openIncidents = data.incidents.filter((i) => i.status === "Open" || i.status === "Under Review").length;
  const pendingTasks = data.tasks.filter((t) => t.status === "Pending" || t.status === "In Progress").length;

  const visitsToday = data.visits.filter((v) => v.date === today);

  const perf = data.supervisors.map((s) => {
    const visits = data.visits.filter((v) => v.supervisorId === s.id);
    const completedVisits = visits.filter((v) => v.status === "Completed").length;
    const tasks = data.tasks.filter((t) => t.supervisorId === s.id);
    const taskDone = tasks.filter((t) => t.status === "Completed").length;
    const reportsSubmitted = data.reports.filter((r) => r.supervisorId === s.id).length;
    const issues = data.incidents.filter((i) => i.supervisorId === s.id).length;
    const assignedReqs = (data.requirements||[]).filter(r=>r.supervisorId===s.id);
    const closedOpenings = assignedReqs.reduce((n,r)=>n+Number(r.closedOpenings||0),0);
    const totalOpenings = assignedReqs.reduce((n,r)=>n+Number(r.openings||0),0);
    const openingClosureRate = Math.round((closedOpenings/Math.max(1,totalOpenings))*100);
    const attendanceRate = Math.round((data.supervisorAttendance||[]).filter(a=>a.supervisorId===s.id&&a.clockIn).length ? 92 : 80);
    const score = Math.round(
      0.35 * openingClosureRate +
      0.20 * attendanceRate +
      0.15 * Math.min(100, (completedVisits / Math.max(1, visits.length)) * 100) +
      0.15 * Math.min(100, (taskDone / Math.max(1, tasks.length)) * 100) +
      0.15 * Math.min(100, reportsSubmitted * 40)
    );
    return { ...s, visits: visits.length, attendanceRate, taskDone, reportsSubmitted, issues, closedOpenings, openingClosureRate, score };
  }).sort((a, b) => b.score - a.score);

  return (
    <div>
      <SectionTitle sub="Live operational overview across all clients and sites">Dashboard</SectionTitle>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        <KPI label="Total Supervisors" value={data.supervisors.length} />
        <KPI label="Active Supervisors" value={activeSupervisors} tone={COLORS.success} />
        <KPI label="Checked In Today" value={checkedInToday} tone={COLORS.info} />
        <KPI label="Total Sites" value={data.sites.length} />
        <KPI label="Sites Visited Today" value={`${sitesVisitedToday}/${data.sites.length}`} tone={COLORS.amber} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 22 }}>
        <KPI label="Total Employees" value={data.employees.length} />
        <KPI label="Present Today" value={present} tone={COLORS.success} />
        <KPI label="Absent Today" value={absent} tone={COLORS.danger} />
        <KPI label="Open Incidents" value={openIncidents} tone={openIncidents ? COLORS.danger : COLORS.success} />
        <KPI label="Pending Tasks" value={pendingTasks} tone={COLORS.warning} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 20 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>Live supervisor map</div>
          <GeoMap sites={data.sites} supervisors={data.supervisors} />
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 12 }}>Attendance summary</div>
          {[
            ["Present", present, COLORS.success],
            ["Absent", absent, COLORS.danger],
            ["Late", late, COLORS.warning],
            ["Total workforce", data.employees.length, COLORS.inkMute],
          ].map(([l, v, c]) => (
            <div key={l} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: COLORS.inkMute }}>{l}</span>
                <span style={{ fontWeight: 700 }}>{v}</span>
              </div>
              <div style={{ height: 6, background: "#EEF0F3", borderRadius: 99 }}>
                <div style={{ height: 6, width: `${Math.min(100, (v / Math.max(1, data.employees.length)) * 100)}%`, background: c, borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Today's site visits</div>
          {visitsToday.length === 0 ? (
            <Empty title="No site visits today." />
          ) : (
            <Table headers={["Supervisor", "Site", "Check-in", "Check-out", "Duration", "Status"]}>
              {visitsToday.map((v) => {
                const sup = data.supervisors.find((s) => s.id === v.supervisorId);
                const site = data.sites.find((s) => s.id === v.siteId);
                return (
                  <tr key={v.id}>
                    <Td>{sup?.name}</Td>
                    <Td>{site?.name}</Td>
                    <Td mono>{fmtTime(v.checkinTime)}</Td>
                    <Td mono>{v.checkoutTime ? fmtTime(v.checkoutTime) : "—"}</Td>
                    <Td mono>{fmtDuration(v.checkinTime, v.checkoutTime)}</Td>
                    <Td><Badge tone={statusTone(v.status)}>{v.status}</Badge></Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>Incident summary</div>
          {["Critical", "High", "Medium", "Low"].map((sev) => {
            const n = data.incidents.filter((i) => i.severity === sev).length;
            return (
              <div key={sev} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 12.5, borderBottom: `1px solid ${COLORS.line}` }}>
                <span style={{ color: COLORS.inkMute }}>{sev}</span>
                <span style={{ fontWeight: 700 }}>{n}</span>
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 12.5 }}>
            <span style={{ color: COLORS.inkMute }}>Resolved</span>
            <span style={{ fontWeight: 700, color: COLORS.success }}>{data.incidents.filter((i) => i.status === "Resolved").length}</span>
          </div>
        </Card>
      </div>

      <Card style={{ padding: 16, marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Supervisor performance ranking</div>
        <Table headers={["Supervisor", "Closed Openings", "Closure %", "Attendance %", "Tasks", "Reports", "Score"]}>
          {perf.map((s) => (
            <tr key={s.id}>
              <Td>{s.name}</Td>
              <Td mono>{s.closedOpenings}</Td>
              <Td mono>{s.openingClosureRate}%</Td>
              <Td mono>{s.attendanceRate}%</Td>
              <Td mono>{s.taskDone}</Td>
              <Td mono>{s.reportsSubmitted}</Td>
              <Td>
                <span style={{ fontWeight: 700, color: s.score >= 90 ? COLORS.success : s.score >= 75 ? COLORS.info : COLORS.warning }}>{s.score}</span>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function LiveTracking({ data }) {
  const [activeSiteId, setActiveSiteId] = useState(null);
  const withStatus = data.supervisors.map((s) => {
    const openVisit = data.visits.find((v) => v.supervisorId === s.id && v.status === "In Progress");
    const live = (data.supervisorAttendance||[]).find(a => a.supervisorId===s.id && a.status==="On Duty");
    const status = live ? "On Duty" : s.status === "Active" ? "Online" : "Offline";
    const site = data.sites.find((sd) => sd.id === (openVisit ? openVisit.siteId : s.assignedSiteIds[0]));
    return { ...s, status, site, lastUpdate: live?.lastLocationAt || openVisit?.checkinTime || null, lat:live?.currentLat, lng:live?.currentLng };
  });
  return (
    <div>
      <SectionTitle sub="Periodic location updates during an active site visit / work session">Live Location Tracking</SectionTitle>
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <GeoMap sites={data.sites} supervisors={data.supervisors} activeSiteId={activeSiteId} onSelectSite={setActiveSiteId} height={340} locationRecords={data.supervisorAttendance||[]} />
      </Card>
      <Card style={{ padding: 16 }}>
        <Table headers={["Supervisor", "Status", "Current / Assigned Site", "Last Update", "GPS", "GPS Accuracy"]}>
          {withStatus.map((s) => (
            <tr key={s.id}>
              <Td>{s.name}</Td>
              <Td><Badge tone={statusTone(s.status)}>{s.status}</Badge></Td>
              <Td>{s.site?.name || "—"}</Td>
              <Td mono>{s.lastUpdate ? fmtTime(s.lastUpdate) : "—"}</Td>
              <Td mono>{s.lat ? `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}` : "—"}</Td>
              <Td mono>{s.status !== "Offline" ? "Live" : "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function genTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function AddSupervisorForm({ data, persist, notify, onDone }) {
  const [form, setForm] = useState({ name: "", empId: "", phone: "", department: "Operations", assignedSiteIds: [], password: genTempPassword() });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { empId, password } once created

  const toggleSite = (id) => setForm((f) => ({ ...f, assignedSiteIds: f.assignedSiteIds.includes(id) ? f.assignedSiteIds.filter((x) => x !== id) : [...f.assignedSiteIds, id] }));

  const submit = async () => {
    const empId = form.empId.trim().toUpperCase();
    if (!form.name.trim() || !empId) { notify("Name and Employee ID are required.", "error"); return; }
    if (data.supervisors.some((s) => s.empId.toUpperCase() === empId)) { notify("That Employee ID is already in use.", "error"); return; }
    if (form.password.length < 6) { notify("Password must be at least 6 characters.", "error"); return; }
    setSubmitting(true);
    try {
      const email = `${empId.toLowerCase()}@primefield.local`;
      const { confirmed } = await createAuthAccount(email, form.password, { full_name: form.name, emp_id: empId });
      if (!confirmed) {
        notify('Account created but needs confirmation. In Supabase, go to Authentication → Providers → Email and turn OFF "Confirm email", then try again.', "error");
        setSubmitting(false);
        return;
      }
      const newSup = { id: uid("sup"), empId, name: form.name.trim(), phone: form.phone.trim(), department: form.department, joined: todayStr(), status: "Active", assignedSiteIds: form.assignedSiteIds };
      const updatedSites = data.sites.map((s) => (form.assignedSiteIds.includes(s.id) ? { ...s, supervisorId: newSup.id } : s));
      persist({ ...data, supervisors: [...data.supervisors, newSup], sites: updatedSites });
      setResult({ empId, password: form.password });
      notify("Supervisor account created.");
    } catch (e) {
      notify(e.message || "Failed to create the account.", "error");
    }
    setSubmitting(false);
  };

  if (result) {
    return (
      <Card style={{ padding: 16, marginBottom: 16, background: "#F0FBF4", border: "1px solid #BFE8CE" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Supervisor created — share these credentials once</div>
        <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 13, marginBottom: 4 }}>Employee ID: <b>{result.empId}</b></div>
        <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 13, marginBottom: 12 }}>Password: <b>{result.password}</b></div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginBottom: 12 }}>Supabase won't show this password again — copy it now. Ask the supervisor to sign in and, once you build a change-password flow, update it.</div>
        <Button variant="ghost" onClick={onDone}>Done</Button>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>Add supervisor</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
        <input placeholder="Employee ID (e.g. PFS-SUP-011)" value={form.empId} onChange={(e) => setForm({ ...form, empId: e.target.value })} style={inputStyle} />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
        <input placeholder="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} style={inputStyle} />
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginBottom: 6 }}>Assign sites</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data.sites.map((s) => (
            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "5px 9px", cursor: "pointer" }}>
              <input type="checkbox" checked={form.assignedSiteIds.includes(s.id)} onChange={() => toggleSite(s.id)} />
              {s.name}
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginBottom: 6 }}>Temporary password</div>
          <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inputStyle} />
        </div>
        <Button variant="ghost" onClick={() => setForm({ ...form, password: genTempPassword() })}>Regenerate</Button>
      </div>
      <div style={{ fontSize: 11, color: COLORS.inkMute, marginTop: 8 }}>
        Requires "Confirm email" to be turned OFF in Supabase (Authentication → Providers → Email) — synthetic @primefield.local addresses can never confirm via a real inbox.
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Button variant="amber" disabled={submitting} onClick={submit}>{submitting ? "Creating…" : "Create supervisor"}</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </Card>
  );
}

function SupervisorsPage({ data, persist, notify }) {
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const sup = selected && data.supervisors.find((s) => s.id === selected);
  if (sup) {
    const visits = data.visits.filter((v) => v.supervisorId === sup.id);
    const tasks = data.tasks.filter((t) => t.supervisorId === sup.id);
    const incidents = data.incidents.filter((i) => i.supervisorId === sup.id);
    const mySites = data.sites.filter((s) => sup.assignedSiteIds.includes(s.id));
    return (
      <div>
        <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: COLORS.inkMute, cursor: "pointer", fontSize: 12.5, marginBottom: 10 }}>← Back to supervisors</button>
        <SectionTitle sub={sup.empId}>{sup.name}</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
          <KPI label="Sites Visited" value={visits.length} />
          <KPI label="Tasks Completed" value={tasks.filter((t) => t.status === "Completed").length} />
          <KPI label="Incidents Reported" value={incidents.length} />
          <KPI label="Assigned Sites" value={mySites.length} />
        </div>
        <EditSupervisorAssignment data={data} persist={persist} notify={notify} sup={sup} onDeleted={() => setSelected(null)} />
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
        <SectionTitle sub="Manage field supervisors and their site assignments">Supervisors</SectionTitle>
        {!adding && <Button variant="amber" onClick={() => setAdding(true)}>+ Add supervisor</Button>}
      </div>
      {adding && <AddSupervisorForm data={data} persist={persist} notify={notify} onDone={() => setAdding(false)} />}
      <Card style={{ padding: 16 }}>
        <Table headers={["Name", "Employee ID", "Phone", "Department", "Assigned Sites", "Status"]}>
          {data.supervisors.map((s) => (
            <tr key={s.id} onClick={() => setSelected(s.id)} style={{ cursor: "pointer" }}>
              <Td>{s.name}</Td>
              <Td mono>{s.empId}</Td>
              <Td mono>{s.phone}</Td>
              <Td>{s.department}</Td>
              <Td mono>{s.assignedSiteIds.length}</Td>
              <Td><Badge tone={statusTone(s.status)}>{s.status}</Badge></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function EditSupervisorAssignment({ data, persist, notify, sup, onDeleted }) {
  const [form, setForm] = useState({ name: sup.name, phone: sup.phone || "", department: sup.department || "" });
  const [assignedSiteIds, setAssignedSiteIds] = useState(sup.assignedSiteIds || []);
  const [status, setStatus] = useState(sup.status);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dirty = form.name !== sup.name || form.phone !== (sup.phone || "") || form.department !== (sup.department || "")
    || JSON.stringify([...assignedSiteIds].sort()) !== JSON.stringify([...(sup.assignedSiteIds || [])].sort()) || status !== sup.status;

  const toggleSite = (id) => setAssignedSiteIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const dependents = {
    visits: data.visits.filter((v) => v.supervisorId === sup.id).length,
    reports: data.reports.filter((r) => r.supervisorId === sup.id).length,
    labour: (data.labour || []).filter((l) => l.supervisorId === sup.id).length,
    tasks: data.tasks.filter((t) => t.supervisorId === sup.id).length,
  };
  const hasDependents = dependents.visits + dependents.reports + dependents.labour + dependents.tasks > 0;

  const save = () => {
    if (!form.name.trim()) { notify("Name is required.", "error"); return; }
    const updatedSites = data.sites.map((s) => {
      const isNowAssigned = assignedSiteIds.includes(s.id);
      const wasAssignedToThisSup = s.supervisorId === sup.id;
      if (isNowAssigned) return { ...s, supervisorId: sup.id };
      if (wasAssignedToThisSup) return { ...s, supervisorId: null };
      return s;
    });
    persist({
      ...data,
      supervisors: data.supervisors.map((s) => (s.id === sup.id ? { ...s, name: form.name.trim(), phone: form.phone.trim(), department: form.department.trim(), assignedSiteIds, status } : s)),
      sites: updatedSites,
    });
    notify("Supervisor updated.");
  };

  const remove = () => {
    persist({
      ...data,
      supervisors: data.supervisors.filter((s) => s.id !== sup.id),
      sites: data.sites.map((s) => s.supervisorId === sup.id ? { ...s, supervisorId: null } : s),
    });
    notify("Supervisor removed from the app.");
    onDeleted();
  };

  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 12 }}>Supervisor details</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
        <input value={sup.empId} disabled style={{ ...inputStyle, background: COLORS.canvas, color: COLORS.inkMute }} title="Employee ID can't be changed — it's tied to the login account" />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
        <input placeholder="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} style={inputStyle} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12.5 }}>Assigned sites</div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${COLORS.line}`, fontSize: 11.5 }}>
          <option>Active</option><option>Inactive</option>
        </select>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {data.sites.map((s) => (
          <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", background: assignedSiteIds.includes(s.id) ? "#FDF1E3" : "#fff" }}>
            <input type="checkbox" checked={assignedSiteIds.includes(s.id)} onChange={() => toggleSite(s.id)} />
            {s.name} — {s.client}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="amber" disabled={!dirty} onClick={save}>Save changes</Button>
        {!confirmingDelete && <Button variant="ghost" onClick={() => setConfirmingDelete(true)} style={{ color: COLORS.danger }}>Delete supervisor</Button>}
      </div>
      {confirmingDelete && (
        <Card style={{ padding: 14, marginTop: 14, background: "#FCEBEC", border: `1px solid ${COLORS.danger}` }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: COLORS.danger, marginBottom: 6 }}>Remove this supervisor permanently?</div>
          <div style={{ fontSize: 12, color: COLORS.ink, lineHeight: 1.6, marginBottom: 10 }}>
            {hasDependents
              ? `They have ${dependents.visits} visit(s), ${dependents.reports} report(s), ${dependents.labour} labour record(s), and ${dependents.tasks} task(s) on file — these are kept for your records but will show as "Unknown supervisor". `
              : "No visits, reports, or tasks are tied to them yet — safe to remove. "}
            This removes them from the app and they will no longer be able to log in. It does <b>not</b> delete their Supabase Auth account — if you want that fully gone too, delete it manually in Supabase under Authentication → Users. Consider setting status to <b>Inactive</b> above instead if you might reinstate them later.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="amber" onClick={remove} style={{ background: COLORS.danger }}>Yes, remove permanently</Button>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
          </div>
        </Card>
      )}
    </Card>
  );
}

function AddSiteForm({ data, persist, notify, onDone }) {
  const [form, setForm] = useState({ name: "", client: "", address: "", lat: "", lng: "", geofenceM: 100, status: "Active" });
  const submit = () => {
    const lat = parseFloat(form.lat), lng = parseFloat(form.lng);
    if (!form.name.trim() || !form.client.trim()) { notify("Site name and client are required.", "error"); return; }
    if (Number.isNaN(lat) || Number.isNaN(lng)) { notify("Latitude and longitude must be valid numbers.", "error"); return; }
    const site = { id: uid("site"), name: form.name.trim(), client: form.client.trim(), address: form.address.trim(), lat, lng, geofenceM: Number(form.geofenceM) || 100, employeeCount: 0, visitFrequency: "Daily", status: form.status, supervisorId: null };
    persist({ ...data, sites: [site, ...data.sites] });
    notify("Site added.");
    onDone();
  };
  return (
    <Card style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>Add site</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input placeholder="Site name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
        <input placeholder="Client" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} style={inputStyle} />
        <input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
        <input placeholder="Latitude (e.g. 28.4595)" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} style={inputStyle} />
        <input placeholder="Longitude (e.g. 77.0266)" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} style={inputStyle} />
        <input type="number" placeholder="Geofence radius (metres)" value={form.geofenceM} onChange={(e) => setForm({ ...form, geofenceM: e.target.value })} style={inputStyle} />
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>
          <option>Active</option><option>Inactive</option>
        </select>
      </div>
      <div style={{ fontSize: 11, color: COLORS.inkMute, marginTop: 8 }}>
        Tip: open Google Maps, right-click the exact spot, and copy the lat/lng shown at the top — that's the most accurate way to get these numbers.
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Button variant="amber" onClick={submit}>Create site</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </Card>
  );
}

function EditSiteForm({ data, persist, notify, site }) {
  const [form, setForm] = useState({ name: site.name, client: site.client, address: site.address || "", lat: String(site.lat), lng: String(site.lng), geofenceM: site.geofenceM, status: site.status });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify({ name: site.name, client: site.client, address: site.address || "", lat: String(site.lat), lng: String(site.lng), geofenceM: site.geofenceM, status: site.status });

  const dependents = {
    employees: data.employees.filter((e) => e.siteId === site.id).length,
    supervisors: data.supervisors.filter((s) => s.assignedSiteIds.includes(site.id)).length,
    visits: data.visits.filter((v) => v.siteId === site.id).length,
    labour: (data.labour || []).filter((l) => l.siteId === site.id).length,
  };
  const hasDependents = dependents.employees + dependents.supervisors + dependents.visits + dependents.labour > 0;

  const save = () => {
    const lat = parseFloat(form.lat), lng = parseFloat(form.lng);
    if (!form.name.trim() || !form.client.trim()) { notify("Site name and client are required.", "error"); return; }
    if (Number.isNaN(lat) || Number.isNaN(lng)) { notify("Latitude and longitude must be valid numbers.", "error"); return; }
    persist({ ...data, sites: data.sites.map((s) => s.id === site.id ? { ...s, name: form.name.trim(), client: form.client.trim(), address: form.address.trim(), lat, lng, geofenceM: Number(form.geofenceM) || 100, status: form.status } : s) });
    notify("Site updated.");
  };

  const remove = () => {
    persist({
      ...data,
      sites: data.sites.filter((s) => s.id !== site.id),
      supervisors: data.supervisors.map((s) => s.assignedSiteIds.includes(site.id) ? { ...s, assignedSiteIds: s.assignedSiteIds.filter((id) => id !== site.id) } : s),
      employees: data.employees.map((e) => e.siteId === site.id ? { ...e, status: "Inactive" } : e),
    });
    notify("Site deleted.");
  };

  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 12 }}>Site details</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input placeholder="Site name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
        <input placeholder="Client" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} style={inputStyle} />
        <input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
        <input placeholder="Latitude" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} style={inputStyle} />
        <input placeholder="Longitude" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} style={inputStyle} />
        <input type="number" placeholder="Geofence radius (metres)" value={form.geofenceM} onChange={(e) => setForm({ ...form, geofenceM: e.target.value })} style={inputStyle} />
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>
          <option>Active</option><option>Inactive</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Button variant="amber" disabled={!dirty} onClick={save}>Save changes</Button>
        {!confirmingDelete && <Button variant="ghost" onClick={() => setConfirmingDelete(true)} style={{ color: COLORS.danger }}>Delete site</Button>}
      </div>
      {confirmingDelete && (
        <Card style={{ padding: 14, marginTop: 14, background: "#FCEBEC", border: `1px solid ${COLORS.danger}` }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: COLORS.danger, marginBottom: 6 }}>Delete this site permanently?</div>
          {hasDependents ? (
            <div style={{ fontSize: 12, color: COLORS.ink, lineHeight: 1.6, marginBottom: 10 }}>
              This site has {dependents.supervisors} supervisor(s) assigned, {dependents.employees} employee(s), {dependents.visits} visit(s), and {dependents.labour} labour record(s).
              Deleting will unassign supervisors and deactivate its employees, but historical visits/attendance/reports referencing this site are kept for your records.
              Consider setting status to <b>Inactive</b> above instead if you just want to stop new activity here.
            </div>
          ) : (
            <div style={{ fontSize: 12, color: COLORS.ink, marginBottom: 10 }}>No supervisors, employees, or visits are tied to this site. This is safe to delete.</div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="amber" onClick={remove} style={{ background: COLORS.danger }}>Yes, delete permanently</Button>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
          </div>
        </Card>
      )}
    </Card>
  );
}

function SitesPage({ data, persist, notify }) {
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState(null);
  const site = selected && data.sites.find((s) => s.id === selected);

  if (site) {
    const emp = data.employees.filter((e) => e.siteId === site.id).length;
    return (
      <div>
        <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: COLORS.inkMute, cursor: "pointer", fontSize: 12.5, marginBottom: 10 }}>← Back to sites</button>
        <SectionTitle sub={site.client}>{site.name}</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
          <KPI label="Employees" value={emp} />
          <KPI label="Geofence" value={`${site.geofenceM}m`} />
          <KPI label="Status" value={site.status} />
        </div>
        <EditSiteForm data={data} persist={persist} notify={notify} site={site} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
        <SectionTitle sub="Client sites, geofence rules and deployed workforce — click a site to edit">Sites</SectionTitle>
        {!adding && <Button variant="amber" onClick={() => setAdding(true)}>+ Add site</Button>}
      </div>
      {adding && <AddSiteForm data={data} persist={persist} notify={notify} onDone={() => setAdding(false)} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {data.sites.map((s) => {
          const emp = data.employees.filter((e) => e.siteId === s.id).length;
          const sup = data.supervisors.find((sp) => sp.assignedSiteIds.includes(s.id));
          return (
            <Card key={s.id} onClick={() => setSelected(s.id)} style={{ padding: 16, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</div>
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginTop: 3 }}>{s.client}</div>
              <div style={{ fontSize: 11, color: COLORS.inkMute, marginTop: 8, fontFamily: "IBM Plex Mono, monospace" }}>{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</div>
              <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11.5 }}>
                <span><b>{emp}</b> employees</span>
                <span><b>{s.geofenceM}m</b> geofence</span>
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginTop: 6 }}>Supervisor: {sup?.name || "Unassigned"}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function EmployeesPage({ data }) {
  const [siteFilter, setSiteFilter] = useState("all");
  const filtered = data.employees.filter((e) => siteFilter === "all" || e.siteId === siteFilter);
  return (
    <div>
      <SectionTitle sub="Deployed workforce across all client sites">Employees</SectionTitle>
      <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${COLORS.line}`, fontSize: 12.5, marginBottom: 14 }}>
        <option value="all">All sites</option>
        {data.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <Card style={{ padding: 16 }}>
        <Table headers={["Name", "ID", "Designation", "Site", "Shift", "Status"]}>
          {filtered.slice(0, 60).map((e) => {
            const site = data.sites.find((s) => s.id === e.siteId);
            return (
              <tr key={e.id}>
                <Td>{e.name}</Td>
                <Td mono>{e.empId}</Td>
                <Td>{e.designation}</Td>
                <Td>{site?.name}</Td>
                <Td>{e.shift}</Td>
                <Td><Badge tone={statusTone(e.status)}>{e.status}</Badge></Td>
              </tr>
            );
          })}
        </Table>
        {filtered.length > 60 && <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginTop: 10 }}>Showing 60 of {filtered.length} — pagination applies in production build.</div>}
      </Card>
    </div>
  );
}

function AttendancePage({ data }) {
  const today = todayStr();
  const [date, setDate] = useState(today);
  const records = data.attendance.filter((a) => a.date === date);
  return (
    <div>
      <SectionTitle sub="Employee attendance verified by field supervisors">Attendance</SectionTitle>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${COLORS.line}`, fontSize: 12.5, marginBottom: 14 }} />
      <Card style={{ padding: 16 }}>
        {records.length === 0 ? (
          <Empty title="No attendance records for this date." />
        ) : (
          <Table headers={["Employee", "Site", "Status", "Marked By", "Time"]}>
            {records.map((a) => {
              const emp = data.employees.find((e) => e.id === a.employeeId);
              const site = data.sites.find((s) => s.id === a.siteId);
              const sup = data.supervisors.find((s) => s.id === a.markedBy);
              return (
                <tr key={a.id}>
                  <Td>{emp?.name}</Td>
                  <Td>{site?.name}</Td>
                  <Td><Badge tone={statusTone(a.status)}>{a.status}</Badge></Td>
                  <Td>{sup?.name}</Td>
                  <Td mono>{fmtTime(a.time)}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

function VisitsPage({ data }) {
  const sorted = [...data.visits].sort((a, b) => new Date(b.checkinTime) - new Date(a.checkinTime));
  return (
    <div>
      <SectionTitle sub="Every check-in and check-out across all supervisors">Site Visits</SectionTitle>
      <Card style={{ padding: 16 }}>
        {sorted.length === 0 ? <Empty title="No site visits recorded yet." /> : (
          <Table headers={["Supervisor", "Site", "Date", "Check-in", "Check-out", "Distance", "Duration", "Status"]}>
            {sorted.map((v) => {
              const sup = data.supervisors.find((s) => s.id === v.supervisorId);
              const site = data.sites.find((s) => s.id === v.siteId);
              return (
                <tr key={v.id}>
                  <Td>{sup?.name}</Td>
                  <Td>{site?.name}</Td>
                  <Td mono>{fmtDate(v.date)}</Td>
                  <Td mono>{fmtTime(v.checkinTime)}</Td>
                  <Td mono>{v.checkoutTime ? fmtTime(v.checkoutTime) : "—"}</Td>
                  <Td mono>{v.distance}m</Td>
                  <Td mono>{fmtDuration(v.checkinTime, v.checkoutTime)}</Td>
                  <Td><Badge tone={statusTone(v.status)}>{v.status}</Badge></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

function TasksPage({ data, persist, notify }) {
  const [title, setTitle] = useState("");
  const [supervisorId, setSupervisorId] = useState(data.supervisors[0]?.id);
  const [priority, setPriority] = useState("Medium");
  const [dueDate, setDueDate] = useState(todayStr());

  const create = () => {
    if (!title.trim()) { notify("Add a task title first.", "error"); return; }
    const site = data.supervisors.find((s) => s.id === supervisorId)?.assignedSiteIds[0];
    const task = { id: uid("task"), title, description: "", supervisorId, siteId: site, priority, dueDate, status: "Pending" };
    persist({ ...data, tasks: [task, ...data.tasks] });
    setTitle("");
    notify("Task created.");
  };

  return (
    <div>
      <SectionTitle sub="Assign and track work across the field team">Tasks</SectionTitle>
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>New task</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 1fr 1fr auto", gap: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" style={{ padding: "9px 11px", borderRadius: 9, border: `1px solid ${COLORS.line}`, fontSize: 12.5 }} />
          <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} style={{ padding: "9px 11px", borderRadius: 9, border: `1px solid ${COLORS.line}`, fontSize: 12.5 }}>
            {data.supervisors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ padding: "9px 11px", borderRadius: 9, border: `1px solid ${COLORS.line}`, fontSize: 12.5 }}>
            {["Low", "Medium", "High", "Critical"].map((p) => <option key={p}>{p}</option>)}
          </select>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ padding: "9px 11px", borderRadius: 9, border: `1px solid ${COLORS.line}`, fontSize: 12.5 }} />
          <Button onClick={create}>Create</Button>
        </div>
      </Card>
      <Card style={{ padding: 16 }}>
        <Table headers={["Task", "Supervisor", "Priority", "Due", "Status"]}>
          {data.tasks.map((t) => {
            const sup = data.supervisors.find((s) => s.id === t.supervisorId);
            return (
              <tr key={t.id}>
                <Td>{t.title}</Td>
                <Td>{sup?.name}</Td>
                <Td><Badge tone={t.priority === "Critical" || t.priority === "High" ? "red" : "grey"}>{t.priority}</Badge></Td>
                <Td mono>{fmtDate(t.dueDate)}</Td>
                <Td><Badge tone={statusTone(t.status)}>{t.status}</Badge></Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}

function IncidentsPage({ data, persist, notify }) {
  const [selected, setSelected] = useState(null);
  const setStatus = (id, status) => {
    persist({ ...data, incidents: data.incidents.map((i) => (i.id === id ? { ...i, status } : i)) });
    notify(`Incident marked ${status}.`);
  };
  const sorted = [...data.incidents].sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <div>
      <SectionTitle sub="Field-reported issues requiring management follow-up">Incidents</SectionTitle>
      <Card style={{ padding: 16 }}>
        <Table headers={["Site", "Supervisor", "Category", "Severity", "Date", "Status", ""]}>
          {sorted.map((i) => {
            const site = data.sites.find((s) => s.id === i.siteId);
            const sup = data.supervisors.find((s) => s.id === i.supervisorId);
            return (
              <tr key={i.id}>
                <Td>{site?.name}</Td>
                <Td>{sup?.name}</Td>
                <Td>{i.category}</Td>
                <Td><Badge tone={i.severity === "Critical" || i.severity === "High" ? "red" : i.severity === "Medium" ? "orange" : "grey"}>{i.severity}</Badge></Td>
                <Td mono>{fmtDate(i.date)}</Td>
                <Td><Badge tone={statusTone(i.status)}>{i.status}</Badge></Td>
                <Td>
                  {i.status !== "Resolved" && i.status !== "Closed" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      {i.status === "Open" && <Button size="sm" variant="ghost" onClick={() => setStatus(i.id, "Under Review")}>Review</Button>}
                      <Button size="sm" variant="ghost" onClick={() => setStatus(i.id, "Resolved")}>Resolve</Button>
                    </div>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}

function ReportsPage({ data }) {
  const [selected, setSelected] = useState(null);
  const sorted = [...data.reports].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  if (selected) {
    const r = data.reports.find((x) => x.id === selected);
    if (!r) { setSelected(null); return null; }
    const sup = data.supervisors.find((s) => s.id === r.supervisorId);
    const labourEntries = (r.labourIds || []).map((id) => (data.labour || []).find((l) => l.id === id)).filter(Boolean);
    return (
      <div>
        <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: COLORS.inkMute, cursor: "pointer", fontSize: 12.5, marginBottom: 10 }}>← Back to reports</button>
        <SectionTitle sub={`${sup?.name || "Unknown supervisor"} — ${fmtDate(r.date)}`}>Daily Report</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 16 }}>
          <KPI label="Sites Visited" value={r.sitesVisited} />
          <KPI label="Present" value={r.present} />
          <KPI label="Absent" value={r.absent} />
          <KPI label="Tasks Done" value={r.tasksCompleted} />
          <KPI label="Issues" value={r.issues} />
        </div>
        <Card style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Remarks / client feedback</div>
          <div style={{ fontSize: 13, color: r.remarks ? COLORS.ink : COLORS.inkMute, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {r.remarks || "No remarks were entered for this report."}
          </div>
          <div style={{ fontSize: 11, color: COLORS.inkMute, marginTop: 12 }}>Submitted {r.submittedAt ? fmtDate(r.submittedAt) : "—"} · Status: {r.status}</div>
        </Card>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Manpower deployed / hired ({labourEntries.length})</div>
        {labourEntries.length === 0 ? (
          <Empty title="No new manpower was reported this day." />
        ) : (
          <Card style={{ padding: 10 }}>
            <Table headers={["Name", "Father's name", "Contact", "Client", "Onboarding status"]}>
              {labourEntries.map((l) => (
                <tr key={l.id}>
                  <Td>{l.name}</Td>
                  <Td>{l.fatherName}</Td>
                  <Td mono>{l.contactNumber}</Td>
                  <Td>{l.clientName}</Td>
                  <Td><Badge tone={l.onboardingStatus === "Onboarded" ? "green" : l.onboardingStatus === "Left Before Onboarding" ? "red" : "orange"}>{l.onboardingStatus}</Badge></Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div>
      <SectionTitle sub="Daily reports submitted by field supervisors — click a row to open it">Daily Reports</SectionTitle>
      <Card style={{ padding: 16 }}>
        {sorted.length === 0 ? (
          <Empty title="No daily reports submitted yet." sub="Supervisor-submitted reports will appear here." />
        ) : (
          <Table headers={["Supervisor", "Date", "Sites Visited", "Present", "Absent", "Tasks Done", "Issues", "Manpower", "Status"]}>
            {sorted.map((r) => {
              const sup = data.supervisors.find((s) => s.id === r.supervisorId);
              return (
                <tr key={r.id} onClick={() => setSelected(r.id)} style={{ cursor: "pointer" }}>
                  <Td>{sup?.name}</Td>
                  <Td mono>{fmtDate(r.date)}</Td>
                  <Td mono>{r.sitesVisited}</Td>
                  <Td mono>{r.present}</Td>
                  <Td mono>{r.absent}</Td>
                  <Td mono>{r.tasksCompleted}</Td>
                  <Td mono>{r.issues}</Td>
                  <Td mono>{(r.labourIds || []).length}</Td>
                  <Td><Badge tone={statusTone(r.status)}>{r.status}</Badge></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

function RequirementsPage({data,persist,notify}) {
  const [form,setForm]=useState({title:"",client:"",siteId:data.sites[0]?.id||"",designation:"",openings:1,salary:"",priority:"Medium",deadline:todayStr(),description:"",supervisorId:data.supervisors[0]?.id||""});
  const reqs=data.requirements||[];
  const create=()=>{if(!form.title.trim()){notify("Requirement title is required.","error");return;} const r={...form,id:uid("req"),openings:Number(form.openings),closedOpenings:0,status:"Open",createdAt:new Date().toISOString()};persist({...data,requirements:[r,...reqs]});setForm({...form,title:"",description:"",openings:1});notify("Requirement uploaded for the assigned supervisor.");};
  const update=(id,patch)=>{persist({...data,requirements:reqs.map(r=>r.id===id?{...r,...patch}:r)});};
  return <div><SectionTitle sub="Create and update current manpower openings">Current Requirements</SectionTitle>
    <Card style={{padding:16,marginBottom:16}}><div style={{fontWeight:700,marginBottom:12}}>Upload new requirement</div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8}}>
        <input placeholder="Opening title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} style={inputStyle}/>
        <input placeholder="Client" value={form.client} onChange={e=>setForm({...form,client:e.target.value})} style={inputStyle}/>
        <input placeholder="Designation" value={form.designation} onChange={e=>setForm({...form,designation:e.target.value})} style={inputStyle}/>
        <select value={form.siteId} onChange={e=>setForm({...form,siteId:e.target.value})} style={inputStyle}>{data.sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input type="number" min="1" placeholder="Openings" value={form.openings} onChange={e=>setForm({...form,openings:e.target.value})} style={inputStyle}/>
        <input type="number" placeholder="Salary" value={form.salary} onChange={e=>setForm({...form,salary:e.target.value})} style={inputStyle}/>
        <select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} style={inputStyle}>{["Low","Medium","High","Critical"].map(x=><option key={x}>{x}</option>)}</select>
        <input type="date" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})} style={inputStyle}/>
        <select value={form.supervisorId} onChange={e=>setForm({...form,supervisorId:e.target.value})} style={inputStyle}>{data.supervisors.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>
      <textarea placeholder="Full opening details / client notes" rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={{...inputStyle,marginTop:8}}/>
      <Button onClick={create} variant="amber" style={{marginTop:10}}>Upload requirement</Button>
    </Card>
    <Card style={{padding:10}}><Table headers={["Requirement","Supervisor","Openings","Closed","Deadline","Status","Update"]}>{reqs.map(r=><tr key={r.id}>
      <Td>{r.title}<div style={{fontSize:10.5,color:COLORS.inkMute}}>{r.client} • {r.designation}</div></Td><Td>{data.supervisors.find(s=>s.id===r.supervisorId)?.name}</Td><Td mono>{r.openings}</Td>
      <Td><input type="number" min="0" max={r.openings} value={r.closedOpenings||0} onChange={e=>update(r.id,{closedOpenings:Math.min(r.openings,Math.max(0,Number(e.target.value))),status:Number(e.target.value)>=r.openings?"Closed":"Open"})} style={{width:70,padding:5,border:`1px solid ${COLORS.line}`,borderRadius:6}}/></Td>
      <Td mono>{r.deadline}</Td><Td><Badge tone={statusTone(r.status)}>{r.status}</Badge></Td><Td><select value={r.status} onChange={e=>update(r.id,{status:e.target.value})} style={{padding:5,borderRadius:6,border:`1px solid ${COLORS.line}`}}><option>Open</option><option>On Hold</option><option>Closed</option></select></Td>
    </tr>)}</Table></Card>
  </div>;
}

function ClockoutRequestsPage({ data, persist, notify }) {
  const pending = data.visits.filter((v) => v.overrideStatus === "pending");
  const resolved = data.visits.filter((v) => v.overrideStatus === "approved" || v.overrideStatus === "denied")
    .sort((a, b) => new Date(b.overrideRespondedAt || 0) - new Date(a.overrideRespondedAt || 0)).slice(0, 20);

  const respond = (visitId, status) => {
    persist({
      ...data,
      visits: data.visits.map((v) => v.id === visitId ? { ...v, overrideStatus: status, overrideRespondedAt: new Date().toISOString() } : v),
    });
    notify(status === "approved" ? "Out-of-range clock-out approved." : "Request denied.");
  };

  const Row = ({ v, actionable }) => {
    const sup = data.supervisors.find((s) => s.id === v.supervisorId);
    const site = data.sites.find((s) => s.id === v.siteId);
    return (
      <Card key={v.id} style={{ padding: 14, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{sup?.name} <span style={{ fontWeight: 400, color: COLORS.inkMute, fontSize: 11.5 }}>({sup?.empId})</span></div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginTop: 2 }}>{site?.name} — {site?.client}</div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginTop: 6 }}>
              Distance from site: <b style={{ fontFamily: "IBM Plex Mono, monospace" }}>{v.distance}m</b> (geofence {site?.geofenceM}m)
            </div>
            <div style={{ fontSize: 10.5, color: COLORS.inkMute, marginTop: 4 }}>Requested {fmtDate(v.overrideRequestedAt)}</div>
          </div>
          {actionable ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="amber" size="sm" onClick={() => respond(v.id, "approved")}>Approve</Button>
              <Button variant="ghost" size="sm" onClick={() => respond(v.id, "denied")}>Deny</Button>
            </div>
          ) : (
            <Badge tone={v.overrideStatus === "approved" ? "green" : "red"}>{v.overrideStatus === "approved" ? "Approved" : "Denied"}</Badge>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div>
      <SectionTitle sub="Approve out-of-geofence clock-out requests from supervisors">Clock-out Requests</SectionTitle>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Pending ({pending.length})</div>
      {pending.length === 0 ? <Empty title="No pending requests" /> : pending.map((v) => <Row key={v.id} v={v} actionable />)}
      {resolved.length > 0 && <>
        <div style={{ fontWeight: 700, fontSize: 13, margin: "20px 0 8px" }}>Recently resolved</div>
        {resolved.map((v) => <Row key={v.id} v={v} actionable={false} />)}
      </>}
    </div>
  );
}


function LabourMasterPage({data,persist,notify}) {
  const rows = data.labour || [];
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const filtered = rows.filter((l) => {
    if (statusFilter !== "All" && l.onboardingStatus !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return l.name?.toLowerCase().includes(q) || l.contactNumber?.includes(q) || l.clientName?.toLowerCase().includes(q);
  }).sort((a,b)=>(b.dateAdded||"").localeCompare(a.dateAdded||""));

  const update = (id, patch) => persist({ ...data, labour: rows.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: new Date().toISOString() } : l)) });

  const counts = {
    total: rows.length,
    pending: rows.filter((l) => l.onboardingStatus === "Pending Onboarding").length,
    onboarded: rows.filter((l) => l.onboardingStatus === "Onboarded").length,
    left: rows.filter((l) => l.onboardingStatus === "Left Before Onboarding").length,
  };

  return (
    <div>
      <SectionTitle sub="Manpower hired/deployed by supervisors, tracked through to EPF/ESIC onboarding">ESIC & EPF — Labour Master</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        {[["Total labour", counts.total], ["Pending onboarding", counts.pending], ["Onboarded", counts.onboarded], ["Left before onboarding", counts.left]].map(([l, v]) => (
          <Card key={l} style={{ padding: 12 }}>
            <div style={{ fontSize: 10.5, color: COLORS.inkMute, textTransform: "uppercase", letterSpacing: 0.4 }}>{l}</div>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, fontSize: 20, marginTop: 4 }}>{v}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input placeholder="Search name, contact, or client…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, maxWidth: 260 }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }}>
          {["All", "Pending Onboarding", "Onboarded", "Left Before Onboarding"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <Card style={{ padding: 10 }}>
        {filtered.length === 0 ? <Empty title="No labour records match" /> : (
          <Table headers={["Labour", "Father's name", "Contact", "Client", "Status", "UAN", "ESIC number", "Date added", "Supervisor"]}>
            {filtered.map((l) => (
              <tr key={l.id}>
                <Td>{l.name}</Td>
                <Td>{l.fatherName}</Td>
                <Td mono>{l.contactNumber}</Td>
                <Td>{l.clientName}</Td>
                <Td>
                  <select
                    value={l.onboardingStatus}
                    onChange={(e) => update(l.id, { onboardingStatus: e.target.value })}
                    style={{ padding: 5, borderRadius: 6, border: `1px solid ${COLORS.line}`, fontSize: 11.5 }}
                  >
                    <option>Pending Onboarding</option>
                    <option>Onboarded</option>
                    <option>Left Before Onboarding</option>
                  </select>
                </Td>
                <Td>
                  <input
                    defaultValue={l.uan}
                    placeholder="UAN number"
                    onBlur={(e) => e.target.value !== l.uan && update(l.id, { uan: e.target.value.trim() })}
                    style={{ width: 120, padding: 5, border: `1px solid ${COLORS.line}`, borderRadius: 6, fontSize: 11.5 }}
                  />
                </Td>
                <Td>
                  <input
                    defaultValue={l.esicNumber}
                    placeholder="ESIC number"
                    onBlur={(e) => e.target.value !== l.esicNumber && update(l.id, { esicNumber: e.target.value.trim() })}
                    style={{ width: 120, padding: 5, border: `1px solid ${COLORS.line}`, borderRadius: 6, fontSize: 11.5 }}
                  />
                </Td>
                <Td mono>{l.dateAdded ? fmtDate(l.dateAdded) : "—"}</Td>
                <Td>{data.supervisors.find((s) => s.id === l.supervisorId)?.name || "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}


function SupervisorAttendancePage({data}) {
  const rows=[...(data.supervisorAttendance||[])].sort((a,b)=>new Date(b.clockIn)-new Date(a.clockIn));
  return <div><SectionTitle sub="Attendance and working hours by supervisor login">Supervisor Attendance</SectionTitle>
    <Card style={{padding:10}}><Table headers={["Supervisor","Employee ID","Date","Location","Clock In","Clock Out","Working Hours","Status"]}>{rows.map(a=><tr key={a.id}><Td>{data.supervisors.find(s=>s.id===a.supervisorId)?.name}</Td><Td mono>{data.supervisors.find(s=>s.id===a.supervisorId)?.empId}</Td><Td mono>{a.date}</Td><Td>{data.sites.find(s=>s.id===a.siteId)?.name}</Td><Td mono>{fmtTime(a.clockIn)}</Td><Td mono>{fmtTime(a.clockOut)}</Td><Td mono>{fmtDuration(a.clockIn,a.clockOut)}</Td><Td><Badge tone={statusTone(a.status)}>{a.status}</Badge></Td></tr>)}</Table></Card>
  </div>;
}

function AnalyticsPage({ data }) {
  const byCategory = {};
  data.incidents.forEach((i) => { byCategory[i.category] = (byCategory[i.category] || 0) + 1; });
  const maxCat = Math.max(1, ...Object.values(byCategory));
  const bySeverity = ["Critical", "High", "Medium", "Low"].map((s) => ({ s, n: data.incidents.filter((i) => i.severity === s).length }));
  const maxSev = Math.max(1, ...bySeverity.map((x) => x.n));

  const visitCompletion = Math.round((data.visits.filter((v) => v.status === "Completed").length / Math.max(1, data.visits.length)) * 100);
  const taskCompletion = Math.round((data.tasks.filter((t) => t.status === "Completed").length / Math.max(1, data.tasks.length)) * 100);
  const attendanceRate = Math.round((data.attendance.filter((a) => a.status === "Present").length / Math.max(1, data.attendance.length)) * 100);
  const totalOpenings = (data.requirements||[]).reduce((n,r)=>n+Number(r.openings||0),0);
  const closedOpenings = (data.requirements||[]).reduce((n,r)=>n+Number(r.closedOpenings||0),0);
  const closureRate = Math.round((closedOpenings/Math.max(1,totalOpenings))*100);

  return (
    <div>
      <SectionTitle sub="Trends across attendance, visits, requirements and incidents">Analytics & Performance</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
        <KPI label="Visit Completion" value={`${visitCompletion}%`} tone={COLORS.success} />
        <KPI label="Task Completion" value={`${taskCompletion}%`} tone={COLORS.info} />
        <KPI label="Employee Attendance" value={`${attendanceRate}%`} tone={COLORS.amber} />
        <KPI label="Opening Closure" value={`${closureRate}%`} tone={COLORS.navy2} sub={`${closedOpenings}/${totalOpenings} openings`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 12 }}>Incidents by category</div>
          {Object.entries(byCategory).length === 0 && <Empty title="No incidents reported." />}
          {Object.entries(byCategory).map(([cat, n]) => (
            <div key={cat} style={{ marginBottom: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: COLORS.inkMute }}>{cat}</span><span style={{ fontWeight: 700 }}>{n}</span>
              </div>
              <div style={{ height: 6, background: "#EEF0F3", borderRadius: 99 }}>
                <div style={{ height: 6, width: `${(n / maxCat) * 100}%`, background: COLORS.info, borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 12 }}>Incidents by severity</div>
          {bySeverity.map(({ s, n }) => (
            <div key={s} style={{ marginBottom: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: COLORS.inkMute }}>{s}</span><span style={{ fontWeight: 700 }}>{n}</span>
              </div>
              <div style={{ height: 6, background: "#EEF0F3", borderRadius: 99 }}>
                <div style={{ height: 6, width: `${(n / maxSev) * 100}%`, background: s === "Critical" || s === "High" ? COLORS.danger : COLORS.warning, borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </Card>
      </div>
      <div style={{ fontSize: 11.5, color: COLORS.inkMute, marginTop: 14 }}>
        Export to CSV / Excel / PDF is wired to the same filtered dataset in the production build.
      </div>
    </div>
  );
}
