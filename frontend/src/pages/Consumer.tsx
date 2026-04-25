import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { TrustGauge } from "@/components/TrustGauge";
import { ScanLine, Sparkles, Package, Shield, ChevronLeft, ChevronRight, MapPin, Leaf, Factory, Truck, CheckCircle2, Link2 } from "lucide-react";
import jsQR from "jsqr";
import { ApiBatch, getBatchById } from "@/lib/api";

const nav = [
  { label: "Scan", to: "/consumer", icon: ScanLine },
  { label: "Story", to: "/consumer/story", icon: Sparkles },
  { label: "Verify", to: "/consumer/verify", icon: Shield },
  { label: "Product", to: "/consumer/product", icon: Package },
];

type View = "scan" | "story" | "verify" | "product";

const Consumer = () => {
  const loc = useLocation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const [view, setView] = useState<View>("scan");
  const [slide, setSlide] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [verified, setVerified] = useState(false);
  const [scanStatus, setScanStatus] = useState("Ready to scan.");
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [batch, setBatch] = useState<ApiBatch | null>(null);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [nearbyFarmer, setNearbyFarmer] = useState("Ravi Kumar");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const getLocationLabel = () => {
    if (location) return `${location.lat.toFixed(4)}° N, ${location.lon.toFixed(4)}° E`;
    if (locationError) return locationError;
    return "Finding your location…";
  };

  const findNearbyFarmer = (lat: number, lon: number) => {
    if (lat >= 8 && lat <= 12 && lon >= 74 && lon <= 78) return "Ravi Kumar";
    if (lat >= 11 && lat <= 18 && lon >= 74 && lon <= 78) return "Lakshmi N.";
    if (lat >= 8 && lat <= 13 && lon >= 76 && lon <= 80) return "Mohan Rao";
    if (lat >= 13 && lat <= 19 && lon >= 78 && lon <= 86) return "Suresh P.";
    if (lat >= 16 && lat <= 22 && lon >= 72 && lon <= 80) return "Anita Devi";
    return "Local farmer";
  };

  const parseBatchId = (value: string) => {
    // QR encodes batch view URL, e.g. https://ayurtrust-1.onrender.com/batch/view/<id>
    const m = value.match(/\/batch\/view\/([a-f0-9]{10,})/i);
    if (m?.[1]) return m[1];
    // also support raw id
    if (/^[a-f0-9]{10,}$/i.test(value.trim())) return value.trim();
    return null;
  };

  const handleScanResult = async (value: string) => {
    setScanResult(value);
    setScanStatus("QR code detected. Fetching batch…");
    setScanning(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    const batchId = parseBatchId(value);
    if (!batchId) {
      setScanStatus("QR read, but batch id not recognized.");
      return;
    }

    try {
      const b = await getBatchById(batchId);
      setBatch(b);
      setScanStatus("Batch loaded.");
      setView("story");
    } catch (e) {
      setBatch(null);
      setScanStatus(e instanceof Error ? e.message : "Failed to load batch data.");
    }
  };

  const decodeFromCanvas = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
    return code?.data ?? null;
  };

  const decodeImage = async (source: ImageBitmap | HTMLVideoElement | HTMLImageElement) => {
    // Try native BarcodeDetector first (fast when it works), fallback to jsQR (reliable).
    try {
      if (typeof window !== "undefined" && (window as any).BarcodeDetector) {
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        const results = await detector.detect(source);
        const v = results[0]?.rawValue ?? null;
        if (v) return v;
      }
    } catch {
      // ignore; fallback below
    }

    // jsQR fallback
    const canvas = canvasRef.current || document.createElement("canvas");
    canvasRef.current = canvas;

    const w =
      source instanceof HTMLVideoElement
        ? (source.videoWidth || 0)
        : "width" in source
          ? (source as any).width
          : 0;
    const h =
      source instanceof HTMLVideoElement
        ? (source.videoHeight || 0)
        : "height" in source
          ? (source as any).height
          : 0;

    if (!w || !h) return null;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source as any, 0, 0, w, h);
    return decodeFromCanvas(canvas);
  };

  /** iOS / older Safari: createImageBitmap can fail (e.g. HEIC); use Image + canvas fallback. */
  const imageForDecode = (file: File): Promise<CanvasImageSource> => {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(file).catch(() => loadFileAsImageElement(file));
    }
    return loadFileAsImageElement(file);
  };

  const loadFileAsImageElement = (file: File) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image load failed"));
      };
      img.src = url;
    });

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setScanStatus("Reading uploaded image...");
    try {
      const source = await imageForDecode(file);
      const result = await decodeImage(source);
      if (result) await handleScanResult(result);
      else setScanStatus("Could not read QR code from image. Try a clearer photo (JPG/PNG) or better lighting.");
    } catch (err) {
      const m = err instanceof Error ? err.message : "";
      setScanStatus(
        m ? `Upload failed: ${m}` : "Upload failed. On iPhone, use Photos; avoid Live Photos if the QR is small.",
      );
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const startCameraScan = async () => {
    const m = (navigator as Navigator & { webkitGetUserMedia?: unknown }).mediaDevices;
    if (!m?.getUserMedia) {
      setScanStatus("Camera is not available (try Safari/Chrome, or a normal browser — not in-app).");
      return;
    }

    setScanStatus("Requesting camera permission…");
    try {
      setVerified(false);
      setBatch(null);
      setScanResult(null);

      // stop any previous stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      // Ensure the <video> element is mounted before attaching stream.
      scanningRef.current = true;
      setScanning(true);
      // Double rAF helps iOS mount the video before attach
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const ask = (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints);

      let stream: MediaStream;
      try {
        stream = await ask({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (first) {
        try {
          stream = await ask({ video: { facingMode: { ideal: "environment" } }, audio: false });
        } catch {
          // Many phones: avoid OverconstrainedError
          stream = await ask({ video: true, audio: false });
        }
      }
      streamRef.current = stream;
      if (!videoRef.current) throw new Error("Video element not ready");

      const v = videoRef.current;
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "true");
      v.muted = true;
      v.playsInline = true;
      v.srcObject = stream;

      // Wait for metadata so videoWidth/videoHeight are non-zero
      await new Promise<void>(resolve => {
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          v.removeEventListener("loadedmetadata", done);
          v.removeEventListener("canplay", done);
          resolve();
        };
        v.addEventListener("loadedmetadata", done);
        v.addEventListener("canplay", done);
        if (v.readyState >= 1) done();
      });

      try {
        await v.play();
      } catch {
        setScanStatus("Tap the preview once if the camera stays black, then point at the QR code.");
        try {
          await v.play();
        } catch {
          /* user may need to interact; stream is still attached */
        }
      }
      setScanStatus("Point the camera at a QR code.");

      const scanLoop = async () => {
        if (!videoRef.current || !scanningRef.current) return;
        const result = await decodeImage(videoRef.current);
        if (result) {
          handleScanResult(result);
          return;
        }
        requestAnimationFrame(scanLoop);
      };

      scanLoop();
    } catch (e) {
      const name = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : "";
      const hint =
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Enable Camera in browser/site settings."
          : name === "OverconstrainedError"
            ? "Tried a simpler camera mode; see previous message."
            : "Use HTTPS, open the site in Safari/Chrome (not Instagram/WhatsApp in-app).";
      const msg = e instanceof Error ? e.message : "unknown";
      setScanStatus(`Camera error: ${name || msg}. ${hint}`);
      stopCameraScan();
    }
  };

  const stopCameraScan = () => {
    setScanning(false);
    setScanStatus("Camera scan stopped.");
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    const path = loc.pathname.replace("/consumer", "");
    if (path.startsWith("/story")) setView("story");
    else if (path.startsWith("/verify")) setView("verify");
    else if (path.startsWith("/product")) setView("product");
    else setView("scan");
    setSlide(0);
  }, [loc.pathname]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        setLocation({ lat: latitude, lon: longitude });
        setNearbyFarmer(findNearbyFarmer(latitude, longitude));
      },
      error => setLocationError(error.message),
      { enableHighAccuracy: true, timeout: 10000 },
    );

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const farmerName = batch?.farmer_name || nearbyFarmer;
  const farmerInitials = farmerName
    .split(" ")
    .map(word => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const locationLabel = getLocationLabel();
  const farmerLabel = farmerName || "Local farmer";
  const herbLabel = batch?.herb_name || "—";
  const trustLabel = batch?.trust_score ?? 0;
  const txLabel = batch?.tx_hash || "N/A";
  const stageLabel = batch?.stage || "Collected";

  const slides = [
    {
      title: "Meet your farmer",
      sub: `${farmerLabel} · ${batch?.location ?? locationLabel}`,
      body: (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-secondary text-secondary-foreground font-bold text-xl">{farmerInitials}</div>
            <div>
              <div className="font-semibold">{farmerLabel}</div>
              <div className="text-xs text-muted-foreground">{batch ? `Batch: ${herbLabel}` : "Live location detected"}</div>
            </div>
          </div>
          <div className="relative h-40 overflow-hidden rounded-xl border border-border/60 bg-card/40">
            <div className="absolute inset-0 grid-bg opacity-60" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <span className="relative flex h-4 w-4">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-4 w-4 rounded-full bg-primary shadow-[0_0_20px_hsl(var(--primary))]" />
              </span>
            </div>
            <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-[11px] backdrop-blur">
              <MapPin className="h-3 w-3 text-primary" /> {locationLabel}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Supply journey",
      sub: `Stage: ${stageLabel}`,
      body: (
        <div className="space-y-3">
          {[
            { i: Leaf, t: "Collected", d: batch ? `${herbLabel} · ${batch.location}` : "Collected", c: "secondary" },
            { i: Truck, t: "Processed", d: "Quality & geo validated", c: "primary" },
            { i: Factory, t: "Manufactured", d: "Stage updated by manufacturer", c: "accent" },
            { i: Package, t: "Packaged", d: "Ready for consumer", c: "secondary" },
          ].map(({ i: I, t, d, c }, idx) => (
            <div key={t} className="flex items-center gap-3 animate-fade-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
              <div className={`grid h-9 w-9 place-items-center rounded-lg bg-${c}/10 text-${c} border border-${c}/30`}><I className="h-4 w-4" /></div>
              <div className="flex-1">
                <div className="text-sm font-medium">{t}</div>
                <div className="text-[11px] text-muted-foreground">{d}</div>
              </div>
              <CheckCircle2 className="h-4 w-4 text-secondary" />
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "AI quality insights",
      sub: "Every herb, computer-vision graded",
      body: (
        <div className="space-y-4">
          {[
            ["AI quality score", batch?.quality_score ?? 0, "primary"],
            ["Trust score", batch?.trust_score ?? 0, "secondary"],
            ["Photos used", Math.min(100, (batch?.photo_count ?? 0) * 16), "accent"],
            ["Geo verification", batch?.location ? 100 : 40, "secondary"],
          ].map(([l, v, c], i) => (
            <div key={l as string} style={{ animationDelay: `${i*120}ms` }} className="animate-fade-in-up">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">{l}</span>
                <span className={`font-mono font-bold text-${c}`} style={{ textShadow: "0 0 8px currentColor" }}>{v}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-[width] duration-1000 ease-out"
                  style={{ width: `${v}%`, background: `hsl(var(--${c}))`, boxShadow: `0 0 12px hsl(var(--${c}))` }} />
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Trust Score",
      sub: "The final verdict, on-chain",
      body: (
        <div className="flex flex-col items-center py-4">
          <TrustGauge value={trustLabel} size={240} label={batch?.trust_grade ?? "Verified"} />
          <div className="mt-4 text-sm text-muted-foreground font-mono">{batch?._id ? `Batch ${batch._id}` : "Scan a batch to view details"}</div>
        </div>
      ),
    },
  ];

  // Note: we do NOT auto-advance. We only move to Story after a real QR decode.

  return (
    <AppShell role="Consumer" nav={nav}>
      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(["scan","story","verify","product"] as const).map(k => (
          <button key={k} onClick={() => { setView(k); setSlide(0); }}
            className={`rounded-full px-4 py-1.5 text-sm capitalize transition-all ${view===k ? "bg-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.5)]" : "border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>{k}</button>
        ))}
      </div>

      {view === "scan" && (
        <div className="mx-auto max-w-md">
          <div className="text-center mb-4">
            <h1 className="text-2xl font-bold">Scan QR on pack</h1>
            <p className="mt-1 text-xs text-muted-foreground">Use your camera or upload a QR image</p>
          </div>

          <div className="relative aspect-square overflow-hidden rounded-3xl border border-primary/40 bg-background/60 shadow-[0_0_60px_hsl(var(--primary)/0.3)]">
            <div className="absolute inset-0 grid-bg opacity-50" />
            <div className="absolute inset-8 rounded-2xl border-2 border-primary/60">
              <span className="absolute -top-1 -left-1 h-6 w-6 border-t-2 border-l-2 border-primary" />
              <span className="absolute -top-1 -right-1 h-6 w-6 border-t-2 border-r-2 border-primary" />
              <span className="absolute -bottom-1 -left-1 h-6 w-6 border-b-2 border-l-2 border-primary" />
              <span className="absolute -bottom-1 -right-1 h-6 w-6 border-b-2 border-r-2 border-primary" />
              <div className="absolute inset-0 overflow-hidden">
                <video
                  ref={videoRef}
                  className={`h-full w-full object-cover transition-opacity ${scanning ? "opacity-100" : "opacity-0"}`}
                  muted
                  playsInline
                />
                {!scanning && <div className="absolute inset-0 bg-background/80" />}
                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_20px_hsl(var(--primary))] animate-[scan_2s_linear_infinite]" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center text-[11px] uppercase tracking-[0.3em] text-primary/70">
                {scanning ? "decoding…" : "align QR here"}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            <button type="button" onClick={() => (scanning ? stopCameraScan() : startCameraScan())}
              className="w-full rounded-xl bg-gradient-primary px-6 py-4 text-sm font-semibold text-primary-foreground shadow-[0_0_40px_hsl(var(--primary)/0.5)] hover:scale-[1.01] transition-transform">
              {scanning ? "Stop camera" : "Open camera"}
            </button>
            <button type="button" onClick={() => inputRef.current?.click()}
              className="w-full rounded-xl border border-border/60 bg-card/80 px-6 py-4 text-sm font-semibold text-foreground hover:border-primary/40 transition-colors">
              Upload QR image
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.heic,.heif"
              onChange={handleUpload}
              className="sr-only"
              tabIndex={-1}
            />
            <div className="rounded-2xl border border-border/50 bg-card/50 p-3 text-xs text-muted-foreground">
              <div>{scanStatus}</div>
              <div className="mt-2">Location: {locationLabel}</div>
              <div>Detected farmer: {nearbyFarmer}</div>
              {scanResult && <div className="mt-2 font-semibold text-foreground">QR result: {scanResult}</div>}
            </div>
          </div>
        </div>
      )}

      {view === "story" && (
        <div className="mx-auto max-w-md">
          {/* progress bars */}
          <div className="mb-4 grid grid-cols-4 gap-1.5">
            {slides.map((_, i) => (
              <div key={i} className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-gradient-primary transition-all duration-500" style={{ width: i <= slide ? "100%" : "0%", boxShadow: "0 0 8px hsl(var(--primary))" }} />
              </div>
            ))}
          </div>
          <div key={slide} className="glass rounded-3xl p-6 border border-primary/30 animate-fade-in-up min-h-[420px]">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{slides[slide].sub}</div>
            <h2 className="mt-1 text-2xl font-bold bg-gradient-to-r from-secondary via-primary to-accent bg-clip-text text-transparent">{slides[slide].title}</h2>
            <div className="mt-5">{slides[slide].body}</div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0}
              className="grid h-10 w-10 place-items-center rounded-full border border-border/60 disabled:opacity-30 hover:border-primary/40"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-xs text-muted-foreground font-mono">{slide + 1} / {slides.length}</span>
            <button onClick={() => setSlide(s => Math.min(slides.length - 1, s + 1))} disabled={slide === slides.length - 1}
              className="grid h-10 w-10 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.5)] disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {view === "verify" && (
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-bold">Blockchain verification</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cryptographic proof of authenticity</p>
          <div className="glass rounded-3xl p-8 mt-6 border border-accent/40 shadow-[0_0_60px_hsl(var(--accent)/0.25)]">
            <div className={`relative mx-auto grid h-24 w-24 place-items-center rounded-full ${verified ? "bg-gradient-secondary" : "bg-gradient-accent"} text-background animate-glow-pulse`}>
              {verified ? <CheckCircle2 className="h-10 w-10" /> : <Shield className="h-10 w-10" />}
            </div>
            <div className="mt-5 text-sm text-muted-foreground">Transaction</div>
            <div className="font-mono text-sm">{txLabel}</div>
            {verified && (
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-secondary/40 bg-secondary/10 px-3 py-1.5 text-xs text-secondary animate-fade-in-up">
                <CheckCircle2 className="h-3.5 w-3.5" /> Verified on AyurTrust mainnet
              </div>
            )}
            <button onClick={() => setVerified(true)} disabled={verified}
              className="relative overflow-hidden mt-6 w-full rounded-xl bg-gradient-accent px-6 py-3.5 font-semibold text-accent-foreground shadow-[0_0_40px_hsl(var(--accent)/0.5)] disabled:opacity-60 hover:scale-[1.01] transition-transform">
              <span className="relative z-10 inline-flex items-center gap-2"><Link2 className="h-4 w-4" /> {verified ? "Authenticated" : "Verify on-chain"}</span>
              {!verified && <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent,hsl(0_0%_100%/0.3),transparent)] bg-[length:200%_100%] animate-shimmer" />}
            </button>
          </div>
        </div>
      )}

      {view === "product" && (
        <div className="mx-auto max-w-2xl">
          <div className="glass rounded-3xl p-6 border border-border/60">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">AyurTrust Verified</div>
                <h1 className="mt-1 text-3xl font-bold">{batch ? `${batch.herb_name} · ${batch.quantity} kg` : "Scan a QR to load product"}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{batch ? `Origin: ${batch.location}` : "Single-origin · verified batch"}</p>
              </div>
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-secondary text-secondary-foreground"><Leaf className="h-7 w-7" /></div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["Stage", stageLabel],
                ["Trust grade", batch?.trust_grade ?? "—"],
                ["Origin", batch?.location ?? "—"],
                ["Batch", batch?._id ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-border/40 bg-card/40 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
                  <div className="mt-0.5 text-sm font-medium">{v}</div>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Certifications</div>
              <div className="flex flex-wrap gap-2">
                {["USDA Organic", "AYUSH Premium", "ISO 22000", "Fair Trade"].map(c => (
                  <span key={c} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] text-primary">
                    <CheckCircle2 className="h-3 w-3" /> {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default Consumer;
