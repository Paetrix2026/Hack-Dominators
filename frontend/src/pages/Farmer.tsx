import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { TrustGauge } from "@/components/TrustGauge";
import { useAuth } from "@/lib/auth";
import { Layout, Plus, History, Phone, MapPin, Mic, Camera, Sparkles, CheckCircle2, Leaf, X, CircleCheck, CircleX } from "lucide-react";

import { ApiBatch, ApiHerbRequest, getBatches, getIncomingRequests, respondToRequest, submitVoiceInput, translateKannada, uploadBatch } from "@/lib/api";

const FarmerTrustPieChart = lazy(() => import("@/components/FarmerTrustPieChart"));

const nav = [
  { label: "Dashboard", to: "/farmer", icon: Layout },
  { label: "New Batch", to: "/farmer/new", icon: Plus },
  { label: "History", to: "/farmer/history", icon: History },
];

type Tab = "dash" | "new" | "result" | "history";
type HerbDetail = { herb_name: string; quantity: string; notes: string; photo_index: number };
type VoiceField = "auto" | "herb_name" | "quantity" | "notes";

const Farmer = () => {
  const loc = useLocation();
  const { user } = useAuth();
  const farmerName = user?.name ?? "Ravi Kumar";
  const [tab, setTab] = useState<Tab>("dash");
  const [recording, setRecording] = useState(false);
  const [requests, setRequests] = useState<ApiHerbRequest[]>([]);
  const [allBatches, setAllBatches] = useState<ApiBatch[]>([]);
  const [herbName, setHerbName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState("Karnataka");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [herbDetails, setHerbDetails] = useState<HerbDetail[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<ApiBatch | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string>("");
  const [showCall, setShowCall] = useState(false);
  const [calling, setCalling] = useState(false);
  const [voiceTarget, setVoiceTarget] = useState<{ idx: number; field: VoiceField } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const voiceProcessingRef = useRef(false);

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

    const POLL_MS = 25000;
    const t = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const requestData = await getIncomingRequests();
        setRequests(requestData);
      } catch {
        // ignore
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, []);

  const myBatches = useMemo(
    () => allBatches.filter((b) => (b.farmer_name || "").toLowerCase() === farmerName.toLowerCase()),
    [allBatches, farmerName],
  );
  const activeBatches = useMemo(() => (myBatches.length ? myBatches : allBatches), [myBatches, allBatches]);
  const avg = useMemo(
    () => (activeBatches.length ? Math.round(activeBatches.reduce((a, b) => a + b.trust_score, 0) / activeBatches.length) : 0),
    [activeBatches],
  );
  const pendingRequests = useMemo(() => requests.filter((r) => r.status === "Pending"), [requests]);

  useEffect(() => {
    const urls = photos.map((p) => URL.createObjectURL(p));
    setPhotoPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const handlePhotosSelected = (nextFiles: File[]) => {
    const selected = nextFiles.slice(0, 6);
    setPhotos(selected);
    setHerbDetails(
      selected.map((_, idx) => ({
        herb_name: herbDetails[idx]?.herb_name ?? "",
        quantity: herbDetails[idx]?.quantity ?? "",
        notes: herbDetails[idx]?.notes ?? "",
        photo_index: idx,
      })),
    );
  };

  const updateHerbDetail = (idx: number, key: "herb_name" | "quantity" | "notes", value: string) => {
    setHerbDetails((prev) => prev.map((item, i) => (i === idx ? { ...item, [key]: value } : item)));
  };

  const removePhotoAt = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    setHerbDetails((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((item, i) => ({
          ...item,
          photo_index: i,
        })),
    );
  };

  const closeCameraCapture = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    setCameraOpen(false);
  };

  const openCameraCapture = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      window.alert("Camera is not supported in this browser");
      return;
    }
    if (photos.length >= 6) {
      window.alert("You can capture up to 6 photos only");
      return;
    }
    setCameraError("");
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        await cameraVideoRef.current.play();
      }
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Failed to access camera");
    }
  };

  const capturePhotoFromCamera = () => {
    const video = cameraVideoRef.current;
    if (!video || photos.length >= 6) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    if (!width || !height) return;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `live-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      handlePhotosSelected([...photos, file]);
      if (photos.length + 1 >= 6) closeCameraCapture();
    }, "image/jpeg", 0.92);
  };

  const applyVoiceToForm = (
    translated: { herb?: string; quantity?: number; location?: string; translated?: string },
    target?: { idx: number; field: VoiceField } | null,
  ) => {
    if (translated.location) setLocation(translated.location);
    if (photos.length > 0 && herbDetails.length > 0) {
      const requestedIndex = target?.idx;
      const firstIncompleteIndex = herbDetails.findIndex((item) => !item.herb_name || !item.quantity);
      const idxToUpdate =
        typeof requestedIndex === "number" && requestedIndex >= 0 && requestedIndex < herbDetails.length
          ? requestedIndex
          : firstIncompleteIndex >= 0
            ? firstIncompleteIndex
            : 0;

      setHerbDetails((prev) =>
        prev.map((item, i) =>
          i !== idxToUpdate
            ? item
            : {
                ...item,
                herb_name:
                  target?.field === "quantity" || target?.field === "notes"
                    ? item.herb_name
                    : translated.herb || item.herb_name,
                quantity:
                  target?.field === "herb_name" || target?.field === "notes"
                    ? item.quantity
                    : translated.quantity
                      ? String(translated.quantity)
                      : item.quantity,
                notes:
                  target?.field === "notes" && translated.translated
                    ? translated.translated
                    : item.notes,
              },
        ),
      );
      return;
    }
    if (translated.herb) setHerbName(translated.herb);
    if (translated.quantity) setQuantity(String(translated.quantity));
  };

  const handleSubmitBatch = async () => {
    if (photos.length > 6) return window.alert("You can upload up to 6 photos");
    if (photos.length > 0 && herbDetails.length !== photos.length) {
      return window.alert("Please provide details for each uploaded photo");
    }

    const qty = Number(quantity);
    const itemPayload = (photos.length ? herbDetails : [{ herb_name: herbName, quantity, notes: "", photo_index: -1 }])
      .map((item, idx) => ({
        herb_name: (item.herb_name || "").trim(),
        quantity: Number(item.quantity || 0),
        notes: (item.notes || "").trim(),
        photo_index: photos.length ? idx : -1,
      }));

    if (photos.length === 0 && (!qty || qty <= 0)) {
      return window.alert("Enter a valid quantity");
    }

    if (itemPayload.some((item) => !item.herb_name || item.quantity <= 0)) {
      return window.alert("Each herb must have a name and valid quantity");
    }

    const totalQuantity = itemPayload.reduce((sum, item) => sum + item.quantity, 0);

    try {
      setSubmitting(true);
      const res = await uploadBatch({
        farmer_name: farmerName,
        herb_name: itemPayload[0]?.herb_name || herbName,
        quantity: totalQuantity || qty,
        location,
        photos,
        items: itemPayload,
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

  const handleAddAnother = () => {
    setHerbName("");
    setQuantity("");
    setPhotos([]);
    setPhotoPreviews([]);
    setHerbDetails([]);
    setTab("new");
    requestLocation();
  };


  const requestLocation = () => {
    if (!navigator.geolocation) {
      window.alert("Geolocation is not supported by your browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      },
      () => {
        window.alert("Unable to retrieve your location");
      }
    );
  };

  useEffect(() => {
    if (tab === "new") {
      requestLocation();
    }
  }, [tab]);

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startVoiceInput = async (target?: { idx: number; field: VoiceField }) => {

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) return window.alert("Voice input is not supported in this browser");
    const recognition = new SpeechRecognition();
    recognition.lang = "kn-IN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    setRecording(true);
    setVoiceTarget(target ?? null);
    recognition.onresult = (event: any) => {
      const spoken = event.results?.[0]?.[0]?.transcript || "";
      voiceProcessingRef.current = true;
      void (async () => {
        try {
          // Translate first so the form updates even if voice logging to MongoDB fails.
          const translated = await translateKannada(spoken);
          applyVoiceToForm(translated, target);
          try {
            await submitVoiceInput({
              speech_text: spoken,
              language: "kn-IN",
              location,
            });
          } catch {
            /* optional audit log only */
          }
        } catch (error) {
          window.alert(error instanceof Error ? error.message : "Voice translation failed");
        } finally {
          voiceProcessingRef.current = false;
          setRecording(false);
          setVoiceTarget(null);
        }
      })();
    };
    recognition.onerror = () => {
      voiceProcessingRef.current = false;
      setRecording(false);
      setVoiceTarget(null);
    };
    recognition.onend = () => {
      if (!voiceProcessingRef.current) {
        setRecording(false);
        setVoiceTarget(null);
      }
    };
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
          {pendingRequests.length > 0 && (
            <div className="mb-6 glass rounded-2xl p-5 border border-accent/40 shadow-[0_0_30px_hsl(var(--accent)/0.2)]">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Pending Herb Requests</div>
                <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] text-accent font-semibold">
                  {pendingRequests.length} waiting
                </span>
              </div>
              <div className="space-y-2">
                {pendingRequests.map(req => (
                  <div key={req._id} className="rounded-xl border border-border/40 bg-card/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-semibold">{req.herb} · {req.quantity}</div>
                        <div className="text-xs text-muted-foreground">Request from {req.from_manufacturer_name} · {req.request_date?.slice(0, 10)}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleRequestResponse(req._id, "Accepted")} className="rounded-lg bg-secondary/10 border border-secondary/40 px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-secondary/20 transition-colors">
                          <CircleCheck className="mr-1 inline h-3.5 w-3.5" /> Accept
                        </button>
                        <button onClick={() => handleRequestResponse(req._id, "Rejected")} className="rounded-lg bg-destructive/10 border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors">
                          <CircleX className="mr-1 inline h-3.5 w-3.5" /> Reject
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
            <button onClick={openCameraCapture} className="group relative flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 py-12 transition-all hover:border-primary/60 hover:bg-primary/10">
              <div className="absolute inset-0 rounded-2xl bg-gradient-primary opacity-0 blur-2xl transition-opacity group-hover:opacity-20" />
              <div className="relative grid h-16 w-16 place-items-center rounded-full bg-gradient-primary shadow-[0_0_40px_hsl(var(--primary)/0.5)] animate-float-y">
                <Camera className="h-7 w-7 text-primary-foreground" />
              </div>
              <div className="relative">
                <div className="font-semibold">Upload herb photo</div>
                <div className="text-xs text-muted-foreground">Tap to upload up to 6 images ({photos.length}/6)</div>
              </div>
            </button>

            {photoPreviews.length > 0 && (
              <div className="mt-4 grid gap-3">
                {photoPreviews.map((src, idx) => (
                  <div key={src} className="rounded-xl border border-border/50 bg-card/40 p-3">
                    <div className="flex items-start gap-3">
                      <img src={src} alt={`Upload ${idx + 1}`} className="h-20 w-20 rounded-lg object-cover border border-border/60" />
                      <div className="grid flex-1 gap-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => removePhotoAt(idx)}
                            className="rounded-md border border-destructive/40 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="grid gap-1">
                          <div className="flex items-center gap-2">
                            <input
                              value={herbDetails[idx]?.herb_name ?? ""}
                              onChange={(e) => updateHerbDetail(idx, "herb_name", e.target.value)}
                              className="flex-1 rounded-lg border border-border bg-input/60 px-3 py-2 text-xs"
                              placeholder="Herb name for this photo"
                            />
                            <button
                              type="button"
                              onClick={() => startVoiceInput({ idx, field: "herb_name" })}
                              className="rounded-md border border-primary/40 px-2 py-2 text-[11px] text-primary hover:bg-primary/10 transition-colors"
                              title="Voice fill herb name"
                            >
                              <Mic className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {recording && voiceTarget?.idx === idx && voiceTarget?.field === "herb_name" && (
                            <div className="text-[10px] text-primary">Listening for herb name...</div>
                          )}
                        </div>
                        <div className="grid gap-1">
                          <div className="flex items-center gap-2">
                            <input
                              value={herbDetails[idx]?.quantity ?? ""}
                              onChange={(e) => updateHerbDetail(idx, "quantity", e.target.value)}
                              className="flex-1 rounded-lg border border-border bg-input/60 px-3 py-2 text-xs"
                              placeholder="Quantity for this herb (kg)"
                            />
                            <button
                              type="button"
                              onClick={() => startVoiceInput({ idx, field: "quantity" })}
                              className="rounded-md border border-primary/40 px-2 py-2 text-[11px] text-primary hover:bg-primary/10 transition-colors"
                              title="Voice fill quantity"
                            >
                              <Mic className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {recording && voiceTarget?.idx === idx && voiceTarget?.field === "quantity" && (
                            <div className="text-[10px] text-primary">Listening for quantity...</div>
                          )}
                        </div>
                        <div className="grid gap-1">
                          <div className="flex items-center gap-2">
                            <input
                              value={herbDetails[idx]?.notes ?? ""}
                              onChange={(e) => updateHerbDetail(idx, "notes", e.target.value)}
                              className="flex-1 rounded-lg border border-border bg-input/60 px-3 py-2 text-xs"
                              placeholder="Notes (optional)"
                            />
                            <button
                              type="button"
                              onClick={() => startVoiceInput({ idx, field: "notes" })}
                              className="rounded-md border border-primary/40 px-2 py-2 text-[11px] text-primary hover:bg-primary/10 transition-colors"
                              title="Voice fill notes"
                            >
                              <Mic className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {recording && voiceTarget?.idx === idx && voiceTarget?.field === "notes" && (
                            <div className="text-[10px] text-primary">Listening for notes...</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={startVoiceInput}
                className={`relative flex items-center justify-center gap-2 rounded-xl border px-4 py-4 text-sm transition-all ${
                  recording ? "border-destructive/60 bg-destructive/10 text-destructive animate-[pulse-ring_1.6s_infinite]" : "border-border bg-card/50 hover:border-primary/40"
                }`}>
                <Mic className="h-4 w-4" /> {recording ? "Listening…" : "Voice input"}
              </button>
              <button onClick={requestLocation} className="relative flex items-center gap-2 rounded-xl border border-secondary/40 bg-secondary/5 px-4 py-4 text-sm text-secondary hover:bg-secondary/10 transition-all">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-60" />
                  <MapPin className="relative h-3 w-3" />
                </span>
                GPS locked · {location}
              </button>

            </div>

            <div className="mt-5 grid gap-3">
              {photos.length === 0 && (
                <>
                  <input value={herbName} onChange={(e) => setHerbName(e.target.value)} className="rounded-xl border border-border bg-input/60 px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" placeholder="Herb name (e.g. Ashwagandha)" />
                  <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-xl border border-border bg-input/60 px-4 py-3 text-sm" placeholder="Quantity (kg)" />
                </>
              )}
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
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Trust & Quality Scores</div>
            <div className="mt-4 h-[220px] w-full">
              <Suspense
                fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading chart…</div>}
              >
                <FarmerTrustPieChart
                  qualityScore={lastResult?.quality_score ?? 0}
                  trustScore={lastResult?.trust_score ?? 0}
                />
              </Suspense>
            </div>
            <div className="mt-12 inline-flex items-center gap-1 rounded-full border border-secondary/40 bg-secondary/10 px-3 py-1 text-xs text-secondary">
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
                  <div className="font-mono text-lg font-semibold">
                    {lastResult?._id ?? "--"} · {lastResult?.herb_name ?? herbName}
                  </div>
                  {lastResult && lastResult.verification_match !== undefined && (
                    <div
                      className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold ${
                        lastResult.verification_match === true
                          ? "text-secondary"
                          : lastResult.verification_match === false
                            ? "text-destructive"
                            : "text-amber-400"
                      }`}
                    >
                      {lastResult.verification_match === true ? (
                        <><CheckCircle2 className="h-3 w-3" /> AI verified match</>
                      ) : lastResult.verification_match === false ? (
                        <><CircleX className="h-3 w-3" /> AI detected herb mismatch</>
                      ) : (
                        <><CircleX className="h-3 w-3" /> AI could not verify from photo</>
                      )}
                    </div>
                  )}
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] ${
                    gradeInfo(lastResult?.trust_grade, lastResult?.trust_score).approved
                      ? "border-secondary/40 bg-secondary/10 text-secondary"
                      : "border-destructive/40 bg-destructive/10 text-destructive"
                  }`}
                >
                  {gradeInfo(lastResult?.trust_grade, lastResult?.trust_score).approved ? "Approved" : "Not approved"}
                </span>
              </div>
              <div className="mt-5 space-y-4">
                <ProgressRow label="AI quality score" value={lastResult?.quality_score ?? 0} tone="primary" />
                <ProgressRow label="Geo verification" value={lastResult?.location ? 100 : 40} tone="secondary" suffix="✓ matched" />
                <ProgressRow label="Photo quality signal" value={Math.min(100, (lastResult?.photo_count ?? 0) * 16)} tone="accent" />
              </div>

              {!!lastResult?.photo_urls?.length && (
                <div className="mt-5">
                  <div className="text-xs text-muted-foreground mb-2">Uploaded photos</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {lastResult.photo_urls.map((u, idx) => (
                      <img key={`${u}-${idx}`} src={u} alt={`Uploaded herb ${idx + 1}`} className="h-24 w-full rounded-lg object-cover border border-border/50" />
                    ))}
                  </div>
                </div>
              )}

              {!!lastResult?.herb_items?.length && (
                <div className="mt-5 space-y-2">
                  <div className="text-xs text-muted-foreground">Herb-wise verification</div>
                  {lastResult.herb_items.map((item) => (
                    <div key={item.index} className="rounded-lg border border-border/50 bg-card/30 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span>{item.claimed_herb} → {item.resolved_herb}</span>
                        <span className={item.verification_match === true ? "text-secondary" : item.verification_match === false ? "text-destructive" : "text-amber-400"}>
                          {item.verification_match === true ? "matched" : item.verification_match === false ? "mismatch" : "unverified"}
                        </span>
                      </div>
                      <div className="text-muted-foreground">Qty: {item.quantity} kg {item.notes ? `· ${item.notes}` : ""}</div>
                    </div>
                  ))}
                </div>
              )}
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

            <button onClick={handleAddAnother} className="w-full rounded-xl border border-primary/40 bg-primary/5 py-4 font-semibold text-primary hover:bg-primary/10 transition-all">
              + Add Another Herb Batch
            </button>
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
                      <CircleCheck className="mr-2 inline h-4 w-4" /> Answer
                    </button>
                    <button onClick={() => setShowCall(false)} className="flex-1 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive hover:bg-destructive/20 transition-colors">
                      <CircleX className="mr-2 inline h-4 w-4" /> Decline
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-2xl rounded-2xl border border-primary/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Live Camera Capture ({photos.length}/6)</div>
              <button onClick={closeCameraCapture} className="rounded-md border border-border px-2 py-1 text-xs hover:border-destructive/50">Close</button>
            </div>
            <div className="overflow-hidden rounded-xl border border-border/50 bg-black">
              <video ref={cameraVideoRef} className="h-[360px] w-full object-cover" playsInline muted autoPlay />
            </div>
            {cameraError && <div className="mt-2 text-xs text-destructive">{cameraError}</div>}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={capturePhotoFromCamera}
                disabled={!!cameraError || photos.length >= 6}
                className="flex-1 rounded-lg border border-secondary/40 bg-secondary/20 px-3 py-2 text-sm font-semibold text-secondary hover:bg-secondary/30 disabled:opacity-60"
              >
                Capture Photo
              </button>
              <button
                type="button"
                onClick={closeCameraCapture}
                className="rounded-lg border border-border/60 px-3 py-2 text-sm hover:border-primary/40"
              >
                Done
              </button>
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
