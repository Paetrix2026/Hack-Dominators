import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Object.values(firebaseConfig).every((v) => Boolean(v));
}

let cachedAuth: Auth | null = null;

/** Lazily initializes Firebase so missing Vercel env vars do not crash the whole app at import time. */
export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase env vars are missing. In Vercel: Project → Settings → Environment Variables, add VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID (copy from your Firebase project / local .env), then redeploy."
    );
  }
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  cachedAuth = getAuth(app);
  return cachedAuth;
}
