"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const EMPLOYEES = [
  { name: "Adrian", pin: "3847" },
  { name: "Antonio Alvarez", pin: "6192" },
  { name: "Brandi Larabie", pin: "5038" },
  { name: "Cameron Rice", pin: "7261" },
  { name: "Carolina Landa", pin: "4915" },
  { name: "Easton Ryan", pin: "8374" },
  { name: "Everist Sundit", pin: "2659" },
  { name: "Griffin Kay", pin: "9123" },
  { name: "Haydon Rice", pin: "1486" },
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
  { id: 1, name: "The Shop", address: "4271 Greenbank Rd, Ottawa, ON", lat: 45.2241, lng: -75.7186, active: true },
  { id: 2, name: "Navaho", address: "8 Deerfield Dr, Ottawa, ON", lat: 45.3559, lng: -75.7520, active: true },
  { id: 3, name: "Skyline", address: "42 Northview Rd, Ottawa, ON", lat: 45.3629, lng: -75.7296, active: true },
  { id: 4, name: "Meadowlands", address: "1335 Meadowlands Dr E, Ottawa, ON", lat: 45.3564, lng: -75.7305, active: true },
  { id: 5, name: "Craig Henry", address: "303B Craig Henry Dr, Ottawa, ON", lat: 45.3354, lng: -75.7634, active: true },
  { id: 6, name: "Walkley", address: "550 Reardon Pvt, Ottawa, ON", lat: 45.3758, lng: -75.6483, active: true },
  { id: 7, name: "Beaconwood", address: "2012 Beaconwood Dr, Ottawa, ON", lat: 45.4474, lng: -75.5971, active: true },
  { id: 8, name: "Forestview", address: "651 Woodcliffe Pvt, Ottawa, ON", lat: 45.4619, lng: -75.5386, active: true },
  { id: 9, name: "Aspenview", address: "1628 Teakdale Ave, Ottawa, ON", lat: 45.4517, lng: -75.5265, active: true },
  { id: 10, name: "Castle Hill", address: "1000 Castle Hill Cres, Ottawa, ON", lat: 45.3696, lng: -75.7454, active: true },
];

const FENCE_RADIUS = 359;

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

async function uploadToGoogleDrive(files: any[], siteName: string, employeeName: string) {
  const formData = new FormData();
  formData.append('siteName', siteName);
  formData.append('employeeName', employeeName);
  files.forEach((f: any) => formData.append('files', f.file));
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await res.json();
  return data;
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
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: type === "manager" ? "linear-gradient(135deg, #f59e0b, #d97706)" : "linear-gradient(135deg, #dc2626, #b91c1c)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 24 }}>
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

function ClockPage({ sites, activeClocks, setActiveClocks, history, setHistory }: any) {
  const [emp, setEmp] = useState<any>(null);
  const [site, setSite] = useState("");
  const [manager, setManager] = useState("");
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [msg, setMsg] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const activeSites = sites.filter((s: any) => s.active);
  const isClockedIn = emp && activeClocks.find((c: any) => c.employee === emp.name);

  const checkGeo = useCallback((siteId: string) => {
    if (!siteId) return;
    const s = sites.find((x: any) => x.id === Number(siteId));
    if (!s) return;
    setGeoStatus("checking");
    if (!navigator.geolocation) { setGeoStatus("unavailable"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos: GeolocationPosition) => { setGeoStatus(getDistance(pos.coords.latitude, pos.coords.longitude, s.lat, s.lng) <= FENCE_RADIUS ? "verified" : "too_far"); },
      () => setGeoStatus("denied")
    );
  }, [sites]);

  const clockIn = () => {
    setLoading(true);
    const now = new Date().toISOString(), s = sites.find((x: any) => x.id === Number(site));
    setActiveClocks((p: any[]) => [...p, { employee: emp.name, site: s.name, siteId: s.id, manager, clockIn: now, lat: s.lat, lng: s.lng }]);
    setMsg({ type: "success", text: emp.name + " clocked in at " + s.name });
    setTimeout(() => { setLoading(false); setEmp(null); setSite(""); setManager(""); setGeoStatus(null); setMsg(null); }, 2500);
  };

  const clockOut = () => {
    setLoading(true);
    const now = new Date().toISOString(), active = activeClocks.find((c: any) => c.employee === emp.name);
    const hrs = calcHours(active.clockIn, now);
    setHistory((p: any[]) => [...p, { ...active, clockOut: now, hours: hrs, status: "pending" }]);
    setActiveClocks((p: any[]) => p.filter((c: any) => c.employee !== emp.name));
    setMsg({ type: "success", text: emp.name + " clocked out - " + hrs + "h (30min lunch deducted)" });
    setTimeout(() => { setLoading(false); setEmp(null); setMsg(null); }, 2500);
  };

  if (!emp) return <PinEntry title="Clock In / Out" subtitle="Verify your identity to start" onVerify={setEmp} employees={EMPLOYEES} />;

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
            <Btn variant="ghost" onClick={() => { setEmp(null); setMsg(null); }} style={{ width: "100%", marginTop: 10 }}>Back</Btn>
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
  const activeSites = sites.filter((s: any) => s.active);

  const handleFiles = (files: FileList) => {
    const arr = Array.from(files).map((f: File) => ({ name: f.name, url: URL.createObjectURL(f), file: f }));
    setPhotos((p: any[]) => [...p, ...arr]);
  };

  const upload = async () => {
    const s = sites.find((x: any) => x.id === Number(site));
    setUploading(true);
    const res = await uploadToGoogleDrive(photos, s.name, emp.name);
    setUploading(false); setResult(res);
  };

  if (!emp) return <PinEntry title="Photo Upload" subtitle="Verify to upload job site photos" onVerify={setEmp} employees={EMPLOYEES} />;

  if (result) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ ...S.card, textAlign: "center" as const, maxWidth: 420, width: "100%", padding: 32 }}>
        <h3 style={{ color: "#1e293b", margin: "0 0 8px" }}>{result.count} photo(s) uploaded</h3>
        <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 4px" }}>Saved to Google Drive:</p>
        <p style={{ color: "#475569", fontSize: 13, fontFamily: "monospace", background: "#f1f5f9", padding: "8px 12px", borderRadius: 8, margin: "8px 0 20px" }}>{result.folder}/</p>
        <Btn onClick={() => { setEmp(null); setPhotos([]); setResult(null); setSite(""); }}>Done</Btn>
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
          <div style={{ border: "2px dashed #d1d5db", borderRadius: 12, padding: 32, textAlign: "center" as const, marginBottom: 16, cursor: "pointer", background: "#fafbfc" }}
            onClick={() => fileRef.current?.click()}>
            <p style={{ color: "#64748b", margin: 0, fontSize: 14, fontWeight: 500 }}>Tap to take a photo or select from gallery</p>
            <p style={{ color: "#94a3b8", margin: "4px 0 0", fontSize: 12 }}>All formats accepted (HEIC, JPG, PNG, WebP)</p>
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e: any) => handleFiles(e.target.files)} />
          </div>
          {photos.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
                {photos.map((p: any, i: number) => (
                  <div key={i} style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "1", border: "1px solid #e5e7eb" }}>
                    <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button onClick={() => setPhotos((x: any[]) => x.filter((_: any, j: number) => j !== i))} style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>X</button>
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

function PayPeriod({ history, setHistory, managerAuth, setManagerAuth }: any) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editHrs, setEditHrs] = useState("");
  const [selPeriod, setSelPeriod] = useState("current");

  if (!managerAuth) return <PinEntry title="Pay Period History" subtitle="Manager access required" type="manager" onVerify={() => setManagerAuth(true)} employees={[]} />;

  const currentPP = getCurrentPayPeriod();
  const filtered = selPeriod === "all" ? history : history.filter((h: any) => { const d = new Date(h.clockIn); return d >= currentPP.start && d <= currentPP.end; });
  const approve = (i: number) => setHistory((p: any[]) => p.map((h: any, j: number) => j === i ? { ...h, status: "approved" } : h));
  const reject = (i: number) => setHistory((p: any[]) => p.map((h: any, j: number) => j === i ? { ...h, status: "rejected" } : h));
  const saveEdit = (i: number) => { setHistory((p: any[]) => p.map((h: any, j: number) => j === i ? { ...h, hours: parseFloat(editHrs), status: "edited" } : h)); setEditIdx(null); };
  const exportCSV = () => {
    let csv = "Employee,Site,Manager,Clock In,Clock Out,Hours,Status\n";
    filtered.forEach((h: any) => { csv += '"' + h.employee + '","' + h.site + '","' + h.manager + '","' + formatDate(h.clockIn) + " " + formatTime(h.clockIn) + '","' + formatDate(h.clockOut) + " " + formatTime(h.clockOut) + '",' + h.hours + ',"' + h.status + '"\n'; });
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "payperiod_export.csv"; a.click();
  };
  const totalHrs = filtered.filter((h: any) => h.status !== "rejected").reduce((s: number, h: any) => s + h.hours, 0);
  const statusColor: any = { pending: "#f59e0b", approved: "#16a34a", rejected: "#dc2626", edited: "#7c3aed" };

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
          <Btn variant="outline" onClick={exportCSV} disabled={filtered.length === 0} style={{ padding: "8px 16px", fontSize: 13 }}>Export CSV</Btn>
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
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
          {filtered.map((h: any, i: number) => {
            const ri = history.indexOf(h);
            return (
              <div key={i} style={{ ...S.card, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" as const, gap: 10 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1, minWidth: 200 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: (statusColor[h.status] || "#94a3b8") + "18", display: "flex", alignItems: "center", justifyContent: "center", color: statusColor[h.status] || "#94a3b8", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{h.employee[0]}</div>
                    <div>
                      <p style={{ color: "#1e293b", margin: 0, fontWeight: 700, fontSize: 15 }}>{h.employee}</p>
                      <p style={{ color: "#64748b", margin: "2px 0", fontSize: 13 }}>{h.site} - {h.manager}</p>
                      <p style={{ color: "#94a3b8", margin: 0, fontSize: 12 }}>{formatDate(h.clockIn)} {formatTime(h.clockIn)} to {formatTime(h.clockOut)}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" as const }}>
                    {editIdx === ri ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input value={editHrs} onChange={(e) => setEditHrs(e.target.value)} type="number" step="0.25" style={{ width: 70, padding: "6px 10px", background: "#f8fafc", border: "1px solid #d1d5db", borderRadius: 8, color: "#1e293b", fontSize: 15, fontWeight: 700 }} />
                        <button onClick={() => saveEdit(ri)} style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Save</button>
                        <button onClick={() => setEditIdx(null)} style={{ background: "#f1f5f9", color: "#64748b", border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
                      </div>
                    ) : (
                      <p style={{ color: "#1e293b", margin: "0 0 4px", fontSize: 22, fontWeight: 800 }}>{h.hours}h</p>
                    )}
                    <Badge color={statusColor[h.status] || "#94a3b8"}>{h.status.toUpperCase()}</Badge>
                  </div>
                </div>
                {h.status === "pending" && editIdx !== ri && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
                    <button onClick={() => approve(ri)} style={{ flex: 1, padding: "8px 0", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, color: "#15803d", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Approve</button>
                    <button onClick={() => reject(ri)} style={{ flex: 1, padding: "8px 0", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Reject</button>
                    <button onClick={() => { setEditIdx(ri); setEditHrs(String(h.hours)); }} style={{ flex: 1, padding: "8px 0", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 8, color: "#7c3aed", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Edit</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function JobSites({ sites, setSites, managerAuth, setManagerAuth }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [nf, setNf] = useState({ name: "", address: "", lat: "", lng: "" });

  if (!managerAuth) return <PinEntry title="Job Sites" subtitle="Manager access required" type="manager" onVerify={() => setManagerAuth(true)} employees={[]} />;

  const addSite = () => {
    if (!nf.name || !nf.address || !nf.lat || !nf.lng) return;
    setSites((p: any[]) => [...p, { id: Date.now(), name: nf.name, address: nf.address, lat: parseFloat(nf.lat), lng: parseFloat(nf.lng), active: true }]);
    setNf({ name: "", address: "", lat: "", lng: "" }); setShowAdd(false);
  };
  const toggle = (id: number) => setSites((p: any[]) => p.map((s: any) => s.id === id ? { ...s, active: !s.active } : s));
  const remove = (id: number) => setSites((p: any[]) => p.filter((s: any) => s.id !== id));

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

export default function App() {
  const [page, setPage] = useState(0);
  const [sites, setSites] = useState(INITIAL_SITES);
  const [activeClocks, setActiveClocks] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [managerAuth, setManagerAuth] = useState(false);

  const tabs = [
    { icon: "Clock", label: "Clock In/Out", mgr: false },
    { icon: "Camera", label: "Photos", mgr: false },
    { icon: "Chart", label: "Active Board", mgr: true },
    { icon: "List", label: "Pay Period", mgr: true },
    { icon: "Pin", label: "Job Sites", mgr: true },
  ];

  useEffect(() => { if (page < 2) setManagerAuth(false); }, [page]);

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
        {page === 0 && <ClockPage sites={sites} activeClocks={activeClocks} setActiveClocks={setActiveClocks} history={history} setHistory={setHistory} />}
        {page === 1 && <PhotoPage sites={sites} />}
        {page === 2 && <ActiveBoard activeClocks={activeClocks} history={history} managerAuth={managerAuth} setManagerAuth={setManagerAuth} />}
        {page === 3 && <PayPeriod history={history} setHistory={setHistory} managerAuth={managerAuth} setManagerAuth={setManagerAuth} />}
        {page === 4 && <JobSites sites={sites} setSites={setSites} managerAuth={managerAuth} setManagerAuth={setManagerAuth} />}
      </div>
    </div>
  );
}
