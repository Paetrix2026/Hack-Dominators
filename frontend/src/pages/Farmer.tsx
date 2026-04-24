import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { TrustGauge } from "@/components/TrustGauge";
import { useAuth } from "@/lib/auth";
import { Layout, Plus, History, Phone, MapPin, Mic, Camera, Sparkles, CheckCircle2, Leaf, X, CheckCircle, XCircle } from "lucide-react";
import { ApiBatch, ApiHerbRequest, getBatches, getIncomingRequests, respondToRequest, translateKannada, uploadBatch } from "@/lib/api";

const nav = [
  { label: "Dashboard", to: "/farmer", icon: Layout },
  { label: "New Batch", to: "/farmer/new", icon: Plus },
  { label: "History", to: "/farmer/history", icon: History },
];

type Tab = "dash" | "new" | "result" | "history";

const Farmer = () => {
  const loc = useLocation();
  const { user } = useAuth();
  const farmerName = user?.name ?? "Ravi Kumar";
  const [tab, setTab] = useState<Tab>("dash");
  const [recording, setRecording] = useState(false);
  const [requests, setRequests] = useState<ApiHerbRequest[]>([]);
  const [allBatches, setAllBatches] = useState<ApiBatch[]>([]);
  const [herbName, setHerbName] = useState("Ashwagandha");
  const [quantity, setQuantity] = useState("42");
  const [location, setLocation] = useState("Karnataka");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<ApiBatch | null>(null);
  const [showCall, setShowCall] = useState(false);
  const [calling, setCalling] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const gradeInfo = (grade?: string, score?: number) => {
    const g = (grade || "").toUpperCase();
    if (g === "A+") return { title: "Excellent", msg: "Top-tier quality. Fully approved for supply chain.", approved: true };
    if (g === "A") return { title: "Good", msg: "Good and approved for supply chain.", approved: true };
    if (g === "B") return { title: "Fair", msg: "Fair quality. Approved, but monitor consistency.", approved: true };
    if (g === "C") return { title: "Needs improvement", msg: "Accepted with caution. Improve quality signals next batch.", approved: true };
    if (g === "D") return { title: "High risk", msg: "Not approved. Please re-check inputs and resubmit.", approved: false };
    if (typeof score === "number") return { title: "Verified", msg: "Trust score calculated.", approved: score >= 60 };
    return { title: "—", msg: "No grade available yet.", approved: false };
  };

  const answerCall = () => {
    setCalling(true);
    setTimeout(() => {
      setCalling(false);
      setShowCall(false);
    }, 5000);
  };

  const handleRequestResponse = async (requestId: string, response: "Accepted" | "Rejected") => {
    const reason = window.prompt(`Reason for ${response.toLowerCase()}?`, "");
    if (!reason || !reason.trim()) return;
    try {
      await respondToRequest(requestId, response, reason.trim());
      setRequests((prev) => prev.map((r) => (r._id === requestId ? { ...r, status: response, response_reason: reason.trim() } : r)));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to update request");
    }
  };

  useEffect(() => {
    const path = loc.pathname.replace("/farmer", "");
    if (path.startsWith("/new")) setTab("new");
    else if (path.startsWith("/history")) setTab("history");
    else if (path.startsWith("/result")) setTab("result");
    else setTab("dash");
  }, [loc.pathname]);

  useEffect(() => {
    const load = async () => {
      try {
        const [batchData, requestData] = await Promise.all([getBatches(), getIncomingRequests()]);
        setAllBatches(batchData);
        setRequests(requestData);
        if (batchData.length > 0) setLastResult(batchData[0]);
      } catch (error) {
        console.error(error);
      }
    };
    load();

    // keep requests fresh after manufacturer sends them
    const t = window.setInterval(async () => {
      try {
        const requestData = await getIncomingRequests();
        setRequests(requestData);
      } catch {
        // ignore
      }
    }, 6000);
    return () => window.clearInterval(t);
  }, []);

  const myBatches = allBatches.filter((b) => (b.farmer_name || "").toLowerCase() === farmerName.toLowerCase());
  const activeBatches = myBatches.length ? myBatches : allBatches;
  const avg = activeBatches.length ? Math.round(activeBatches.reduce((a, b) => a + b.trust_score, 0) / activeBatches.length) : 0;

  const handleSubmitBatch = async () => {
    const qty = Number(quantity);
    if (!qty || qty <= 0) return window.alert("Enter a valid quantity");
    if (photos.length > 6) return window.alert("You can upload up to 6 photos");

    try {
      setSubmitting(true);
      const res = await uploadBatch({
        farmer_name: farmerName,
        herb_name: herbName,
        quantity: qty,
        location,
        photos,
      });
      const created = res.data as ApiBatch;
      setAllBatches((prev) => [created, ...prev]);
      setLastResult(created);
      setTab("result");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to upload batch");
    } finally {
      setSubmitting(false);
    }
  };

  const startVoiceInput = async () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) return window.alert("Voice input is not supported in this browser");
    const recognition = new SpeechRecognition();
    recognition.lang = "kn-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setRecording(true);
    recognition.onresult = async (event: any) => {
      const spoken = event.results?.[0]?.[0]?.transcript || "";
      try {
        const translated = await translateKannada(spoken);
        if (translated.herb) setHerbName(translated.herb);
        if (translated.quantity) setQuantity(String(translated.quantity));
        if (translated.location) setLocation(translated.location);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Voice translation failed");
      } finally {
        setRecording(false);
      }
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);
    recognition.start();
  };

  return (
    <AppShell role="Farmer" nav={nav}>
      {/* Tab switcher */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {([
          ["dash", "Overview"],
          ["new", "New batch"],
          ["result", "Last result"],
          ["history", "History"],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 text-sm transition-all ${
              tab === k ? "bg-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.5)]" : "border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}>{l}</button>
        ))}
      </div>

      {tab === "dash" && (
        <>
          {requests.filter(r => r.status === "Pending").length > 0 && (
            <div className="mb-6 glass rounded-2xl p-5 border border-accent/40 shadow-[0_0_30px_hsl(var(--accent)/0.2)]">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Pending Herb Requests</div>
                <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] text-accent font-semibold">
                  {requests.filter(r => r.status === "Pending").length} waiting
                </span>
              </div>
              <div className="space-y-2">
                {requests.filter(r => r.status === "Pending").map(req => (
                  <div key={req._id} className="rounded-xl border border-border/40 bg-card/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-semibold">{req.herb} · {req.quantity}</div>
                        <div className="text-xs text-muted-foreground">Request from {req.from_manufacturer_name} · {req.request_date?.slice(0, 10)}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleRequestResponse(req._id, "Accepted")} className="rounded-lg bg-secondary/10 border border-secondary/40 px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-secondary/20 transition-colors">
                          <CheckCircle className="mr-1 inline h-3.5 w-3.5" /> Accept
                        </button>
                        <button onClick={() => handleRequestResponse(req._id, "Rejected")} className="rounded-lg bg-destructive/10 border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors">
                          <XCircle className="mr-1 inline h-3.5 w-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Namaste, {farmerName} 🌿</h1>
            <p className="mt-1 text-muted-foreground">Your harvests are looking strong this week.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Total batches" value={activeBatches.length} hint="+2 this week" tone="primary" icon={<Leaf className="h-5 w-5" />} />
            <StatCard label="Latest status" value={activeBatches[0]?.stage ?? "—"} hint={activeBatches[0]?.herb_name} tone="secondary" icon={<Sparkles className="h-5 w-5" />} />
            <div className="glass rounded-2xl p-5 border border-accent/30 shadow-[0_0_30px_hsl(var(--accent)/0.25)] flex items-center gap-5">
              <TrustGauge value={avg} size={140} label="Average" />
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Average trust</div>
                <div className="mt-1 text-sm">Excellent — keep it up.</div>
                <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-secondary/40 bg-secondary/10 px-2.5 py-1 text-[11px] text-secondary">
                  <CheckCircle2 className="h-3 w-3" /> Top 12% nationally
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 glass rounded-2xl p-6 border border-border/60">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">Recent batches</div>
            <div className="space-y-2">
              {activeBatches.slice(0, 4).map(b => (
                <div key={b._id} className="flex items-center justify-between rounded-xl border border-border/40 bg-card/40 px-4 py-3 hover:border-primary/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-secondary text-secondary-foreground"><Leaf className="h-4 w-4" /></div>
                    <div>
                      <div className="text-sm font-medium">{b.herb_name}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">{b._id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{b.stage}</span>
                    <span className={`font-mono text-sm font-bold ${b.trust_score >= 80 ? "text-secondary" : b.trust_score >= 60 ? "text-primary" : "text-destructive"}`} style={{ textShadow: "0 0 12px currentColor" }}>{b.trust_score}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "new" && (
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold">Add new batch</h1>
          <p className="mt-1 text-muted-foreground">Snap, speak, submit. We'll handle the rest.</p>

          <div className="mt-6 glass rounded-2xl p-6 border border-primary/20">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 6))} />
            <button onClick={() => fileRef.current?.click()} className="group relative flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 py-12 transition-all hover:border-primary/60 hover:bg-primary/10">
              <div className="absolute inset-0 rounded-2xl bg-gradient-primary opacity-0 blur-2xl transition-opacity group-hover:opacity-20" />
              <div className="relative grid h-16 w-16 place-items-center rounded-full bg-gradient-primary shadow-[0_0_40px_hsl(var(--primary)/0.5)] animate-float-y">
                <Camera className="h-7 w-7 text-primary-foreground" />
              </div>
              <div className="relative">
                <div className="font-semibold">Upload herb photo</div>
                <div className="text-xs text-muted-foreground">Tap to upload up to 6 images ({photos.length}/6)</div>
              </div>
            </button>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={startVoiceInput}
                className={`relative flex items-center justify-center gap-2 rounded-xl border px-4 py-4 text-sm transition-all ${
                  recording ? "border-destructive/60 bg-destructive/10 text-destructive animate-[pulse-ring_1.6s_infinite]" : "border-border bg-card/50 hover:border-primary/40"
                }`}>
                <Mic className="h-4 w-4" /> {recording ? "Listening…" : "Voice input"}
              </button>
              <div className="relative flex items-center gap-2 rounded-xl border border-secondary/40 bg-secondary/5 px-4 py-4 text-sm text-secondary">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-60" />
                  <MapPin className="relative h-3 w-3" />
                </span>
                GPS locked · {location}
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <input value={herbName} onChange={(e) => setHerbName(e.target.value)} className="rounded-xl border border-border bg-input/60 px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" placeholder="Herb name (e.g. Ashwagandha)" />
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-xl border border-border bg-input/60 px-4 py-3 text-sm" placeholder="Quantity (kg)" />
              <input value={location} onChange={(e) => setLocation(e.target.value)} className="rounded-xl border border-border bg-input/60 px-4 py-3 text-sm" placeholder="Location (e.g. Karnataka)" />
            </div>

            <button onClick={handleSubmitBatch} disabled={submitting}
              className="relative mt-6 w-full overflow-hidden rounded-xl bg-gradient-primary px-6 py-4 font-semibold text-primary-foreground shadow-[0_0_40px_hsl(var(--primary)/0.5)] transition-transform hover:scale-[1.01] active:scale-100">
              <span className="relative z-10">{submitting ? "Submitting..." : "Submit to AyurTrust ⚡"}</span>
              <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent,hsl(0_0%_100%/0.3),transparent)] bg-[length:200%_100%] animate-shimmer" />
            </button>
          </div>
        </div>
      )}

      {tab === "result" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 glass rounded-2xl p-6 border border-accent/40 shadow-[0_0_40px_hsl(var(--accent)/0.25)] flex flex-col items-center text-center">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Trust Score</div>
            <div className="mt-4"><TrustGauge value={lastResult?.trust_score ?? 0} size={220} label={lastResult?.trust_grade ?? "Verified"} /></div>
            <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-secondary/40 bg-secondary/10 px-3 py-1 text-xs text-secondary">
              <CheckCircle2 className="h-3 w-3" /> Grade {lastResult?.trust_grade ?? "-"}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="glass rounded-2xl p-6 border border-border/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Grade meaning</div>
                  <div className="mt-1 text-lg font-semibold">{gradeInfo(lastResult?.trust_grade, lastResult?.trust_score).title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{gradeInfo(lastResult?.trust_grade, lastResult?.trust_score).msg}</div>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  gradeInfo(lastResult?.trust_grade, lastResult?.trust_score).approved
                    ? "border-secondary/40 bg-secondary/10 text-secondary"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
                }`}>
                  {gradeInfo(lastResult?.trust_grade, lastResult?.trust_score).approved ? "Approved" : "Not approved"}
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-5 text-[11px]">
                {[
                  { g: "A+", t: "Excellent", ok: true },
                  { g: "A", t: "Good", ok: true },
                  { g: "B", t: "Fair", ok: true },
                  { g: "C", t: "Caution", ok: true },
                  { g: "D", t: "Reject", ok: false },
                ].map((x) => {
                  const active = (lastResult?.trust_grade || "").toUpperCase() === x.g;
                  return (
                    <div key={x.g} className={`rounded-xl border px-3 py-2 ${active ? "border-primary/40 bg-primary/5" : "border-border/50 bg-card/30"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold">{x.g}</span>
                        <span className={`${x.ok ? "text-secondary" : "text-destructive"}`}>{x.ok ? "✓" : "×"}</span>
                      </div>
                      <div className="mt-0.5 text-muted-foreground">{x.t}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass rounded-2xl p-6 border border-border/60">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Batch</div>
                  <div className="font-mono text-lg font-semibold">{lastResult?._id ?? "--"} · {lastResult?.herb_name ?? herbName}</div>
                </div>
                <span className="rounded-full border border-secondary/40 bg-secondary/10 px-3 py-1 text-[11px] text-secondary">Approved</span>
              </div>
              <div className="mt-5 space-y-4">
                <ProgressRow label="AI quality score" value={lastResult?.quality_score ?? 0} tone="primary" />
                <ProgressRow label="Geo verification" value={lastResult?.location ? 100 : 40} tone="secondary" suffix="✓ matched" />
                <ProgressRow label="Photo quality signal" value={Math.min(100, (lastResult?.photo_count ?? 0) * 16)} tone="accent" />
              </div>
            </div>
            <div className="glass rounded-2xl p-5 border border-border/60 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Blockchain receipt</div>
                <div className="mt-1 font-mono text-sm">{lastResult?.tx_hash ?? "N/A"}</div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary border border-primary/30">
                <CheckCircle2 className="h-3 w-3" /> Anchored
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          <h1 className="text-3xl font-bold mb-4">Batch history</h1>
          {myBatches.map(b => (
            <div key={b._id} className="glass glass-hover rounded-2xl p-5 border border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-secondary text-secondary-foreground"><Leaf className="h-5 w-5" /></div>
                <div>
                  <div className="font-semibold">{b.herb_name}</div>
                  <div className="text-xs font-mono text-muted-foreground">{b._id} · {b.location}</div>
                </div>
              </div>
              <div className={`rounded-full px-3 py-1 text-sm font-mono font-bold border ${
                b.trust_score >= 80 ? "border-secondary/50 bg-secondary/10 text-secondary" :
                b.trust_score >= 60 ? "border-primary/50 bg-primary/10 text-primary" :
                "border-destructive/50 bg-destructive/10 text-destructive"
              }`} style={{ textShadow: "0 0 10px currentColor" }}>
                {b.trust_score}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating IVR call button */}
      <button onClick={() => setShowCall(true)} className="fixed bottom-6 right-6 z-30 grid h-14 w-14 place-items-center rounded-full bg-gradient-secondary text-secondary-foreground shadow-[0_0_40px_hsl(var(--secondary)/0.6)] animate-[pulse-ring_2s_infinite] hover:scale-110 transition-transform">
        <Phone className="h-5 w-5" />
        <span className="sr-only">IVR call</span>
      </button>

      {/* Call Connection Modal */}
      {showCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="glass rounded-3xl p-8 border border-primary/30 shadow-[0_0_60px_hsl(var(--primary)/0.3)] max-w-md w-full text-center">
            <button onClick={() => setShowCall(false)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-border/60 hover:border-destructive/50 transition-colors">
              <X className="h-4 w-4" />
            </button>
            <div className="mt-4">
              {calling ? (
                <>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Connected</div>
                  <div className="mt-3 text-3xl font-bold text-secondary">In Call</div>
                  <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-secondary/40 bg-secondary/10 px-3 py-1.5 text-xs text-secondary">
                    <CheckCircle2 className="h-3.5 w-3.5 animate-pulse" /> Active connection
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Incoming Call</div>
                  <div className="mt-3 text-2xl font-bold">Order Request</div>
                  <p className="mt-2 text-sm text-muted-foreground">Manufacturer wants to place an order</p>
                  <div className="mt-6 flex gap-3">
                    <button onClick={answerCall} className="flex-1 rounded-xl bg-gradient-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground shadow-[0_0_24px_hsl(var(--secondary)/0.4)] hover:scale-[1.02] transition-transform">
                      <CheckCircle className="mr-2 inline h-4 w-4" /> Answer
                    </button>
                    <button onClick={() => setShowCall(false)} className="flex-1 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive hover:bg-destructive/20 transition-colors">
                      <XCircle className="mr-2 inline h-4 w-4" /> Decline
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

const ProgressRow = ({ label, value, tone, suffix }: { label: string; value: number; tone: "primary"|"secondary"|"accent"; suffix?: string }) => {
  const color = tone === "primary" ? "hsl(var(--primary))" : tone === "secondary" ? "hsl(var(--secondary))" : "hsl(var(--accent))";
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold" style={{ color, textShadow: `0 0 8px ${color}` }}>{suffix ?? `${value}%`}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: `${value}%`, background: color, boxShadow: `0 0 12px ${color}` }} />
      </div>
    </div>
  );
};

export default Farmer;
