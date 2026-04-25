import { getFirebaseAuth } from "@/lib/firebase";

const DEFAULT_PROD_API = "https://ayurtrust-1.onrender.com";

/** Never use a localhost / 127.0.0.1 base on the public site — it causes “Failed to fetch” on every device. */
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
        return DEFAULT_PROD_API;
      }
    } catch {
      /* ignore; return u below */
    }
    return u.replace(/\/+$/, "");
  }
  return DEFAULT_PROD_API;
};

const API_BASE = resolveApiBase();

const networkErrorMessage = () =>
  `Cannot reach the server (${API_BASE}). In Vercel, set VITE_API_BASE_URL to https://ayurtrust-1.onrender.com (or your API URL), redeploy, and open the Render service so it is not stopped.`;

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

/** Batch lookup for QR / consumer path — no Firebase sign-in. */
const publicFetch = async (path: string) => {
  const res = await doFetch(`${API_BASE}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || data?.message || "Request failed");
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
