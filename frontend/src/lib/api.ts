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
      if (hostname.endsWith("onrender.com")) {
        return "/api";
      }
    } catch {
      /* ignore */
    }
    return u.replace(/\/+$/, "");
  }
  return "/api";
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

const authedFetch = async (path: string, init: RequestInit = {}) => {
  const token = await getToken();
  const res = await doFetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || data?.message || "Request failed");
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
  herb_name: string;
  farmer_name: string;
  user_email?: string;
  quantity: number;
  location: string;
  stage: "Collected" | "Processed" | "Manufactured" | "Packaged" | "Ready";
  trust_score: number;
  trust_grade?: string;
  quality_score: number;
  fraud_risk?: string;
  blockchain_hash: string;
  tx_hash: string;
  photo_count?: number;
  trust_certificate?: { certificate_id: string; grade: string };
  created_at?: string;
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
}) => {
  const form = new FormData();
  form.append("farmer_name", input.farmer_name);
  form.append("herb_name", input.herb_name);
  form.append("quantity", String(input.quantity));
  form.append("location", input.location);
  input.photos.forEach((p) => form.append("photos", p));
  return authedFetch("/batch/upload", { method: "POST", body: form });
};

export const translateKannada = async (text: string) => {
  return authedFetch("/voice/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
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
