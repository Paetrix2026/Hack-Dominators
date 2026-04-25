import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

export type Role = "Farmer" | "Manufacturer" | "Consumer";
export type User = { name: string; role: Role; email: string };

type AuthCtx = {
  user: User | null;
  login: (role: Role, name?: string, email?: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);
const KEY = "ayurtrust.user";

const inferNameFromEmail = (email?: string, fallback = "") => {
  if (!email) return fallback;
  const local = email.split("@")[0];
  const cleaned = local
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\d+/g, "")
    .trim();

  if (!cleaned) return fallback;
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
    .trim() || fallback;
};

const defaults: Record<Role, { name: string; email: string }> = {
  Farmer:       { name: "Ravi Kumar",  email: "ravi@ayurtrust.in" },
  Manufacturer: { name: "Anita Shah",  email: "anita@himalaya.co" },
  Consumer:     { name: "Guest User",  email: "guest@ayurtrust.in" },
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
  });

  useEffect(() => {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  }, [user]);

  const login: AuthCtx["login"] = async (role, name, email, password) => {
    const d = defaults[role];
    const resolvedEmail = email?.trim() || d.email;
    const resolvedPassword = password?.trim();

    if (!resolvedPassword) {
      throw new Error("Password is required.");
    }

    await signInWithEmailAndPassword(getFirebaseAuth(), resolvedEmail, resolvedPassword);

    const resolvedName = name?.trim()
      ? name.trim()
      : inferNameFromEmail(resolvedEmail, d.name);
    setUser({ role, name: resolvedName, email: resolvedEmail });
  };
  const logout = async () => {
    await signOut(getFirebaseAuth());
    setUser(null);
  };

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
};

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
};

export const toLoginErrorMessage = (error: unknown) => {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-email":
        return "Invalid email format.";
      case "auth/user-not-found":
      case "auth/invalid-credential":
        return "Invalid email or password.";
      case "auth/wrong-password":
        return "Incorrect password.";
      case "auth/too-many-requests":
        return "Too many attempts. Please try again later.";
      default:
        return "Sign-in failed. Please try again.";
    }
  }

  if (error instanceof Error) return error.message;
  return "Sign-in failed. Please try again.";
};
