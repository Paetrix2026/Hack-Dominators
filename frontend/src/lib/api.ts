import { getFirebaseAuth } from "@/lib/firebase";

/**
 * Production: default `/api` on the same origin (e.g. ayur-trust.vercel.app) so Vercel can
 * reverse-proxy to Render (see `vercel.json`). That avoids CORS, ad blockers, and some
 * “Failed to fetch” issues from calling onrender.com directly in the browser.
 * Dev: Vite proxies `/api` to your local backend.
 */
const resolveApiBase = (): string => {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim();
  const isDev = import.meta.env.DEV;
  const hostedBackend = "https://hack-dominators.onrender.com";
  if (isDev) {
    if (raw) return raw.replace(/\/+$/, "");
    return "/api";
  }
  if (raw) {
    let u = raw.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    try {
      const { hostname } = new URL(u);
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        return "/api";
      }
    } catch {
      /* ignore */
    }
    return u.replace(/\/+$/, "");
  }
  return hostedBackend;
};

const API_BASE = resolveApiBase();

const networkErrorMessage = () =>
  `Cannot reach the API. Check your network, redeploy Vercel with frontend/vercel.json, and wait for Render to wake if the service was sleeping. (Base: ${API_BASE})`;

const doFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const merged: RequestInit = { mode: "cors", credentials: "omit", cache: "no-store", ...init };
  try {
    return await fetch(url, merged);
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(networkErrorMessage());
    }
    throw e;
  }
};

const getToken = async () => {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Please sign in first.");
  return user.getIdToken();
};

const getClientRole = (): string | null => {
  try {
    const raw = localStorage.getItem("ayurtrust.user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { role?: string };
    return typeof parsed?.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
};

/** Turn FastAPI `detail` (string | object | array) into one user-readable message. */
const formatDetailMessage = (detail: unknown): string | null => {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === "object" && detail[0] !== null && "msg" in detail[0]) {
    return String((detail[0] as { msg: string }).msg);
  }
  if (detail && typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    const base = typeof o.message === "string" ? o.message : null;
    const inv = o.invalid_photos;
    if (Array.isArray(inv) && inv.length > 0) {
      const parts = inv
        .map((row: unknown) => {
          if (!row || typeof row !== "object") return "";
          const r = row as Record<string, unknown>;
          const reason = typeof r.reason === "string" ? r.reason : "";
          const fn = typeof r.filename === "string" ? r.filename : `photo ${r.index ?? ""}`;
          return reason ? `${fn}: ${reason}` : "";
        })
        .filter(Boolean);
      if (parts.length) return [base, parts.join(" ")].filter(Boolean).join(" — ");
    }
    if (base) return base;
  }
  return null;
};

const authedFetch = async (path: string, init: RequestInit = {}) => {
  const token = await getToken();
  const role = getClientRole();
  const res = await doFetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
      ...(role ? { "X-User-Role": role } : {}),
    },
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    if (!res.ok) {
      throw new Error(`Server error (${res.status}): ${text.slice(0, 100) || "Empty response"}`);
    }
  }

  if (!res.ok) {
    const fromDetail = formatDetailMessage(data?.detail);
    throw new Error(fromDetail || data?.message || `Request failed (${res.status})`);
  }
  return data;
};

const readErrorMessage = (data: Record<string, unknown>, status: number): string => {
  const d = data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0] && typeof d[0] === "object" && d[0] !== null && "msg" in d[0]) {
    return String((d[0] as { msg: string }).msg);
  }
  if (typeof data?.message === "string") return data.message;
  return `Request failed (${status})`;
};

/** Batch lookup for QR / consumer path — no Firebase sign-in. */
const publicFetch = async (path: string) => {
  const res = await doFetch(`${API_BASE}${path}`);
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    if (!res.ok) {
      throw new Error(
        text ? `Server returned non-JSON (${res.status}): ${text.slice(0, 160)}` : `Empty response (${res.status})`,
      );
    }
    data = {};
  }
  if (!res.ok) throw new Error(readErrorMessage(data, res.status));
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: string }).error));
  }
  return data;
};

export type ApiBatch = {
  _id: string;
  type?: "herb" | "medicine";
  product_name?: string;
  composition?: Array<{
    herb: string;
    quantity: string;
    farmer: string;
    location: string;
  }>;
  herb_name: string;
  farmer_name: string;
  user_email?: string;
  quantity: number;
  location: string;
  stage: "Collected" | "Processed" | "Manufactured" | "Packaged" | "Ready";
  trust_score: number;
  trust_grade?: string;
  quality_score: number;
  geo_valid?: boolean;
  fraud_flag?: boolean;
  compliance_status?: "PASS" | "FAIL";
  fraud_risk?: string;
  blockchain_hash: string;
  tx_hash: string;
  qr_code?: string;
  dosage?: string;
  warnings?: string[];
  side_effects?: Array<{
    symptoms: string;
    severity: string;
    timestamp: string;
  }>;
  photo_count?: number;
  trust_certificate?: { certificate_id: string; grade: string };
  created_at?: string;
  verification_match?: boolean | null;
  photo_urls?: string[];
  herb_items?: Array<{
    index: number;
    claimed_herb: string;
    resolved_herb: string;
    quantity: number;
    notes?: string;
    photo_index: number;
    photo_url?: string;
    photo_name?: string;
    quality_score?: number;
    verification_match?: boolean | null;
    verified?: boolean;
  }>;
};


export type ApiHerbRequest = {
  _id: string;
  herb: string;
  quantity: string;
  from_manufacturer_name: string;
  to_farmer_name: string;
  status: "Pending" | "Accepted" | "Rejected";
  request_date: string;
  response_reason?: string;
};

export const getBatches = async (): Promise<ApiBatch[]> => {
  const data = await authedFetch("/batch/");
  return data.data || [];
};

export const getBatchById = async (batchId: string): Promise<ApiBatch> => {
  const data = await publicFetch(`/batch/public/${batchId}`);
  return data as ApiBatch;
};

export const uploadBatch = async (input: {
  farmer_name: string;
  herb_name: string;
  quantity: number;
  location: string;
  photos: File[];
  items?: Array<{
    herb_name: string;
    quantity: number;
    notes?: string;
    photo_index: number;
  }>;
}) => {
  const safeName = (value: string) =>
    (value || "herb")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const form = new FormData();
  form.append("farmer_name", input.farmer_name);
  form.append("herb_name", input.herb_name);
  form.append("quantity", String(input.quantity));
  form.append("location", input.location);
  if (input.items?.length) {
    form.append("items", JSON.stringify(input.items));
  }
  input.photos.forEach((p, idx) => {
    const ext = p.name.includes(".") ? p.name.slice(p.name.lastIndexOf(".")) : ".jpg";
    // IMPORTANT: Do not encode claimed herb into the filename.
    // The backend uses visual ML/validation; filenames should not bias classification.
    const renamed = `capture-${idx + 1}${ext}`;
    form.append("photos", p, renamed);
  });
  return authedFetch("/batch/upload", { method: "POST", body: form });
};

export const translateKannada = async (text: string) => {
  return authedFetch("/voice/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
};

export const submitVoiceInput = async (payload: {
  speech_text: string;
  language?: string;
  location?: string;
}) => {
  return authedFetch("/voice/voice-input", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const updateBatchStage = async (
  batchId: string,
  payload: { new_stage: "Collected" | "Processed" | "Manufactured" | "Packaged" | "Ready"; compliance_status: "PASS" | "FAIL" },
) => {
  return authedFetch(`/update-stage/${batchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const reportSideEffect = async (batchId: string, payload: { symptoms: string; severity: string }) => {
  return authedFetch(`/report-side-effect/${batchId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const createMedicine = async (payload: { product_name: string; batch_ids: string[] }) => {
  return authedFetch("/create-medicine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const getIncomingRequests = async (): Promise<ApiHerbRequest[]> => {
  const data = await authedFetch("/batch/requests/incoming");
  return data.data || [];
};

export const getOutgoingRequests = async (): Promise<ApiHerbRequest[]> => {
  const data = await authedFetch("/batch/requests/outgoing");
  return data.data || [];
};

export const respondToRequest = async (requestId: string, decision: "Accepted" | "Rejected", reason: string) => {
  return authedFetch(`/batch/requests/${requestId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, reason }),
  });
};

export const createHerbRequest = async (payload: {
  herb: string;
  quantity: string;
  to_farmer_name: string;
  to_farmer_email?: string;
}) => {
  return authedFetch("/batch/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};
