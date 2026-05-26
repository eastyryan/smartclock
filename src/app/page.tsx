"use client";
import ExcelJS from 'exceljs';
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from '../lib/supabase';

const EMPLOYEES = [
  { name: "Adrian", pin: "3847" },
  { name: "Antonio Alvarez", pin: "6192" },
  { name: "Brandy Larabie", pin: "5038" },
  { name: "Cameron Rice", pin: "7261" },
  { name: "Carolina Landa", pin: "4915" },
  { name: "Easton Ryan", pin: "8374" },
  { name: "Evariste Sindayizeruka", pin: "2659" },
  { name: "Griffin Kay", pin: "9123" },
  { name: "Hayden Rice", pin: "1486" },
  { name: "Isabella Dean", pin: "7530" },
  { name: "Jonathan Ceballos", pin: "4271" },
  { name: "Karen Constantino", pin: "8609" },
  { name: "Levy", pin: "3152" },
  { name: "Marshal Armah Adjetey (Wally)", pin: "5784" },
  { name: "Moses Boateng", pin: "6347" },
  { name: "Satpal Singh", pin: "9058" },
  { name: "ShonDreya Smardon", pin: "4629" },
  { name: "Tyrell Anderson", pin: "2813" },
  { name: "Vanessa Sciampacone", pin: "8041" },
  { name: "Will Kennedy", pin: "7492" },
];

const MANAGERS = ["Nick Dean", "Jake Ryan"];
const MANAGER_PIN = "7913";

const INITIAL_SITES = [
  { id: 1, name: "The Shop", address: "4271 Greenbank Rd, Ottawa, ON", lat: 45.2241, lng: -75.7186, radius: 359, active: true },
  { id: 2, name: "Navaho", address: "8 Deerfield Dr, Ottawa, ON", lat: 45.3559, lng: -75.7520, radius: 359, active: true },
  { id: 3, name: "Skyline", address: "42 Northview Rd, Ottawa, ON", lat: 45.3629, lng: -75.7296, radius: 359, active: true },
  { id: 4, name: "Meadowlands", address: "1242 Meadowlands Dr E, Ottawa, ON", lat: 45.35909125246288, lng: -75.72347435767033, radius: 1000, active: true },
  { id: 5, name: "Craig Henry", address: "269E Craig Henry Dr, Ottawa, ON", lat: 45.33510047434069, lng: -75.76491428943284, radius: 550, active: true },
  { id: 6, name: "Walkley", address: "550 Reardon Pvt, Ottawa, ON", lat: 45.3758, lng: -75.6483, radius: 359, active: true },
  { id: 7, name: "Beaconwood", address: "2012 Beaconwood Dr, Ottawa, ON", lat: 45.4474, lng: -75.5971, radius: 359, active: true },
  { id: 8, name: "Forestview", address: "651 Woodcliffe Pvt, Ottawa, ON", lat: 45.4619, lng: -75.5386, radius: 359, active: true },
  { id: 9, name: "Aspenview", address: "1628 Teakdale Ave, Ottawa, ON", lat: 45.4517, lng: -75.5265, radius: 359, active: true },
  { id: 10, name: "Castle Hill", address: "1000 Castle Hill Cres, Ottawa, ON", lat: 45.3696, lng: -75.7454, radius: 359, active: true },
  { id: 11, name: "Jubilee", address: "24 Rutlege St, Ottawa, ON", lat: 45.27937109543332, lng: -75.7140484165026, radius: 359, active: true },
  { id: 12, name: "Timberline", address: "25 Alpenglow Private, Ottawa, ON", lat: 45.27572462629332, lng: -75.71053090588975, radius: 359, active: true },
];

const FENCE_RADIUS = 359;

// Separates the manager's typed reason from the auto-generated change summary in `notes`.
const EDIT_SUMMARY_MARK = "\n↳ ";

const VEHICLES = [
  "GMC Truck (with Dump)",
  "Ramptruck",
  "2019 Cubevan (Orleans Crew)",
  "2020 Cubevan (Craig Henry Crew)",
];

const GAS_LEVELS = ["Empty", "¼", "½", "¾", "Full"];

// End-of-day checklist items. `key` maps to the eod_checklists DB column.
const EOD_TRUCK_ITEMS = [
  { key: "no_trash", label: "No trash in trucks (including work apparel)" },
  { key: "interior_wipe", label: "Truck interiors wiped down (seats, doors, dashboard)" },
  { key: "bed_blown", label: "Truck bed blown out (debris removed inside/bed)" },
];
const EOD_EQUIP_ITEMS = [
  { key: "clean_mower", label: "Clean mower (no grass in bag / blow underneath deck)" },
  { key: "clean_weedwacker", label: "Clean weedwacker" },
  { key: "clean_blower", label: "Clean blower" },
];

function mapRow(row: any) {
  return {
    id: row.id,
    employee: row.employee_name,
    site: row.site_name,
    siteId: row.site_id,
    manager: row.manager_name,
    clockIn: row.clock_in,
    clockOut: row.clock_out,
    hours: row.hours,
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    notes: row.notes,
  };
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000, p = Math.PI / 180;
  const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p)) / 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatTime(d: string) { return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }); }
function formatDate(d: string) { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function formatDateFile(d: Date) { return d.toLocaleDateString("en-CA"); }

function calcHours(ci: string, co: string) {
  const diff = (new Date(co).getTime() - new Date(ci).getTime()) / 3600000;
  return Math.round(Math.max(0, diff - 0.5) * 100) / 100;
}

function getPayPeriod(date: Date) {
  const d = new Date(date), day = d.getDate(), m = d.getMonth(), y = d.getFullYear();
  const mName = d.toLocaleString("en-US", { month: "short" });
  if (day <= 15) return { label: mName + " 1-15, " + y, start: new Date(y, m, 1), end: new Date(y, m, 15, 23, 59, 59) };
  const last = new Date(y, m + 1, 0).getDate();
  return { label: mName + " 16-" + last + ", " + y, start: new Date(y, m, 16), end: new Date(y, m, last, 23, 59, 59) };
}
function getCurrentPayPeriod() { return getPayPeriod(new Date()); }

function getRecentPayPeriods(count = 12) {
  const result: Array<{ label: string; start: Date; end: Date }> = [];
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth(), isSecond = now.getDate() > 15;
  for (let i = 0; i < count; i++) {
    const lastDay = new Date(y, m + 1, 0).getDate();
    const mName = new Date(y, m, 1).toLocaleString("en-US", { month: "short" });
    if (isSecond) {
      result.push({ label: mName + " 16-" + lastDay + ", " + y, start: new Date(y, m, 16), end: new Date(y, m, lastDay, 23, 59, 59) });
      isSecond = false;
    } else {
      result.push({ label: mName + " 1-15, " + y, start: new Date(y, m, 1), end: new Date(y, m, 15, 23, 59, 59) });
      if (m === 0) { m = 11; y -= 1; } else { m -= 1; }
      isSecond = true;
    }
  }
  return result;
}

async function compressImage(file: File, maxDim = 1920, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function uploadToGoogleDrive(files: any[], siteName: string, employeeName: string, opts?: { folderName?: string; filenameBase?: string }) {
  const formData = new FormData();
  formData.append('siteName', siteName);
  formData.append('employeeName', employeeName);
  if (opts?.folderName) formData.append('folderName', opts.folderName);
  if (opts?.filenameBase) formData.append('filenameBase', opts.filenameBase);
  files.forEach((f: any, i: number) => {
    formData.append('files', f.file);
    formData.append('note_' + i, f.note || '');
  });
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!res.ok) {
      let detail = '';
      try { const j = await res.json(); detail = j.error || ''; } catch { detail = await res.text().catch(() => ''); }
      return { error: 'Upload failed (' + res.status + ')' + (detail ? ': ' + detail.slice(0, 200) : '') };
    }
    return await res.json();
  } catch (e: any) {
    return { error: 'Network error: ' + (e?.message || 'unknown') };
  }
}

const S = {
  card: { background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" } as React.CSSProperties,
  input: { width: "100%", padding: "11px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, color: "#1e293b", fontSize: 15, outline: "none", boxSizing: "border-box" as const },
  label: { display: "block", fontSize: 13, color: "#64748b", marginBottom: 4, fontWeight: 600 } as React.CSSProperties,
};

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 460, width: "100%", maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Input({ label, ...props }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={S.label}>{label}</label>}
      <input {...props} style={{ ...S.input, ...(props.style || {}) }} />
    </div>
  );
}

function Select({ label, options, placeholder, ...props }: any) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={S.label}>{label}</label>}
      <select {...props} style={{ ...S.input, appearance: "none" as const }}>
        <option value="">{placeholder || "Select..."}</option>
        {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Btn({ children, variant = "primary", ...props }: any) {
  const styles: any = {
    primary: { background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "#fff", border: "none" },
    success: { background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", border: "none" },
    outline: { background: "#fff", color: "#475569", border: "1px solid #d1d5db" },
    ghost: { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" },
  };
  return (
    <button {...props} style={{ padding: "11px 22px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "all 0.15s", opacity: props.disabled ? 0.5 : 1, ...(styles[variant] || styles.primary), ...(props.style || {}) }}>
      {children}
    </button>
  );
}

function Badge({ children, color = "#dc2626" }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, background: color + "15", color, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>{children}</span>
  );
}

function PinPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const keys = ["1","2","3","4","5","6","7","8","9","","0","del"];
  const press = (k: string) => {
    if (k === "del") onChange(value.slice(0, -1));
    else if (k && value.length < 4) onChange(value + k);
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 18 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 44, height: 52, borderRadius: 10,
            background: value[i] ? "#dc2626" : "#f1f5f9",
            border: "2px solid " + (value[i] ? "#dc2626" : "#d1d5db"),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 800, color: value[i] ? "#fff" : "#cbd5e1",
            transition: "all 0.15s"
          }}>
            {value[i] ? "•" : ""}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, maxWidth: 280, margin: "0 auto" }}>
        {keys.map((k, i) => (
          <button key={i} onClick={() => press(k)} disabled={!k}
            style={{
              height: 56, borderRadius: 12, border: "1px solid #e2e8f0",
              background: k === "del" ? "#fef2f2" : k ? "#fff" : "transparent",
              color: k === "del" ? "#dc2626" : "#1e293b",
              fontSize: k === "del" ? 16 : 24, fontWeight: 700,
              cursor: k ? "pointer" : "default",
              visibility: k ? "visible" : "hidden",
              userSelect: "none"
            }}>
            {k === "del" ? "⌫" : k}
          </button>
        ))}
      </div>
    </div>
  );
}

function PinEntry({ title, subtitle, onVerify, employees, type = "employee" }: any) {
  const [sel, setSel] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (pin.length === 4) {
      setTimeout(() => {
        if (type === "manager") {
          if (pin === MANAGER_PIN) { onVerify(true); return; }
          setErr("Incorrect manager PIN"); setPin(""); setShake(true); setTimeout(() => setShake(false), 500); return;
        }
        const emp = employees.find((e: any) => e.name === sel);
        if (!emp) { setErr("Please select an employee first"); setPin(""); return; }
        if (emp.pin !== pin) { setErr("Incorrect PIN"); setPin(""); setShake(true); setTimeout(() => setShake(false), 500); return; }
        setErr(""); onVerify(emp);
      }, 200);
    }
  }, [pin]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ ...S.card, maxWidth: 400, width: "100%", textAlign: "center" as const, padding: "28px 24px 24px" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #dc2626, #b91c1c)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 24 }}>
          {type === "manager" ? "🔒" : "👤"}
        </div>
        <h2 style={{ color: "#1e293b", margin: "0 0 4px", fontSize: 20 }}>{title}</h2>
        <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 20 }}>{subtitle || (type === "manager" ? "Enter manager PIN" : "Select your name, then enter your PIN")}</p>
        {type !== "manager" && (
          <Select placeholder="Select Employee" value={sel} onChange={(e: any) => { setSel(e.target.value); setErr(""); setPin(""); }}
            options={employees.map((e: any) => ({ value: e.name, label: e.name }))} />
        )}
        <div style={{ animation: shake ? "shake 0.4s ease" : "none" }}>
          <PinPad value={pin} onChange={(v: string) => { setPin(v); setErr(""); }} />
        </div>
        {err && <p style={{ color: "#dc2626", fontSize: 13, margin: "12px 0 0", fontWeight: 500 }}>{err}</p>}
        <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }`}</style>
      </div>
    </div>
  );
}

function ClockPage({ sites, activeClocks, onClockIn, onClockOut, history }: any) {
  const [emp, setEmp] = useState<any>(null);
  const [site, setSite] = useState("");
  const [manager, setManager] = useState("");
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [msg, setMsg] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const activeSites = sites.filter((s: any) => s.active);
  const isClockedIn = emp && activeClocks.find((c: any) => c.employee === emp.name);
  const myHistory = emp ? history.filter((h: any) => h.employee === emp.name).slice().sort((a: any, b: any) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime()) : [];

  const checkGeo = useCallback((siteId: string) => {
    if (!siteId) return;
    const s = sites.find((x: any) => x.id === Number(siteId));
    if (!s) return;
    setGeoStatus("checking");
    if (!navigator.geolocation) { setGeoStatus("unavailable"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos: GeolocationPosition) => { setGeoStatus(getDistance(pos.coords.latitude, pos.coords.longitude, s.lat, s.lng) <= (s.radius || FENCE_RADIUS) ? "verified" : "too_far"); },
      () => setGeoStatus("denied")
    );
  }, [sites]);

  const clockIn = async () => {
    setLoading(true);
    const s = sites.find((x: any) => x.id === Number(site));
    await onClockIn(emp.name, s, manager);
    setMsg({ type: "success", text: emp.name + " clocked in at " + s.name });
    setTimeout(() => { setLoading(false); setEmp(null); setSite(""); setManager(""); setGeoStatus(null); setMsg(null); }, 2500);
  };

  const clockOut = async () => {
    setLoading(true);
    const active = activeClocks.find((c: any) => c.employee === emp.name);
    const hrs = calcHours(active.clockIn, new Date().toISOString());
    await onClockOut(emp.name);
    setMsg({ type: "success", text: emp.name + " clocked out - " + hrs + "h (30min lunch deducted)" });
    setTimeout(() => { setLoading(false); setEmp(null); setMsg(null); }, 2500);
  };

  if (!emp) return <PinEntry title="Clock In / Out" subtitle="Verify your identity to start" onVerify={setEmp} employees={EMPLOYEES} />;

  if (showHistory) {
    const statusColor: any = { pending: "#f59e0b", approved: "#16a34a", rejected: "#dc2626", edited: "#7c3aed" };
    const totalHrs = myHistory.filter((h: any) => h.status !== "rejected").reduce((s: number, h: any) => s + (Number(h.hours) || 0), 0);
    return (
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ maxWidth: 540, width: "100%" }}>
          <div style={{ ...S.card, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, #dc2626, #b91c1c)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{emp.name[0]}</div>
            <div style={{ flex: 1 }}>
              <p style={{ color: "#1e293b", margin: 0, fontWeight: 700, fontSize: 17 }}>{emp.name}</p>
              <p style={{ color: "#94a3b8", margin: 0, fontSize: 13 }}>{myHistory.length} time card(s) · {totalHrs.toFixed(1)}h total</p>
            </div>
          </div>
          {myHistory.length === 0 ? (
            <div style={{ ...S.card, textAlign: "center" as const, padding: 40 }}>
              <p style={{ color: "#94a3b8", margin: 0 }}>You don&apos;t have any time cards yet.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
              {myHistory.map((h: any) => {
                const sc = statusColor[h.status] || "#94a3b8";
                return (
                  <div key={h.id} style={{ ...S.card, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <p style={{ color: "#1e293b", margin: 0, fontWeight: 700, fontSize: 15 }}>{formatDate(h.clockIn)}</p>
                        <p style={{ color: "#64748b", margin: "2px 0 0", fontSize: 12 }}>{formatTime(h.clockIn)} – {h.clockOut ? formatTime(h.clockOut) : "—"}</p>
                      </div>
                      <div style={{ textAlign: "right" as const }}>
                        <p style={{ color: "#1e293b", margin: 0, fontWeight: 800, fontSize: 18 }}>{h.hours}h</p>
                        <Badge color={sc}>{(h.status || "").charAt(0).toUpperCase() + (h.status || "").slice(1)}</Badge>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" as const }}>
                      <span style={{ fontSize: 12, color: "#475569", display: "inline-flex", alignItems: "center", gap: 4 }}>📍 {h.site}</span>
                      <span style={{ fontSize: 12, color: "#475569", display: "inline-flex", alignItems: "center", gap: 4 }}>👤 {h.manager}</span>
                    </div>
                    {h.notes && (
                      <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 14 }}>✏️</span>
                        <p style={{ color: "#78350f", margin: 0, fontSize: 12, lineHeight: 1.4, whiteSpace: "pre-wrap" as const }}>
                          <strong>Manager note:</strong> {h.notes}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <Btn variant="ghost" onClick={() => setShowHistory(false)} style={{ width: "100%", marginTop: 14 }}>Back</Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        {msg && (
          <div style={{ ...S.card, textAlign: "center" as const, marginBottom: 20, borderLeft: "4px solid " + (msg.type === "success" ? "#16a34a" : "#dc2626") }}>
            <p style={{ color: "#1e293b", margin: 0, fontSize: 16, fontWeight: 500 }}>{msg.text}</p>
          </div>
        )}
        {!msg && (
          <>
            <div style={{ ...S.card, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, #dc2626, #b91c1c)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{emp.name[0]}</div>
              <div style={{ flex: 1 }}>
                <p style={{ color: "#1e293b", margin: 0, fontWeight: 700, fontSize: 17 }}>{emp.name}</p>
                <p style={{ color: "#94a3b8", margin: 0, fontSize: 13 }}>{isClockedIn ? "Clocked in at " + isClockedIn.site : "Not currently clocked in"}</p>
              </div>
              <Badge color={isClockedIn ? "#16a34a" : "#94a3b8"}>{isClockedIn ? "ACTIVE" : "IDLE"}</Badge>
            </div>
            <div style={S.card}>
              {isClockedIn ? (
                <div style={{ textAlign: "center" as const, padding: "20px 0" }}>
                  <p style={{ color: "#64748b", fontSize: 14, marginBottom: 4 }}>Clocked in since</p>
                  <p style={{ color: "#1e293b", fontSize: 28, fontWeight: 800, margin: "0 0 4px" }}>{formatTime(isClockedIn.clockIn)}</p>
                  <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 20 }}>at {isClockedIn.site}</p>
                  <Btn onClick={clockOut} disabled={loading} style={{ width: "100%" }}>Clock Out</Btn>
                  <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 10 }}>30 minutes will be automatically deducted for lunch</p>
                </div>
              ) : (
                <>
                  <Select label="Job Site" placeholder="Select job site" value={site}
                    onChange={(e: any) => { setSite(e.target.value); checkGeo(e.target.value); }}
                    options={activeSites.map((s: any) => ({ value: s.id, label: s.name }))} />
                  <Select label="Manager" placeholder="Select manager" value={manager}
                    onChange={(e: any) => setManager(e.target.value)}
                    options={MANAGERS.map((m: string) => ({ value: m, label: m }))} />
                  {geoStatus && (
                    <div style={{ padding: 12, borderRadius: 10, marginBottom: 14, background: geoStatus === "verified" ? "#f0fdf4" : geoStatus === "checking" ? "#f8fafc" : "#fef2f2", border: "1px solid " + (geoStatus === "verified" ? "#bbf7d0" : geoStatus === "checking" ? "#e2e8f0" : "#fecaca") }}>
                      <p style={{ color: geoStatus === "verified" ? "#15803d" : geoStatus === "checking" ? "#64748b" : "#dc2626", margin: 0, fontSize: 13, fontWeight: 500 }}>
                        {geoStatus === "checking" && "Verifying your location..."}
                        {geoStatus === "verified" && "Location verified - you are within range of the job site"}
                        {geoStatus === "too_far" && "You are too far from this job site"}
                        {geoStatus === "denied" && "Location access denied - please enable GPS"}
                        {geoStatus === "unavailable" && "Geolocation not available"}
                      </p>
                    </div>
                  )}
                  <Btn variant="success" onClick={clockIn} disabled={!site || !manager || geoStatus !== "verified" || loading} style={{ width: "100%" }}>Clock In</Btn>
                </>
              )}
            </div>
            <Btn variant="outline" onClick={() => setShowHistory(true)} style={{ width: "100%", marginTop: 10 }}>View My Time Cards ({myHistory.length})</Btn>
            <Btn variant="ghost" onClick={() => { setEmp(null); setMsg(null); }} style={{ width: "100%", marginTop: 8 }}>Back</Btn>
          </>
        )}
      </div>
    </div>
  );
}

function PhotoPage({ sites }: any) {
  const [emp, setEmp] = useState<any>(null);
  const [site, setSite] = useState("");
  const [photos, setPhotos] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const activeSites = sites.filter((s: any) => s.active);

  const handleFiles = (files: FileList) => {
    const arr = Array.from(files).map((f: File) => ({ name: f.name, url: URL.createObjectURL(f), file: f, note: "" }));
    setPhotos((p: any[]) => [...p, ...arr]);
  };

  const updateNote = (i: number, note: string) => {
    setPhotos((p: any[]) => p.map((x: any, j: number) => j === i ? { ...x, note } : x));
  };

  const upload = async () => {
    const s = sites.find((x: any) => x.id === Number(site));
    setUploading(true);
    try {
      const compressed = await Promise.all(photos.map(async (p: any) => ({ ...p, file: await compressImage(p.file) })));
      const res = await uploadToGoogleDrive(compressed, s.name, emp.name);
      setResult(res);
    } catch (e: any) {
      setResult({ error: e?.message || "Could not process photos" });
    } finally {
      setUploading(false);
    }
  };

  if (!emp) return <PinEntry title="Photo Upload" subtitle="Verify to upload job site photos" onVerify={setEmp} employees={EMPLOYEES} />;

  if (result) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ ...S.card, textAlign: "center" as const, maxWidth: 420, width: "100%", padding: 32 }}>
        {result.error ? (
          <>
            <h3 style={{ color: "#dc2626", margin: "0 0 8px" }}>Upload failed</h3>
            <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 20px", wordBreak: "break-word" as const }}>{result.error}</p>
            <Btn onClick={() => setResult(null)}>Try Again</Btn>
          </>
        ) : (
          <>
            <h3 style={{ color: "#1e293b", margin: "0 0 8px" }}>{result.count} photo(s) uploaded</h3>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 4px" }}>Saved to Google Drive:</p>
            <p style={{ color: "#475569", fontSize: 13, fontFamily: "monospace", background: "#f1f5f9", padding: "8px 12px", borderRadius: 8, margin: "8px 0 20px" }}>{result.folder}/</p>
            <Btn onClick={() => { setEmp(null); setPhotos([]); setResult(null); setSite(""); }}>Done</Btn>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <div style={{ ...S.card, marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #dc2626, #b91c1c)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>{emp.name[0]}</div>
          <div><p style={{ color: "#1e293b", margin: 0, fontWeight: 600 }}>{emp.name}</p><p style={{ color: "#94a3b8", margin: 0, fontSize: 12 }}>Photo Upload</p></div>
        </div>
        <div style={S.card}>
          <Select label="Job Site" placeholder="Select job site" value={site} onChange={(e: any) => setSite(e.target.value)}
            options={activeSites.map((s: any) => ({ value: s.id, label: s.name }))} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <button type="button" onClick={() => cameraRef.current?.click()}
              style={{ padding: "16px 12px", borderRadius: 12, border: "2px dashed #d1d5db", background: "#fafbfc", cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 24 }}>📷</span>
              <span style={{ color: "#1e293b", fontSize: 13, fontWeight: 600 }}>Take Photo</span>
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}
              style={{ padding: "16px 12px", borderRadius: 12, border: "2px dashed #d1d5db", background: "#fafbfc", cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 24 }}>🖼️</span>
              <span style={{ color: "#1e293b", fontSize: 13, fontWeight: 600 }}>Choose from Gallery</span>
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e: any) => handleFiles(e.target.files)} />
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e: any) => handleFiles(e.target.files)} />
          </div>
          <p style={{ color: "#94a3b8", margin: "0 0 12px", fontSize: 11, textAlign: "center" as const }}>All formats accepted (HEIC, JPG, PNG, WebP)</p>
          {photos.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
                {photos.map((p: any, i: number) => (
                  <div key={i} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #e5e7eb", background: "#fff", display: "flex", flexDirection: "column" as const }}>
                    <div style={{ position: "relative", aspectRatio: "1" }}>
                      <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      <button onClick={() => setPhotos((x: any[]) => x.filter((_: any, j: number) => j !== i))} style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>X</button>
                    </div>
                    <textarea
                      value={p.note || ""}
                      onChange={(e) => updateNote(i, e.target.value)}
                      placeholder="Add a caption (optional)..."
                      rows={2}
                      style={{ width: "100%", border: "none", borderTop: "1px solid #f1f5f9", padding: "8px 10px", fontSize: 12, color: "#1e293b", outline: "none", background: "#fff", boxSizing: "border-box" as const, resize: "none" as const, fontFamily: "inherit", minHeight: 44 }}
                    />
                  </div>
                ))}
              </div>
              {site && (
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12, color: "#64748b" }}>
                  Will save to: <strong style={{ color: "#475569" }}>Dean Ryan App Photos / {sites.find((x: any) => x.id === Number(site))?.name} /</strong><br />
                  Named: <strong style={{ color: "#475569" }}>{formatDateFile(new Date())}_{emp.name}_photo.jpg</strong>
                </div>
              )}
            </>
          )}
          <Btn onClick={upload} disabled={!site || photos.length === 0 || uploading} style={{ width: "100%" }}>
            {uploading ? "Uploading to Google Drive..." : "Upload " + photos.length + " Photo(s)"}
          </Btn>
        </div>
        <Btn variant="ghost" onClick={() => setEmp(null)} style={{ width: "100%", marginTop: 10 }}>Back</Btn>
      </div>
    </div>
  );
}

function ActiveBoard({ activeClocks, history, managerAuth, setManagerAuth }: any) {
  const [selPeriodIdx, setSelPeriodIdx] = useState(0);

  if (!managerAuth) return <PinEntry title="Active Board" subtitle="Manager access required" type="manager" onVerify={() => setManagerAuth(true)} employees={[]} />;

  const periods = (() => {
    const result: Array<{ label: string; start: Date; end: Date }> = [];
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth(), isSecond = now.getDate() > 15;
    for (let i = 0; i < 6; i++) {
      const lastDay = new Date(y, m + 1, 0).getDate();
      const mName = new Date(y, m, 1).toLocaleString("en-US", { month: "short" });
      if (isSecond) {
        result.push({ label: mName + " 16–" + lastDay + ", " + y, start: new Date(y, m, 16), end: new Date(y, m, lastDay, 23, 59, 59) });
        isSecond = false;
      } else {
        result.push({ label: mName + " 1–15, " + y, start: new Date(y, m, 1), end: new Date(y, m, 15, 23, 59, 59) });
        if (m === 0) { m = 11; y -= 1; } else { m -= 1; }
        isSecond = true;
      }
    }
    return result;
  })();

  const period = periods[selPeriodIdx] || periods[0];
  const today = new Date().toISOString().split("T")[0];

  const periodEntries = history.filter((h: any) => { const d = new Date(h.clockIn); return d >= period.start && d <= period.end; });
  const shiftsToday = history.filter((h: any) => h.clockIn.startsWith(today)).length + activeClocks.filter((c: any) => c.clockIn.startsWith(today)).length;
  const periodHrs = periodEntries.filter((h: any) => h.status !== "rejected").reduce((s: number, h: any) => s + h.hours, 0);
  const pendingCount = periodEntries.filter((h: any) => h.status === "pending").length;

  const activeMap: Record<string, any> = {};
  activeClocks.forEach((c: any) => { activeMap[c.employee] = c; });

  const recentCards = [...history].reverse().slice(0, 10);
  const DARK_GREEN = "#1a3620";
  const ACCENT = "#22c55e";

  return (
    <div style={{ width: "100%" }}>
      {/* Pay period bar */}
      <div style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 1 }}>PAY PERIOD</span>
          <select value={selPeriodIdx} onChange={(e) => setSelPeriodIdx(Number(e.target.value))}
            style={{ padding: "7px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, color: "#1e293b", background: "#f8fafc", fontWeight: 500 }}>
            {periods.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {[
            { val: periodEntries.length, label: "CARDS", color: "#1e293b" },
            { val: periodHrs.toFixed(1) + "h", label: "HOURS", color: ACCENT },
            { val: pendingCount, label: "PENDING", color: "#1e293b" },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center" as const }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Title */}
      <h2 style={{ color: DARK_GREEN, margin: "0 0 16px", fontSize: 22, fontWeight: 800 }}>Active Board</h2>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { val: activeClocks.length, label: "ON SITE NOW", color: "#1e293b" },
          { val: shiftsToday, label: "SHIFTS TODAY", color: "#1e293b" },
          { val: periodHrs.toFixed(1) + "h", label: "PERIOD HRS", color: ACCENT },
        ].map((s, i) => (
          <div key={i} style={{ ...S.card, textAlign: "center" as const, padding: "18px 12px" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.8, marginTop: 5, textTransform: "uppercase" as const }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Employee grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, marginBottom: 28 }}>
        {EMPLOYEES.map((emp) => {
          const active = activeMap[emp.name];
          return (
            <div key={emp.name} style={{
              background: active ? DARK_GREEN : "#fff",
              borderRadius: 12,
              border: active ? "none" : "1px solid #e5e7eb",
              padding: "14px 14px 12px",
              position: "relative" as const,
              boxShadow: active ? "0 2px 8px rgba(26,54,32,0.2)" : "0 1px 3px rgba(0,0,0,0.04)",
              minHeight: 80,
              display: "flex", flexDirection: "column" as const, justifyContent: "space-between",
            }}>
              <div style={{ position: "absolute" as const, top: 12, right: 12, width: 10, height: 10, borderRadius: "50%", background: active ? ACCENT : "#d1d5db", boxShadow: active ? "0 0 6px " + ACCENT : "none" }} />
              <div>
                <p style={{ color: active ? "#fff" : "#1e293b", margin: "0 0 2px", fontWeight: 700, fontSize: 13, paddingRight: 16 }}>{emp.name}</p>
                <p style={{ color: active ? "#86efac" : "#94a3b8", margin: 0, fontSize: 11, fontWeight: 600 }}>
                  {active ? "SINCE " + formatTime(active.clockIn) : "NOT CLOCKED IN"}
                </p>
              </div>
              {active && <p style={{ color: "#86efac", margin: "8px 0 0", fontSize: 11 }}>📍 {active.site}</p>}
            </div>
          );
        })}
      </div>

      {/* Recent Cards */}
      {recentCards.length > 0 && (
        <>
          <h3 style={{ color: "#1e293b", margin: "0 0 12px", fontSize: 18, fontWeight: 700 }}>Recent Cards</h3>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {recentCards.map((h: any, i: number) => {
              const sc = ({ pending: "#16a34a", approved: "#16a34a", rejected: "#dc2626", edited: "#7c3aed" } as any)[h.status] || "#94a3b8";
              return (
                <div key={i} style={{ ...S.card, padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: "#1e293b", margin: "0 0 3px", fontWeight: 700, fontSize: 15 }}>{h.employee}</p>
                      <p style={{ color: "#64748b", margin: "0 0 8px", fontSize: 12 }}>{formatDate(h.clockIn)} · {formatTime(h.clockIn)}–{formatTime(h.clockOut)}</p>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
                        <span style={{ fontSize: 12, color: "#64748b" }}>🕐 30min</span>
                        <span style={{ fontSize: 12, color: "#64748b" }}>📍 {h.site}</span>
                        <span style={{ fontSize: 12, color: "#64748b" }}>👤 {h.manager}</span>
                        {h.status === "pending" && <span style={{ fontSize: 12 }}>⚠️</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                      <p style={{ color: "#1e293b", margin: "0 0 6px", fontWeight: 800, fontSize: 18 }}>{h.hours}h</p>
                      <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, background: sc + "18", color: sc, fontSize: 11, fontWeight: 700 }}>
                        {h.status.charAt(0).toUpperCase() + h.status.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function PayPeriod({ history, sites, onApprove, onReject, onEditEntry, onCreateEntry, managerAuth, setManagerAuth }: any) {
  const [selPeriod, setSelPeriod] = useState("current");
  const [editing, setEditing] = useState<any>(null);
  const [editErr, setEditErr] = useState("");
  const [creating, setCreating] = useState<any>(null);
  const [overrideMgr, setOverrideMgr] = useState<Record<string, string>>({});

  if (!managerAuth) return <PinEntry title="Pay Period History" subtitle="Manager access required" type="manager" onVerify={() => setManagerAuth(true)} employees={[]} />;

  const currentPP = getCurrentPayPeriod();
  const filtered = selPeriod === "all" ? history : history.filter((h: any) => { const d = new Date(h.clockIn); return d >= currentPP.start && d <= currentPP.end; });

  const getManager = (h: any) => overrideMgr[h.id] ?? h.manager;
  const doApprove = async (h: any) => {
    const mgr = getManager(h);
    if (mgr !== h.manager) await onEditEntry(h.id, { manager: mgr });
    await onApprove(h.id);
  };

  const exportExcel = async () => {
    const HEADER_BLUE = "FF5B9BD5";
    const DARK = "FF3A506B";
    const SUBTOTAL_BG = "FFE5E7EB";
    const ALT_BG = "FFF9FAFB";
    const APPROVED_GREEN = "FF15803D";
    const PENDING_AMBER = "FFB45309";
    const REJECTED_RED = "FFB91C1C";
    const BORDER = "FFE5E7EB";

    const grouped: Record<string, any[]> = {};
    filtered.forEach((h: any) => { (grouped[h.employee] ||= []).push(h); });
    const employees = Object.keys(grouped).sort();

    const wb = new ExcelJS.Workbook();
    wb.creator = "Dean Ryans SmartClock";
    wb.created = new Date();

    // ===== Summary sheet =====
    const summary = wb.addWorksheet("Summary");
    summary.columns = [
      { header: "Employee", key: "employee", width: 30 },
      { header: "Shifts", key: "shifts", width: 10 },
      { header: "Total Hours", key: "total", width: 14 },
      { header: "Approved", key: "approved", width: 12 },
      { header: "Pending", key: "pending", width: 12 },
      { header: "Rejected", key: "rejected", width: 12 },
    ];

    // Title row
    summary.spliceRows(1, 0, [
      "Dean Ryans Pay Period — " + (selPeriod === "all" ? "All Time" : currentPP.label),
    ]);
    summary.mergeCells("A1:F1");
    const title = summary.getCell("A1");
    title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
    title.alignment = { horizontal: "center", vertical: "middle" };
    summary.getRow(1).height = 30;

    // Style header row (row 2 after splice)
    const summaryHeader = summary.getRow(2);
    summaryHeader.values = ["Employee", "Shifts", "Total Hours", "Approved", "Pending", "Rejected"];
    summaryHeader.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BLUE } };
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    summaryHeader.height = 24;

    let gApproved = 0, gPending = 0, gRejected = 0, gTotal = 0, gShifts = 0;
    employees.forEach((emp, idx) => {
      const entries = grouped[emp];
      const approved = entries.filter((e) => e.status === "approved").reduce((s, e) => s + (Number(e.hours) || 0), 0);
      const pending = entries.filter((e) => e.status === "pending" || e.status === "edited").reduce((s, e) => s + (Number(e.hours) || 0), 0);
      const rejected = entries.filter((e) => e.status === "rejected").reduce((s, e) => s + (Number(e.hours) || 0), 0);
      const total = approved + pending;

      const row = summary.addRow({ employee: emp, shifts: entries.length, total, approved, pending, rejected });
      if (idx % 2 === 1) row.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_BG } }; });
      row.getCell("total").font = { bold: true, color: { argb: APPROVED_GREEN } };
      row.getCell("approved").font = { color: { argb: APPROVED_GREEN } };
      row.getCell("pending").font = { color: { argb: PENDING_AMBER } };
      row.getCell("rejected").font = { color: { argb: REJECTED_RED } };
      row.alignment = { horizontal: "center" };
      row.getCell("employee").alignment = { horizontal: "left" };
      [row.getCell("total"), row.getCell("approved"), row.getCell("pending"), row.getCell("rejected")].forEach((c) => { c.numFmt = "0.00"; });

      gApproved += approved; gPending += pending; gRejected += rejected; gTotal += total; gShifts += entries.length;
    });

    const totalRow = summary.addRow({ employee: "TOTAL", shifts: gShifts, total: gTotal, approved: gApproved, pending: gPending, rejected: gRejected });
    totalRow.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
      c.alignment = { horizontal: "center" };
    });
    totalRow.getCell("employee").alignment = { horizontal: "left" };
    [totalRow.getCell("total"), totalRow.getCell("approved"), totalRow.getCell("pending"), totalRow.getCell("rejected")].forEach((c) => { c.numFmt = "0.00"; });
    totalRow.height = 26;

    summary.eachRow((row) => {
      row.eachCell((c) => {
        c.border = {
          top: { style: "thin", color: { argb: BORDER } },
          left: { style: "thin", color: { argb: BORDER } },
          bottom: { style: "thin", color: { argb: BORDER } },
          right: { style: "thin", color: { argb: BORDER } },
        };
      });
    });

    // ===== Detail sheet =====
    const detail = wb.addWorksheet("Detail");
    detail.columns = [
      { header: "Employee", key: "employee", width: 25 },
      { header: "Date", key: "date", width: 14 },
      { header: "Day", key: "day", width: 10 },
      { header: "Site", key: "site", width: 18 },
      { header: "Manager", key: "manager", width: 18 },
      { header: "Clock In", key: "clockIn", width: 12 },
      { header: "Clock Out", key: "clockOut", width: 12 },
      { header: "Hours", key: "hours", width: 10 },
      { header: "Status", key: "status", width: 12 },
      { header: "Notes", key: "notes", width: 30 },
    ];

    const detailHeader = detail.getRow(1);
    detailHeader.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BLUE } };
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    detailHeader.height = 24;

    let detailGrand = 0;
    employees.forEach((emp) => {
      const entries = grouped[emp].slice().sort((a, b) => new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime());
      let empTotal = 0;
      entries.forEach((h, i) => {
        const row = detail.addRow({
          employee: h.employee,
          date: formatDate(h.clockIn),
          day: new Date(h.clockIn).toLocaleDateString("en-US", { weekday: "short" }),
          site: h.site,
          manager: h.manager,
          clockIn: formatTime(h.clockIn),
          clockOut: h.clockOut ? formatTime(h.clockOut) : "",
          hours: Number(h.hours) || 0,
          status: (h.status || "").charAt(0).toUpperCase() + (h.status || "").slice(1),
          notes: h.notes || "",
        });
        if (i % 2 === 1) row.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_BG } }; });
        row.getCell("hours").numFmt = "0.00";
        const sc = h.status === "approved" ? APPROVED_GREEN : h.status === "rejected" ? REJECTED_RED : h.status === "edited" ? "FF7C3AED" : PENDING_AMBER;
        row.getCell("status").font = { bold: true, color: { argb: sc } };
        if (h.status !== "rejected") empTotal += Number(h.hours) || 0;
      });

      const subtotal = detail.addRow({
        employee: "", date: "", day: "", site: "", manager: "", clockIn: "",
        clockOut: emp + " Subtotal",
        hours: empTotal,
        status: "", notes: "",
      });
      subtotal.eachCell((c) => {
        c.font = { bold: true, color: { argb: DARK } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_BG } };
      });
      subtotal.getCell("clockOut").alignment = { horizontal: "right" };
      subtotal.getCell("hours").numFmt = "0.00";
      detailGrand += empTotal;

      detail.addRow({}); // spacer
    });

    const detailTotal = detail.addRow({
      clockOut: "GRAND TOTAL",
      hours: detailGrand,
    });
    detailTotal.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
    });
    detailTotal.getCell("clockOut").alignment = { horizontal: "right" };
    detailTotal.getCell("hours").numFmt = "0.00";
    detailTotal.height = 26;

    detail.eachRow((row) => {
      row.eachCell((c) => {
        c.border = {
          top: { style: "thin", color: { argb: BORDER } },
          left: { style: "thin", color: { argb: BORDER } },
          bottom: { style: "thin", color: { argb: BORDER } },
          right: { style: "thin", color: { argb: BORDER } },
        };
      });
    });

    const filename = "payperiod_" + (selPeriod === "all" ? "all" : currentPP.label.replace(/[^\w]+/g, "_")) + ".xlsx";
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const openEdit = (h: any) => {
    const ci = new Date(h.clockIn);
    const co = new Date(h.clockOut);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditErr("");
    setEditing({
      id: h.id,
      date: ci.getFullYear() + '-' + pad(ci.getMonth() + 1) + '-' + pad(ci.getDate()),
      ci: pad(ci.getHours()) + ':' + pad(ci.getMinutes()),
      co: pad(co.getHours()) + ':' + pad(co.getMinutes()),
      siteId: h.siteId,
      siteName: h.site,
      manager: h.manager,
      // Show only the manager's reason in the box; the auto change-summary is regenerated on save.
      notes: (h.notes || '').split(EDIT_SUMMARY_MARK)[0],
      employee: h.employee,
      // Originals captured so we can describe exactly what changed.
      origClockIn: h.clockIn,
      origClockOut: h.clockOut,
      origHours: h.hours,
      origSite: h.site,
      origManager: h.manager,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const reason = (editing.notes || '').trim();
    if (!reason) { setEditErr("Please enter a reason for this edit so the employee knows why."); return; }

    const newCi = new Date(editing.date + 'T' + editing.ci + ':00').toISOString();
    const newCo = new Date(editing.date + 'T' + editing.co + ':00').toISOString();
    const newHours = calcHours(newCi, newCo);
    const site = sites.find((s: any) => s.id === Number(editing.siteId));
    const newSiteName = site ? site.name : editing.siteName;

    // Describe exactly what changed vs. the values before the edit.
    const changes: string[] = [];
    if (Number(editing.origHours) !== newHours) changes.push(`${Number(editing.origHours).toFixed(2)}h → ${newHours.toFixed(2)}h`);
    if (editing.origClockIn !== newCi) changes.push(`in ${formatTime(editing.origClockIn)} → ${formatTime(newCi)}`);
    if (editing.origClockOut !== newCo) changes.push(`out ${formatTime(editing.origClockOut)} → ${formatTime(newCo)}`);
    if (editing.origSite !== newSiteName) changes.push(`site ${editing.origSite} → ${newSiteName}`);
    if (editing.origManager !== editing.manager) changes.push(`mgr ${editing.origManager} → ${editing.manager}`);

    const summary = changes.length ? `Edited by ${editing.manager} on ${formatDate(newCi)}: ${changes.join(', ')}` : '';
    const composedNotes = summary ? `${reason}${EDIT_SUMMARY_MARK}${summary}` : reason;

    await onEditEntry(editing.id, {
      clockIn: newCi,
      clockOut: newCo,
      hours: newHours,
      site: newSiteName,
      siteId: Number(editing.siteId),
      manager: editing.manager,
      notes: composedNotes,
    });
    setEditing(null);
    setEditErr("");
  };

  const openCreate = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setCreating({
      employee: '',
      date: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()),
      ci: '08:00',
      co: '16:00',
      siteId: '',
      manager: '',
      notes: '',
    });
  };

  const saveCreate = async () => {
    if (!creating) return;
    if (!creating.employee || !creating.siteId || !creating.manager) return;
    const newCi = new Date(creating.date + 'T' + creating.ci + ':00').toISOString();
    const newCo = new Date(creating.date + 'T' + creating.co + ':00').toISOString();
    if (new Date(newCo).getTime() <= new Date(newCi).getTime()) return;
    const hours = calcHours(newCi, newCo);
    const site = sites.find((s: any) => s.id === Number(creating.siteId));
    await onCreateEntry({
      employee: creating.employee,
      clockIn: newCi,
      clockOut: newCo,
      hours,
      site: site ? site.name : '',
      siteId: Number(creating.siteId),
      manager: creating.manager,
      notes: creating.notes,
    });
    setCreating(null);
  };

  const liveCreateHours = creating ? (() => {
    try {
      const ci = new Date(creating.date + 'T' + creating.ci + ':00');
      const co = new Date(creating.date + 'T' + creating.co + ':00');
      return calcHours(ci.toISOString(), co.toISOString());
    } catch { return 0; }
  })() : 0;

  const liveHours = editing ? (() => {
    try {
      const ci = new Date(editing.date + 'T' + editing.ci + ':00');
      const co = new Date(editing.date + 'T' + editing.co + ':00');
      return calcHours(ci.toISOString(), co.toISOString());
    } catch { return 0; }
  })() : 0;

  const totalHrs = filtered.filter((h: any) => h.status !== "rejected").reduce((s: number, h: any) => s + h.hours, 0);
  const statusColor: any = { pending: "#f59e0b", approved: "#16a34a", rejected: "#dc2626", edited: "#7c3aed" };

  const siteOptions = (currentSiteId: number, currentSiteName: string) => {
    const opts = sites.filter((s: any) => s.active || s.id === currentSiteId).map((s: any) => ({ value: s.id, label: s.name }));
    if (currentSiteId && !opts.find((o: any) => o.value === currentSiteId)) {
      opts.unshift({ value: currentSiteId, label: currentSiteName });
    }
    return opts;
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap" as const, gap: 12 }}>
        <div>
          <h2 style={{ color: "#1e293b", margin: 0, fontSize: 24, fontWeight: 800 }}>Pay Period History</h2>
          <p style={{ color: "#94a3b8", margin: "4px 0 0", fontSize: 14 }}>Current: <strong style={{ color: "#475569" }}>{currentPP.label}</strong></p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          <select value={selPeriod} onChange={(e) => setSelPeriod(e.target.value)} style={{ ...S.input, width: "auto", padding: "8px 12px", fontSize: 13 }}>
            <option value="current">{currentPP.label}</option>
            <option value="all">All Time</option>
          </select>
          <Btn onClick={openCreate} style={{ padding: "8px 16px", fontSize: 13 }}>+ Create Time Card</Btn>
          <Btn variant="outline" onClick={exportExcel} disabled={filtered.length === 0} style={{ padding: "8px 16px", fontSize: 13 }}>Export Excel</Btn>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Entries", value: filtered.length, color: "#475569" },
          { label: "Total Hours", value: totalHrs.toFixed(1) + "h", color: "#1e293b" },
          { label: "Pending", value: filtered.filter((h: any) => h.status === "pending").length, color: "#f59e0b" },
          { label: "Approved", value: filtered.filter((h: any) => h.status === "approved").length, color: "#16a34a" },
        ].map((c, i) => (
          <div key={i} style={{ ...S.card, textAlign: "center" as const, padding: 14 }}>
            <p style={{ color: "#94a3b8", margin: 0, fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{c.label}</p>
            <p style={{ color: c.color, margin: "4px 0 0", fontSize: 24, fontWeight: 800 }}>{c.value}</p>
          </div>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center" as const, padding: 60 }}>
          <h3 style={{ color: "#94a3b8", fontWeight: 500 }}>No entries for this period</h3>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
          {filtered.map((h: any, i: number) => {
            const sc = statusColor[h.status] || "#94a3b8";
            const showApprove = h.status !== "approved";
            const showReject = h.status === "pending" || h.status === "edited";
            const fullDate = new Date(h.clockIn).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
            return (
              <div key={h.id || i} style={{ ...S.card, padding: 18 }}>
                {/* Header row: name + hours */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <p style={{ color: "#1e293b", margin: 0, fontWeight: 800, fontSize: 18 }}>{h.employee}</p>
                  <p style={{ color: "#1e293b", margin: 0, fontWeight: 800, fontSize: 20 }}>{h.hours}h</p>
                </div>
                {/* Date + status */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <p style={{ color: "#64748b", margin: 0, fontSize: 13 }}>{fullDate}</p>
                  <Badge color={sc}>{h.status.charAt(0).toUpperCase() + h.status.slice(1)}</Badge>
                </div>
                {/* Detail row */}
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" as const, marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: 13, color: "#475569", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>🕐</span>
                    {formatTime(h.clockIn)} – {formatTime(h.clockOut)}
                  </span>
                  <span style={{ fontSize: 13, color: "#475569", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>🍱</span>
                    30min
                  </span>
                  <span style={{ fontSize: 13, color: "#475569", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>📍</span>
                    {h.site}
                  </span>
                  <span style={{ fontSize: 13, color: "#475569", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>👤</span>
                    {h.manager}
                  </span>
                </div>
                {h.notes && (
                  <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", marginBottom: 14, display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 14 }}>✏️</span>
                    <p style={{ color: "#78350f", margin: 0, fontSize: 13, fontWeight: 500, lineHeight: 1.4, whiteSpace: "pre-wrap" as const }}>
                      <strong>Manager note:</strong> {h.notes}
                    </p>
                  </div>
                )}
                {h.status === "edited" && (
                  <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 600, color: "#7c3aed" }}>
                    This shift was edited — approve or reject to finalize it.
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" as const }}>
                  {showApprove && (
                    <select
                      value={getManager(h)}
                      onChange={(e) => setOverrideMgr((p) => ({ ...p, [h.id]: e.target.value }))}
                      style={{ padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", color: "#1e293b", fontSize: 13, fontWeight: 600, minWidth: 130, cursor: "pointer" }}
                    >
                      {MANAGERS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                  {showApprove && (
                    <button
                      onClick={() => doApprove(h)}
                      style={{ flex: 1, minWidth: 160, padding: "11px 20px", background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    >
                      <span style={{ fontSize: 15 }}>✓</span> Approve
                    </button>
                  )}
                  {showReject && (
                    <button
                      onClick={() => onReject(h.id)}
                      style={{ flex: showApprove ? "0 1 auto" : 1, minWidth: 160, padding: "11px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#dc2626", cursor: "pointer", fontWeight: 700, fontSize: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    >
                      <span style={{ fontSize: 15 }}>✗</span> Reject
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(h)}
                    style={{ flex: !showApprove && !showReject ? 1 : "0 1 auto", minWidth: 120, padding: "11px 16px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 10, color: "#475569", cursor: "pointer", fontWeight: 700, fontSize: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <span style={{ fontSize: 14 }}>✎</span> Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => { setEditing(null); setEditErr(""); }}>
        {editing && (
          <>
            <h3 style={{ color: "#1e293b", margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>Edit Shift</h3>
            <p style={{ color: "#94a3b8", margin: "0 0 20px", fontSize: 13 }}>{editing.employee}</p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ ...S.label, textTransform: "uppercase" as const, letterSpacing: 0.5, fontSize: 11 }}>Date</label>
              <input
                type="date"
                value={editing.date}
                onChange={(e) => setEditing((p: any) => ({ ...p, date: e.target.value }))}
                style={S.input}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ ...S.label, textTransform: "uppercase" as const, letterSpacing: 0.5, fontSize: 11 }}>Clock In</label>
                <input
                  type="time"
                  value={editing.ci}
                  onChange={(e) => setEditing((p: any) => ({ ...p, ci: e.target.value }))}
                  style={S.input}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...S.label, textTransform: "uppercase" as const, letterSpacing: 0.5, fontSize: 11 }}>Clock Out</label>
                <input
                  type="time"
                  value={editing.co}
                  onChange={(e) => setEditing((p: any) => ({ ...p, co: e.target.value }))}
                  style={S.input}
                />
              </div>
            </div>

            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
              <p style={{ margin: 0, color: "#15803d", fontSize: 13, fontWeight: 700 }}>
                {liveHours}h net <span style={{ fontWeight: 500, color: "#16a34a" }}>/ after 30-min lunch deduction</span>
              </p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ ...S.label, textTransform: "uppercase" as const, letterSpacing: 0.5, fontSize: 11 }}>Job Site</label>
              <select
                value={editing.siteId || ""}
                onChange={(e) => setEditing((p: any) => ({ ...p, siteId: Number(e.target.value) }))}
                style={{ ...S.input, appearance: "none" as const }}
              >
                {siteOptions(editing.siteId, editing.siteName).map((o: any) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ ...S.label, textTransform: "uppercase" as const, letterSpacing: 0.5, fontSize: 11 }}>Manager</label>
              <select
                value={editing.manager || ""}
                onChange={(e) => setEditing((p: any) => ({ ...p, manager: e.target.value }))}
                style={{ ...S.input, appearance: "none" as const }}
              >
                {MANAGERS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ ...S.label, textTransform: "uppercase" as const, letterSpacing: 0.5, fontSize: 11 }}>Reason for Edit <span style={{ color: "#dc2626" }}>*</span></label>
              <textarea
                value={editing.notes}
                onChange={(e) => { setEditing((p: any) => ({ ...p, notes: e.target.value })); if (editErr) setEditErr(""); }}
                placeholder="Why are you editing this shift? The employee will see this."
                rows={3}
                style={{ ...S.input, resize: "vertical" as const, fontFamily: "inherit", borderColor: editErr ? "#fca5a5" : (S.input.border as string) }}
              />
              {editErr && <p style={{ color: "#dc2626", fontSize: 12, margin: "6px 0 0", fontWeight: 500 }}>{editErr}</p>}
            </div>

            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", marginBottom: 18 }}>
              <p style={{ margin: 0, color: "#b45309", fontSize: 12, fontWeight: 600 }}>
                ✏️ Saving marks this shift <strong>Edited</strong> — approve or reject it afterward to finalize. The reason and what changed are shown to the employee.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="success" onClick={saveEdit} style={{ flex: 1 }}>Save Changes</Btn>
              <Btn variant="ghost" onClick={() => setEditing(null)} style={{ flex: 1 }}>Cancel</Btn>
            </div>
          </>
        )}
      </Modal>

      {/* Create Time Card Modal */}
      <Modal open={!!creating} onClose={() => setCreating(null)}>
        {creating && (
          <>
            <h3 style={{ color: "#1e293b", margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>Create Time Card</h3>
            <p style={{ color: "#94a3b8", margin: "0 0 20px", fontSize: 13 }}>Manually add a shift for an employee — no location check required.</p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ ...S.label, textTransform: "uppercase" as const, letterSpacing: 0.5, fontSize: 11 }}>Employee</label>
              <select
                value={creating.employee}
                onChange={(e) => setCreating((p: any) => ({ ...p, employee: e.target.value }))}
                style={{ ...S.input, appearance: "none" as const }}
              >
                <option value="">Select employee...</option>
                {EMPLOYEES.map((emp) => <option key={emp.name} value={emp.name}>{emp.name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ ...S.label, textTransform: "uppercase" as const, letterSpacing: 0.5, fontSize: 11 }}>Date</label>
              <input
                type="date"
                value={creating.date}
                onChange={(e) => setCreating((p: any) => ({ ...p, date: e.target.value }))}
                style={S.input}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ ...S.label, textTransform: "uppercase" as const, letterSpacing: 0.5, fontSize: 11 }}>Clock In</label>
                <input
                  type="time"
                  value={creating.ci}
                  onChange={(e) => setCreating((p: any) => ({ ...p, ci: e.target.value }))}
                  style={S.input}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ ...S.label, textTransform: "uppercase" as const, letterSpacing: 0.5, fontSize: 11 }}>Clock Out</label>
                <input
                  type="time"
                  value={creating.co}
                  onChange={(e) => setCreating((p: any) => ({ ...p, co: e.target.value }))}
                  style={S.input}
                />
              </div>
            </div>

            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
              <p style={{ margin: 0, color: "#15803d", fontSize: 13, fontWeight: 700 }}>
                {liveCreateHours}h net <span style={{ fontWeight: 500, color: "#16a34a" }}>/ after 30-min lunch deduction</span>
              </p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ ...S.label, textTransform: "uppercase" as const, letterSpacing: 0.5, fontSize: 11 }}>Job Site</label>
              <select
                value={creating.siteId || ""}
                onChange={(e) => setCreating((p: any) => ({ ...p, siteId: Number(e.target.value) }))}
                style={{ ...S.input, appearance: "none" as const }}
              >
                <option value="">Select site...</option>
                {sites.filter((s: any) => s.active).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ ...S.label, textTransform: "uppercase" as const, letterSpacing: 0.5, fontSize: 11 }}>Manager</label>
              <select
                value={creating.manager || ""}
                onChange={(e) => setCreating((p: any) => ({ ...p, manager: e.target.value }))}
                style={{ ...S.input, appearance: "none" as const }}
              >
                <option value="">Select manager...</option>
                {MANAGERS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ ...S.label, textTransform: "uppercase" as const, letterSpacing: 0.5, fontSize: 11 }}>Notes</label>
              <textarea
                value={creating.notes}
                onChange={(e) => setCreating((p: any) => ({ ...p, notes: e.target.value }))}
                placeholder="e.g. Forgot to clock in (optional)..."
                rows={3}
                style={{ ...S.input, resize: "vertical" as const, fontFamily: "inherit" }}
              />
            </div>

            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", marginBottom: 18 }}>
              <p style={{ margin: 0, color: "#b45309", fontSize: 12, fontWeight: 600 }}>
                ✏️ This card will be added as Pending for your review.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <Btn
                variant="success"
                onClick={saveCreate}
                disabled={!creating.employee || !creating.siteId || !creating.manager || liveCreateHours <= 0}
                style={{ flex: 1 }}
              >
                Create Card
              </Btn>
              <Btn variant="ghost" onClick={() => setCreating(null)} style={{ flex: 1 }}>Cancel</Btn>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function JobSites({ sites, onAddSite, onToggleSite, onRemoveSite, managerAuth, setManagerAuth }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [nf, setNf] = useState({ name: "", address: "", lat: "", lng: "" });

  if (!managerAuth) return <PinEntry title="Job Sites" subtitle="Manager access required" type="manager" onVerify={() => setManagerAuth(true)} employees={[]} />;

  const addSite = () => {
    if (!nf.name || !nf.address || !nf.lat || !nf.lng) return;
    onAddSite({ name: nf.name, address: nf.address, lat: parseFloat(nf.lat), lng: parseFloat(nf.lng), active: true });
    setNf({ name: "", address: "", lat: "", lng: "" }); setShowAdd(false);
  };
  const toggle = (id: number) => onToggleSite(id);
  const remove = (id: number) => onRemoveSite(id);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ color: "#1e293b", margin: 0, fontSize: 24, fontWeight: 800 }}>Job Sites</h2>
          <p style={{ color: "#94a3b8", margin: "4px 0 0", fontSize: 14 }}>{sites.filter((s: any) => s.active).length} active / {sites.length} total</p>
        </div>
        <Btn onClick={() => setShowAdd(true)}>+ Add Site</Btn>
      </div>
      <Modal open={showAdd} onClose={() => setShowAdd(false)}>
        <h3 style={{ color: "#1e293b", marginTop: 0, fontSize: 20, fontWeight: 700 }}>Add New Job Site</h3>
        <Input label="Site Name" value={nf.name} onChange={(e: any) => setNf((p: any) => ({ ...p, name: e.target.value }))} placeholder="e.g. Riverside" />
        <Input label="Address" value={nf.address} onChange={(e: any) => setNf((p: any) => ({ ...p, address: e.target.value }))} placeholder="e.g. 123 Main St, Ottawa, ON" />
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><Input label="Latitude" type="number" step="any" value={nf.lat} onChange={(e: any) => setNf((p: any) => ({ ...p, lat: e.target.value }))} placeholder="45.3500" /></div>
          <div style={{ flex: 1 }}><Input label="Longitude" type="number" step="any" value={nf.lng} onChange={(e: any) => setNf((p: any) => ({ ...p, lng: e.target.value }))} placeholder="-75.7000" /></div>
        </div>
        <Btn onClick={addSite} style={{ width: "100%" }}>Add Job Site</Btn>
      </Modal>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 10 }}>
        {sites.map((s: any) => (
          <div key={s.id} style={{ ...S.card, opacity: s.active ? 1 : 0.55, transition: "all 0.2s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: s.active ? "#fef2f2" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>P</div>
                <div>
                  <p style={{ color: "#1e293b", margin: 0, fontWeight: 700 }}>{s.name}</p>
                  <p style={{ color: "#64748b", margin: "2px 0", fontSize: 13 }}>{s.address}</p>
                  <p style={{ color: "#94a3b8", margin: 0, fontSize: 11, fontFamily: "monospace" }}>{s.lat}, {s.lng}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => toggle(s.id)} style={{ background: s.active ? "#fffbeb" : "#f0fdf4", border: "1px solid " + (s.active ? "#fde68a" : "#bbf7d0"), borderRadius: 8, padding: "6px 12px", color: s.active ? "#b45309" : "#15803d", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{s.active ? "Pause" : "Resume"}</button>
                <button onClick={() => remove(s.id)} style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "6px 12px", color: "#dc2626", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Remove</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EODChecklist({ checklists, onSubmitChecklist }: any) {
  const [emp, setEmp] = useState<any>(null);
  const [vehicle, setVehicle] = useState("");
  const [items, setItems] = useState<Record<string, boolean>>({});
  const [gas, setGas] = useState("");
  const [broken, setBroken] = useState("");
  const [brokenPhotos, setBrokenPhotos] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [photoStatus, setPhotoStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).map((f: File) => ({ name: f.name, url: URL.createObjectURL(f), file: f }));
    setBrokenPhotos((p) => [...p, ...arr]);
  };
  const removePhoto = (i: number) => setBrokenPhotos((p) => {
    const removed = p[i];
    if (removed?.url) URL.revokeObjectURL(removed.url);
    return p.filter((_, j) => j !== i);
  });

  // Export is gated behind the manager PIN, independent of the employee sign-in.
  const [exportOpen, setExportOpen] = useState(false);
  const [exportAuthed, setExportAuthed] = useState(false);
  const [mgrPin, setMgrPin] = useState("");
  const [mgrErr, setMgrErr] = useState("");
  const [periodIdx, setPeriodIdx] = useState(0);
  const periods = getRecentPayPeriods(12);

  const toggle = (key: string) => setItems((p) => ({ ...p, [key]: !p[key] }));
  const resetForm = () => {
    brokenPhotos.forEach((p) => p?.url && URL.revokeObjectURL(p.url));
    setVehicle(""); setItems({}); setGas(""); setBroken(""); setBrokenPhotos([]); setDone(false); setErr(""); setPhotoStatus(null);
  };

  const submit = async () => {
    if (!vehicle) { setErr("Please select a vehicle."); return; }
    if (!gas) { setErr("Please record how much gas is in the truck."); return; }
    setSubmitting(true);
    setPhotoStatus(null);
    const res = await onSubmitChecklist({
      employee_name: emp.name,
      vehicle,
      no_trash: !!items.no_trash,
      interior_wipe: !!items.interior_wipe,
      bed_blown: !!items.bed_blown,
      gas_level: gas,
      clean_mower: !!items.clean_mower,
      clean_weedwacker: !!items.clean_weedwacker,
      clean_blower: !!items.clean_blower,
      broken_notes: broken.trim() || null,
    });
    if (res?.error) { setSubmitting(false); setErr("Couldn't save — ask your manager to finish setup. (" + res.error + ")"); return; }

    // Checklist saved. Now upload any broken/damaged photos to Drive — failures don't block the saved checklist.
    if (brokenPhotos.length > 0) {
      try {
        const compressed = await Promise.all(brokenPhotos.map(async (p) => ({ ...p, file: await compressImage(p.file) })));
        const today = formatDateFile(new Date());
        const safe = (s: string) => s.replace(/\//g, '-');
        const filenameBase = safe(vehicle) + '_' + safe(emp.name) + '_' + today;
        const result = await uploadToGoogleDrive(compressed, vehicle, emp.name, {
          folderName: 'Broken/Damaged Equipment',
          filenameBase,
        });
        if (result.error) setPhotoStatus({ type: 'err', text: result.error });
        else setPhotoStatus({ type: 'ok', text: result.count + ' photo(s) uploaded to Broken/Damaged Equipment' });
      } catch (e: any) {
        setPhotoStatus({ type: 'err', text: e?.message || 'Photo upload failed' });
      }
    }
    setSubmitting(false);
    setDone(true);
  };

  const onMgrPin = (v: string) => {
    setMgrErr("");
    setMgrPin(v);
    if (v.length === 4) {
      if (v === MANAGER_PIN) { setExportAuthed(true); setMgrPin(""); }
      else { setMgrErr("Incorrect manager PIN"); setMgrPin(""); }
    }
  };

  const closeExport = () => { setExportOpen(false); setExportAuthed(false); setMgrPin(""); setMgrErr(""); };

  const exportRows = () => {
    const sel = periodIdx === -1 ? null : periods[periodIdx];
    return (checklists || [])
      .filter((c: any) => { if (!sel) return true; const d = new Date(c.created_at); return d >= sel.start && d <= sel.end; })
      .slice()
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  };

  const exportExcel = async () => {
    const rows = exportRows();
    const HEADER_BLUE = "FF5B9BD5";
    const DARK = "FF3A506B";
    const ALT_BG = "FFF9FAFB";
    const YES_GREEN = "FF15803D";
    const NO_RED = "FFB91C1C";
    const BORDER = "FFE5E7EB";
    const yn = (b: any) => (b ? "Yes" : "No");

    const wb = new ExcelJS.Workbook();
    wb.creator = "Dean Ryans SmartClock";
    wb.created = new Date();
    const ws = wb.addWorksheet("EOD Checklist");
    ws.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Time", key: "time", width: 10 },
      { header: "Employee", key: "employee", width: 22 },
      { header: "Vehicle", key: "vehicle", width: 28 },
      { header: "No Trash", key: "no_trash", width: 10 },
      { header: "Interior Wiped", key: "interior_wipe", width: 14 },
      { header: "Bed Blown", key: "bed_blown", width: 11 },
      { header: "Gas Level", key: "gas_level", width: 11 },
      { header: "Clean Mower", key: "clean_mower", width: 12 },
      { header: "Clean Weedwacker", key: "clean_weedwacker", width: 16 },
      { header: "Clean Blower", key: "clean_blower", width: 12 },
      { header: "Broken / Damaged Notes", key: "broken_notes", width: 34 },
    ];

    const periodLabel = periodIdx === -1 ? "All Time" : periods[periodIdx].label;
    ws.spliceRows(1, 0, ["Dean Ryans — End of Day Checklist — " + periodLabel]);
    ws.mergeCells("A1:L1");
    const title = ws.getCell("A1");
    title.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
    title.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 28;

    const header = ws.getRow(2);
    header.values = ["Date", "Time", "Employee", "Vehicle", "No Trash", "Interior Wiped", "Bed Blown", "Gas Level", "Clean Mower", "Clean Weedwacker", "Clean Blower", "Broken / Damaged Notes"];
    header.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BLUE } };
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    header.height = 22;

    const boolKeys = ["no_trash", "interior_wipe", "bed_blown", "clean_mower", "clean_weedwacker", "clean_blower"];
    rows.forEach((c: any, idx: number) => {
      const row = ws.addRow({
        date: formatDate(c.created_at),
        time: formatTime(c.created_at),
        employee: c.employee_name,
        vehicle: c.vehicle,
        no_trash: yn(c.no_trash),
        interior_wipe: yn(c.interior_wipe),
        bed_blown: yn(c.bed_blown),
        gas_level: c.gas_level || "",
        clean_mower: yn(c.clean_mower),
        clean_weedwacker: yn(c.clean_weedwacker),
        clean_blower: yn(c.clean_blower),
        broken_notes: c.broken_notes || "",
      });
      if (idx % 2 === 1) row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_BG } }; });
      boolKeys.forEach((k) => {
        const cell = row.getCell(k);
        cell.alignment = { horizontal: "center" };
        cell.font = { bold: true, color: { argb: cell.value === "Yes" ? YES_GREEN : NO_RED } };
      });
      row.getCell("gas_level").alignment = { horizontal: "center" };
    });

    ws.eachRow((row) => {
      row.eachCell((c) => {
        c.border = {
          top: { style: "thin", color: { argb: BORDER } },
          left: { style: "thin", color: { argb: BORDER } },
          bottom: { style: "thin", color: { argb: BORDER } },
          right: { style: "thin", color: { argb: BORDER } },
        };
      });
    });

    const filename = "eod_checklist_" + periodLabel.replace(/[^\w]+/g, "_") + ".xlsx";
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const checkRow = (it: { key: string; label: string }) => {
    const on = !!items[it.key];
    return (
      <button key={it.key} type="button" onClick={() => toggle(it.key)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 8, borderRadius: 10, cursor: "pointer", textAlign: "left" as const,
          background: on ? "#f0fdf4" : "#f8fafc", border: "1px solid " + (on ? "#bbf7d0" : "#e2e8f0") }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800,
          background: on ? "#16a34a" : "#fff", border: "2px solid " + (on ? "#16a34a" : "#cbd5e1"), color: "#fff" }}>{on ? "✓" : ""}</span>
        <span style={{ fontSize: 14, color: "#1e293b", fontWeight: 500 }}>{it.label}</span>
      </button>
    );
  };

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
      <div>
        <h2 style={{ color: "#1e293b", margin: 0, fontSize: 24, fontWeight: 800 }}>End of Day Checklist</h2>
        <p style={{ color: "#94a3b8", margin: "4px 0 0", fontSize: 14 }}>Sign in and confirm each vehicle is cleaned and inspected.</p>
      </div>
      <Btn variant="outline" onClick={() => setExportOpen(true)} style={{ padding: "8px 16px", fontSize: 13, flexShrink: 0 }}>Export to Excel</Btn>
    </div>
  );

  const exportModal = (
    <Modal open={exportOpen} onClose={closeExport}>
      {!exportAuthed ? (
        <div style={{ textAlign: "center" as const }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg, #f59e0b, #d97706)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 22 }}>🔒</div>
          <h3 style={{ color: "#1e293b", margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>Manager Export</h3>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 18 }}>Enter manager PIN to download checklist history</p>
          <PinPad value={mgrPin} onChange={onMgrPin} />
          {mgrErr && <p style={{ color: "#dc2626", fontSize: 13, margin: "12px 0 0", fontWeight: 500 }}>{mgrErr}</p>}
        </div>
      ) : (
        <>
          <h3 style={{ color: "#1e293b", margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>Export Checklist History</h3>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 18 }}>Choose a pay period to download.</p>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Pay Period</label>
            <select value={periodIdx} onChange={(e) => setPeriodIdx(Number(e.target.value))} style={{ ...S.input, appearance: "none" as const }}>
              {periods.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
              <option value={-1}>All Time</option>
            </select>
          </div>
          <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 16px" }}>{exportRows().length} checklist(s) in this period.</p>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="success" onClick={exportExcel} disabled={exportRows().length === 0} style={{ flex: 1 }}>Download Excel</Btn>
            <Btn variant="ghost" onClick={closeExport} style={{ flex: 1 }}>Close</Btn>
          </div>
        </>
      )}
    </Modal>
  );

  if (!emp) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
        {header}
        <PinEntry title="End of Day Checklist" subtitle="Verify your identity to complete the checklist" onVerify={setEmp} employees={EMPLOYEES} />
        {exportModal}
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
        {header}
        <div style={{ ...S.card, textAlign: "center" as const, padding: 36 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #16a34a, #15803d)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 26, color: "#fff" }}>✓</div>
          <h3 style={{ color: "#1e293b", margin: "0 0 6px", fontSize: 20 }}>Checklist submitted</h3>
          <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 14px" }}>{emp.name} · {vehicle}</p>
          {photoStatus && (
            <div style={{ background: photoStatus.type === 'ok' ? '#f0fdf4' : '#fef2f2', border: '1px solid ' + (photoStatus.type === 'ok' ? '#bbf7d0' : '#fecaca'), borderRadius: 10, padding: '10px 14px', margin: '0 auto 18px', display: 'inline-block', maxWidth: 480 }}>
              <p style={{ margin: 0, color: photoStatus.type === 'ok' ? '#15803d' : '#dc2626', fontSize: 13, fontWeight: 600 }}>
                {photoStatus.type === 'ok' ? '✓ ' : '⚠ '}{photoStatus.text}
              </p>
            </div>
          )}
          {!photoStatus && <div style={{ height: 8 }} />}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" as const }}>
            <Btn variant="success" onClick={resetForm}>Submit Another Vehicle</Btn>
            <Btn variant="ghost" onClick={() => { resetForm(); setEmp(null); }}>Done</Btn>
          </div>
        </div>
        {exportModal}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
      {header}
      <div style={{ ...S.card, marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #dc2626, #b91c1c)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>{emp.name[0]}</div>
        <div style={{ flex: 1 }}><p style={{ color: "#1e293b", margin: 0, fontWeight: 600 }}>{emp.name}</p><p style={{ color: "#94a3b8", margin: 0, fontSize: 12 }}>Completing end of day checklist</p></div>
        <button onClick={() => { resetForm(); setEmp(null); }} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", color: "#475569", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Switch user</button>
      </div>

      <div style={{ ...S.card, marginBottom: 12 }}>
        <Select label="Vehicle" placeholder="Select vehicle" value={vehicle} onChange={(e: any) => setVehicle(e.target.value)}
          options={VEHICLES.map((v) => ({ value: v, label: v }))} />
      </div>

      <div style={{ ...S.card, marginBottom: 12 }}>
        <h3 style={{ color: "#1e293b", margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>🚚 Truck Inspection</h3>
        <Select label="Check if truck needs gas — how much is in the truck?" placeholder="Select gas level" value={gas} onChange={(e: any) => setGas(e.target.value)}
          options={GAS_LEVELS.map((g) => ({ value: g, label: g }))} />
        {EOD_TRUCK_ITEMS.map(checkRow)}
      </div>

      <div style={{ ...S.card, marginBottom: 12 }}>
        <h3 style={{ color: "#1e293b", margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>🛠️ Equipment Inspection</h3>
        {EOD_EQUIP_ITEMS.map(checkRow)}
        <div style={{ marginTop: 6 }}>
          <label style={S.label}>Make note of broken / damaged equipment</label>
          <textarea value={broken} onChange={(e) => setBroken(e.target.value)} rows={3}
            placeholder="Anything broken or damaged? Leave blank if all good."
            style={{ ...S.input, resize: "vertical" as const, fontFamily: "inherit" }} />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={S.label}>Photos of broken / damaged equipment (optional)</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <button type="button" onClick={() => cameraRef.current?.click()}
              style={{ padding: "14px 10px", borderRadius: 12, border: "2px dashed #d1d5db", background: "#fafbfc", cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 22 }}>📷</span>
              <span style={{ color: "#1e293b", fontSize: 13, fontWeight: 600 }}>Take Photo</span>
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()}
              style={{ padding: "14px 10px", borderRadius: 12, border: "2px dashed #d1d5db", background: "#fafbfc", cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 22 }}>🖼️</span>
              <span style={{ color: "#1e293b", fontSize: 13, fontWeight: 600 }}>Choose from Gallery</span>
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addPhotos(e.target.files); if (cameraRef.current) cameraRef.current.value = ""; }} />
            <input ref={galleryRef} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => { addPhotos(e.target.files); if (galleryRef.current) galleryRef.current.value = ""; }} />
          </div>
          {brokenPhotos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
              {brokenPhotos.map((p: any, i: number) => (
                <div key={i} style={{ position: "relative" as const, borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb", aspectRatio: "1" }}>
                  <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <button type="button" onClick={() => removePhoto(i)}
                    style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                </div>
              ))}
            </div>
          )}
          {brokenPhotos.length > 0 && vehicle && (
            <p style={{ color: "#94a3b8", margin: "8px 0 0", fontSize: 11 }}>
              Will save to <strong style={{ color: "#475569" }}>Broken/Damaged Equipment/</strong> as <strong style={{ color: "#475569" }}>{vehicle.replace(/\//g, "-")}_{emp.name.replace(/\//g, "-")}_{formatDateFile(new Date())}.jpg</strong>
            </p>
          )}
        </div>
      </div>

      {err && (
        <div style={{ ...S.card, borderLeft: "4px solid #dc2626", marginBottom: 12, padding: "12px 16px" }}>
          <p style={{ color: "#dc2626", margin: 0, fontSize: 13, fontWeight: 600 }}>{err}</p>
        </div>
      )}

      <Btn variant="success" onClick={submit} disabled={submitting} style={{ width: "100%" }}>
        {submitting ? "Submitting..." : "Submit Checklist"}
      </Btn>
      {exportModal}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(0);
  const [sites, setSites] = useState<any[]>([]);
  const [activeClocks, setActiveClocks] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [eodChecklists, setEodChecklists] = useState<any[]>([]);
  const [managerAuth, setManagerAuth] = useState(false);
  const [dbLoading, setDbLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [activeRes, completedRes, sitesRes, eodRes] = await Promise.all([
      supabase.from('clock_events').select('*').is('clock_out', null),
      supabase.from('clock_events').select('*').not('clock_out', 'is', null).order('clock_in', { ascending: false }),
      supabase.from('job_sites').select('*').order('id', { ascending: true }),
      // eod_checklists may not exist yet (needs the one-time SQL); errors are ignored so the rest of the app still loads.
      supabase.from('eod_checklists').select('*').order('created_at', { ascending: false }),
    ]);

    if (activeRes.data) {
      setActiveClocks(activeRes.data.map(mapRow));
    }
    if (completedRes.data) {
      setHistory(completedRes.data.map(mapRow));
    }
    if (eodRes.data) {
      setEodChecklists(eodRes.data);
    }
    if (sitesRes.data) {
      if (sitesRes.data.length === 0) {
        await supabase.from('job_sites').insert(INITIAL_SITES);
        setSites(INITIAL_SITES);
      } else {
        setSites(sitesRes.data);
      }
    }
    setDbLoading(false);
  }, []);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clock_events' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_sites' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eod_checklists' }, loadData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  useEffect(() => { if (page < 3) setManagerAuth(false); }, [page]);

  const onSubmitChecklist = async (payload: any) => {
    const { data, error } = await supabase.from('eod_checklists').insert(payload).select().single();
    if (!error && data) {
      setEodChecklists((p) => [data, ...p]);
    }
    return { error: error?.message };
  };

  const onClockIn = async (empName: string, site: any, manager: string) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('clock_events').insert({
      employee_name: empName,
      site_name: site.name,
      site_id: site.id,
      manager_name: manager,
      clock_in: now,
      lat: site.lat,
      lng: site.lng,
    }).select().single();

    if (!error && data) {
      setActiveClocks((p) => [...p, mapRow(data)]);
    }
  };

  const onClockOut = async (employeeName: string) => {
    const active = activeClocks.find((c) => c.employee === employeeName);
    if (!active) return;
    const now = new Date().toISOString();
    const hrs = calcHours(active.clockIn, now);
    const { error } = await supabase.from('clock_events').update({
      clock_out: now,
      hours: hrs,
      status: 'pending',
    }).eq('id', active.id);

    if (!error) {
      const completed = { ...active, clockOut: now, hours: hrs, status: 'pending' };
      setActiveClocks((p) => p.filter((c) => c.employee !== employeeName));
      setHistory((p) => [completed, ...p]);
    }
  };

  const onApprove = async (id: string) => {
    const { error } = await supabase.from('clock_events').update({ status: 'approved' }).eq('id', id);
    if (!error) {
      setHistory((p) => p.map((h) => h.id === id ? { ...h, status: 'approved' } : h));
    }
  };

  const onReject = async (id: string) => {
    const { error } = await supabase.from('clock_events').update({ status: 'rejected' }).eq('id', id);
    if (!error) {
      setHistory((p) => p.map((h) => h.id === id ? { ...h, status: 'rejected' } : h));
    }
  };

  const onEditEntry = useCallback(async (id: string, updates: any) => {
    const dbUpdates: any = { status: 'edited' };
    if (updates.clockIn !== undefined) dbUpdates.clock_in = updates.clockIn;
    if (updates.clockOut !== undefined) dbUpdates.clock_out = updates.clockOut;
    if (updates.hours !== undefined) dbUpdates.hours = updates.hours;
    if (updates.site !== undefined) dbUpdates.site_name = updates.site;
    if (updates.siteId !== undefined) dbUpdates.site_id = updates.siteId;
    if (updates.manager !== undefined) dbUpdates.manager_name = updates.manager;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    await supabase.from('clock_events').update(dbUpdates).eq('id', id);
    setHistory((p: any[]) => p.map((h: any) => h.id === id ? { ...h, ...updates, status: 'edited' } : h));
  }, []);

  const onCreateEntry = useCallback(async (entry: any) => {
    const { data, error } = await supabase.from('clock_events').insert({
      employee_name: entry.employee,
      site_name: entry.site,
      site_id: entry.siteId,
      manager_name: entry.manager,
      clock_in: entry.clockIn,
      clock_out: entry.clockOut,
      hours: entry.hours,
      status: 'pending',
      notes: entry.notes || null,
    }).select().single();
    if (!error && data) {
      setHistory((p) => [mapRow(data), ...p]);
    }
  }, []);

  const onAddSite = async (siteData: any) => {
    const { data, error } = await supabase.from('job_sites').insert(siteData).select().single();
    if (!error && data) {
      setSites((p) => [...p, data]);
    }
  };

  const onToggleSite = async (id: number) => {
    const site = sites.find((s) => s.id === id);
    if (!site) return;
    const { error } = await supabase.from('job_sites').update({ active: !site.active }).eq('id', id);
    if (!error) {
      setSites((p) => p.map((s) => s.id === id ? { ...s, active: !s.active } : s));
    }
  };

  const onRemoveSite = async (id: number) => {
    const { error } = await supabase.from('job_sites').delete().eq('id', id);
    if (!error) {
      setSites((p) => p.filter((s) => s.id !== id));
    }
  };

  const tabs = [
    { icon: "Clock", label: "Clock In/Out", mgr: false },
    { icon: "Camera", label: "Photos", mgr: false },
    { icon: "Check", label: "End of Day", mgr: false },
    { icon: "Chart", label: "Active Board", mgr: true },
    { icon: "List", label: "Pay Period", mgr: true },
    { icon: "Pin", label: "Job Sites", mgr: true },
  ];

  if (dbLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f6fa" }}>
        <p style={{ color: "#94a3b8", fontSize: 16 }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6fa", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src="/logo.png" alt="Dean Ryans Landscape / Property Maintenance" style={{ height: 48, width: "auto", display: "block" }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1e293b" }}>Dean Ryans</h1>
            <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", letterSpacing: 1.5, fontWeight: 600 }}>LANDSCAPE / PROPERTY MAINTENANCE</p>
          </div>
        </div>
      </div>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", overflowX: "auto" as const, padding: "0 8px" }}>
        {tabs.map((t, i) => (
          <button key={i} onClick={() => setPage(i)} style={{
            flex: "1 0 auto", padding: "12px 14px", background: "transparent", border: "none",
            borderBottom: page === i ? "3px solid #dc2626" : "3px solid transparent",
            color: page === i ? "#1e293b" : "#94a3b8", cursor: "pointer", fontSize: 12, fontWeight: 700,
            display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 3,
            whiteSpace: "nowrap" as const, minWidth: 72
          }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            <span>{t.label}</span>
            {t.mgr && <span style={{ fontSize: 9, color: "#f59e0b", fontWeight: 600 }}>MANAGER</span>}
          </button>
        ))}
      </div>
      <div style={{ padding: "24px 24px 40px", width: "100%", boxSizing: "border-box" as const }}>
        {page === 0 && <ClockPage sites={sites} activeClocks={activeClocks} onClockIn={onClockIn} onClockOut={onClockOut} history={history} />}
        {page === 1 && <PhotoPage sites={sites} />}
        {page === 2 && <EODChecklist checklists={eodChecklists} onSubmitChecklist={onSubmitChecklist} />}
        {page === 3 && <ActiveBoard activeClocks={activeClocks} history={history} managerAuth={managerAuth} setManagerAuth={setManagerAuth} />}
        {page === 4 && <PayPeriod history={history} sites={sites} onApprove={onApprove} onReject={onReject} onEditEntry={onEditEntry} onCreateEntry={onCreateEntry} managerAuth={managerAuth} setManagerAuth={setManagerAuth} />}
        {page === 5 && <JobSites sites={sites} onAddSite={onAddSite} onToggleSite={onToggleSite} onRemoveSite={onRemoveSite} managerAuth={managerAuth} setManagerAuth={setManagerAuth} />}
      </div>
    </div>
  );
}
