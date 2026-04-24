import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { Layout, Boxes, AlertTriangle, BarChart3, Search, ArrowUpDown, CheckCircle2, XCircle, ChevronRight, Hash, MapPin, X, Send } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ApiBatch, ApiHerbRequest, createHerbRequest, getBatches, getOutgoingRequests } from "@/lib/api";

const nav = [
  { label: "Overview", to: "/manufacturer", icon: Layout },
  { label: "Batches", to: "/manufacturer/batches", icon: Boxes },
  { label: "Fraud alerts", to: "/manufacturer/fraud", icon: AlertTriangle },
  { label: "Analytics", to: "/manufacturer/analytics", icon: BarChart3 },
];

const stages = ["Collected", "Processed", "Manufactured", "Packaged"] as const;

const Manufacturer = () => {
  const loc = useLocation();
  const { user } = useAuth();
  const manufacturerName = user?.name ?? "Anita Shah";
  const [q, setQ] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [items, setItems] = useState<ApiBatch[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<ApiHerbRequest[]>([]);
  const [selId, setSelId] = useState("");
  const [section, setSection] = useState<"overview"|"batches"|"fraud"|"analytics">("overview");
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestQuantity, setRequestQuantity] = useState("");

  const handleHerbRequest = async () => {
    if (!sel || !requestQuantity.trim()) return;
    try {
      await createHerbRequest({
        herb: sel.herb_name,
        quantity: requestQuantity,
        to_farmer_name: sel.farmer_name,
        to_farmer_email: sel.user_email,
      });
      const req = await getOutgoingRequests();
      setOutgoingRequests(req);
      setShowRequestModal(false);
      setRequestQuantity("");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to send request");
    }
  };

  const sel = useMemo(() => items.find((b) => b._id === selId) ?? items[0] ?? null, [items, selId]);
  const high = items.filter((b) => b.fraud_risk === "High").length;
  const avg = items.length ? Math.round(items.reduce((a, b) => a + b.trust_score, 0) / items.length) : 0;

  useEffect(() => {
    const path = loc.pathname.replace("/manufacturer", "");
    if (path.startsWith("/batches")) setSection("batches");
    else if (path.startsWith("/fraud")) setSection("fraud");
    else if (path.startsWith("/analytics")) setSection("analytics");
    else setSection("overview");
  }, [loc.pathname]);

  useEffect(() => {
    const load = async () => {
      try {
        const [batchData, requestData] = await Promise.all([getBatches(), getOutgoingRequests()]);
        setItems(batchData);
        setOutgoingRequests(requestData);
        if (batchData.length) setSelId(batchData[0]._id);
      } catch (error) {
        console.error(error);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const f = items.filter((b) => `${b._id} ${b.herb_name} ${b.farmer_name}`.toLowerCase().includes(q.toLowerCase()));
    return f.sort((a, b) => sortDesc ? b.trust_score - a.trust_score : a.trust_score - b.trust_score);
  }, [q, sortDesc, items]);

  const title = section === "overview" ? "Operations overview"
    : section === "batches" ? "Batch inventory"
    : section === "fraud" ? "Fraud alerts"
    : "Analytics dashboard";

  const description = section === "analytics"
    ? "Trust metrics and trend lines across the supply chain."
    : section === "fraud"
    ? "Review flagged batches and fraud risks in real time."
    : "Real-time view of every batch on the chain.";

  return (
    <AppShell role="Manufacturer" nav={nav}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total batches" value={items.length} hint="+12 today" tone="primary" icon={<Boxes className="h-5 w-5" />} />
        <StatCard label="High-risk alerts" value={high} hint="needs review" tone="danger" icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label="Avg trust score" value={avg} hint="across network" tone="secondary" icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="On-chain anchors" value="12.4k" hint="last 30d" tone="accent" icon={<Hash className="h-5 w-5" />} />
      </div>

      {(section === "overview" || section === "batches") && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Table */}
        <div className="lg:col-span-2 glass rounded-2xl border border-border/60 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border/60 p-4">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search batch, herb, farmer…"
                className="w-full rounded-xl border border-border bg-input/60 py-2.5 pl-9 pr-3 text-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <button onClick={() => setSortDesc(s => !s)} className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs hover:border-primary/40">
              <ArrowUpDown className="h-3.5 w-3.5" /> Trust
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3">Herb</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Trust</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <tr key={b._id} onClick={() => setSelId(b._id)}
                    className={`group cursor-pointer border-t border-border/40 transition-colors hover:bg-primary/5 ${sel?._id === b._id ? "bg-primary/5" : ""} ${b.fraud_risk === "High" ? "relative" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        {b.fraud_risk === "High" && <span className="h-1.5 w-1.5 rounded-full bg-destructive shadow-[0_0_10px_hsl(var(--destructive))] animate-pulse" />}
                        {b._id}
                      </div>
                    </td>
                    <td className="px-4 py-3">{b.herb_name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-border/60 bg-card/60 px-2 py-0.5 text-[11px] text-muted-foreground">{b.stage}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-mono font-bold ${b.trust_score >= 80 ? "text-secondary" : b.trust_score >= 60 ? "text-primary" : "text-destructive"}`} style={{ textShadow: "0 0 10px currentColor" }}>
                        {b.trust_score}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground"><ChevronRight className="h-4 w-4 inline opacity-0 group-hover:opacity-100 transition-opacity" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel */}
        {sel && (
          <div className="space-y-4">
            <div className={`glass rounded-2xl p-5 border ${sel.fraud_risk === "High" ? "border-destructive/50 shadow-[0_0_40px_hsl(var(--destructive)/0.3)]" : "border-border/60"}`}>
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm">{sel._id}</div>
                {sel.fraud_risk === "High"
                  ? <span className="inline-flex items-center gap-1 rounded-full border border-destructive/50 bg-destructive/10 px-2.5 py-1 text-[11px] text-destructive animate-pulse"><AlertTriangle className="h-3 w-3" /> Fraud risk</span>
                  : <span className="inline-flex items-center gap-1 rounded-full border border-secondary/40 bg-secondary/10 px-2.5 py-1 text-[11px] text-secondary"><CheckCircle2 className="h-3 w-3" /> Verified</span>}
              </div>
              <div className="mt-3 text-2xl font-bold">{sel.herb_name}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {sel.location} · by {sel.farmer_name}
              </div>

              <div className="mt-5 space-y-3 text-xs">
                <Row k="AI quality" v={`${sel.quality_score}%`} />
                <Row k="Trust score" v={String(sel.trust_score)} tone={sel.trust_score >= 80 ? "secondary" : sel.trust_score >= 60 ? "primary" : "danger"} />
                <Row k="Hash" v={sel.blockchain_hash} mono />
              </div>

              {sel.decision && (
                <div className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold ${sel.decision === "Approved" ? "border border-secondary/40 bg-secondary/10 text-secondary" : "border border-destructive/40 bg-destructive/10 text-destructive"}`}>
                  {sel.decision === "Approved" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} {sel.decision}
                </div>
              )}

              <div className="mt-5 flex gap-2">
                <button onClick={() => sel && setItems(prev => prev.map(b => b._id === sel._id ? { ...b, decision: "Approved" } : b))}
                  className="flex-1 rounded-xl bg-gradient-secondary px-3 py-2.5 text-xs font-semibold text-secondary-foreground shadow-[0_0_24px_hsl(var(--secondary)/0.4)] hover:scale-[1.02] transition-transform">
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> Approve
                </button>
                <button onClick={() => sel && setItems(prev => prev.map(b => b._id === sel._id ? { ...b, decision: "Rejected" } : b))}
                  className="flex-1 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors">
                  <XCircle className="mr-1 inline h-3.5 w-3.5" /> Reject
                </button>
              </div>
              <button onClick={() => setShowRequestModal(true)} className="mt-2 w-full rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
                Request Herb →
              </button>
            </div>

            {/* Stage tracker */}
            <div className="glass rounded-2xl p-5 border border-border/60">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">Process tracking</div>
              <StageBar current={sel.stage as typeof stages[number]} />
            </div>
          </div>
        )}
      </div>
      )}

      {/* Fraud alerts + Analytics */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5 border border-destructive/40 shadow-[0_0_40px_hsl(var(--destructive)/0.2)]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /><span className="font-semibold">Fraud alerts</span></div>
            <span className="text-[10px] text-muted-foreground font-mono">{high} active</span>
          </div>
          <div className="space-y-2">
            {items.filter((b) => b.fraud_risk === "High").map((b) => (
              <div key={b._id} className="relative flex items-center justify-between rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
                <div className="absolute inset-0 rounded-xl bg-destructive/5 animate-pulse" />
                <div className="relative">
                  <div className="font-mono text-xs">{b._id} · {b.herb_name}</div>
                  <div className="text-[11px] text-muted-foreground">{b.location} · trust {b.trust_score}</div>
                </div>
                <span className="relative text-[10px] uppercase tracking-wider text-destructive">Review</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-5 border border-border/60">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><span className="font-semibold">Trust trend · 7d</span></div>
            <span className="text-[10px] text-muted-foreground font-mono">avg {avg}</span>
          </div>
          <Sparkline data={[62, 71, 68, 78, 82, 86, 91]} />
          <div className="mt-4 grid grid-cols-7 text-center text-[10px] text-muted-foreground">
            {["M","T","W","T","F","S","S"].map((d, i) => <span key={i}>{d}</span>)}
          </div>
        </div>
      </div>

      {/* Herb Request Modal */}
      {showRequestModal && sel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="glass rounded-3xl p-6 border border-primary/30 shadow-[0_0_60px_hsl(var(--primary)/0.3)] max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Request Herb</h2>
              <button onClick={() => setShowRequestModal(false)} className="grid h-8 w-8 place-items-center rounded-full border border-border/60 hover:border-destructive/50 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">From Farmer</div>
                <div className="font-semibold">{sel.farmer_name}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Herb</div>
                <div className="font-semibold">{sel.herb_name}</div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Quantity Needed</label>
                <input type="text" placeholder="e.g., 50 kg" value={requestQuantity} onChange={e => setRequestQuantity(e.target.value)}
                  className="w-full rounded-xl border border-border bg-input/60 px-4 py-3 text-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">From</div>
                <div className="font-semibold">{manufacturerName}</div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowRequestModal(false)}
                  className="flex-1 rounded-xl border border-border/60 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button onClick={handleHerbRequest} disabled={!requestQuantity.trim()}
                  className="flex-1 rounded-xl bg-gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.4)] disabled:opacity-50 hover:scale-[1.02] transition-transform">
                  <Send className="mr-2 inline h-4 w-4" /> Send Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

const Row = ({ k, v, tone, mono }: { k: string; v: string; tone?: "primary"|"secondary"|"danger"; mono?: boolean }) => {
  const color = tone === "secondary" ? "text-secondary" : tone === "danger" ? "text-destructive" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/40 bg-card/40 px-3 py-2">
      <span className="text-muted-foreground">{k}</span>
      <span className={`${mono ? "font-mono" : "font-semibold"} ${color}`} style={tone ? { textShadow: "0 0 10px currentColor" } : undefined}>{v}</span>
    </div>
  );
};

const StageBar = ({ current }: { current: typeof stages[number] }) => {
  const idx = stages.indexOf(current);
  return (
    <div className="relative">
      <div className="absolute left-3 right-3 top-3 h-0.5 bg-border" />
      <div className="absolute left-3 top-3 h-0.5 bg-gradient-primary shadow-[0_0_12px_hsl(var(--primary))] transition-[width] duration-700"
        style={{ width: `calc(${(idx / (stages.length - 1)) * 100}% - ${idx === stages.length - 1 ? "12px" : "0px"})` }} />
      <div className="relative grid grid-cols-4 gap-1">
        {stages.map((s, i) => (
          <div key={s} className="flex flex-col items-center gap-2">
            <div className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold transition-all ${
              i <= idx ? "bg-gradient-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.6)]" : "border border-border bg-card text-muted-foreground"
            }`}>{i + 1}</div>
            <span className={`text-[10px] ${i <= idx ? "text-primary" : "text-muted-foreground"}`}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const Sparkline = ({ data }: { data: number[] }) => {
  const w = 100, h = 40, max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.5" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#sg)" />
      <polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.2" style={{ filter: "drop-shadow(0 0 4px hsl(var(--primary)))" }} />
    </svg>
  );
};

export default Manufacturer;
