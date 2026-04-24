import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Leaf, Sprout, Factory, ScanLine, Mail, Lock, ArrowRight, X } from "lucide-react";
import { Role, toLoginErrorMessage, useAuth } from "@/lib/auth";

const roles: { value: Role; icon: React.ComponentType<{ className?: string }>; tone: string; tint: string }[] = [
  { value: "Farmer",       icon: Sprout,   tone: "secondary", tint: "from-secondary to-primary" },
  { value: "Manufacturer", icon: Factory,  tone: "primary",   tint: "from-primary to-accent" },
  { value: "Consumer",     icon: ScanLine, tone: "accent",    tint: "from-accent to-primary" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  defaultRole?: Role;
}

export const LoginModal = ({ open, onClose, defaultRole = "Farmer" }: Props) => {
  const { login } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState<Role>(defaultRole);
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [name, setName] = useState("");

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(role, name || undefined, email || undefined, pwd);
      onClose();
      nav(`/${role.toLowerCase()}`);
    } catch (error) {
      window.alert(toLoginErrorMessage(error));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in-up" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md glass rounded-3xl border border-primary/30 shadow-[0_0_60px_hsl(var(--primary)/0.3)] p-6">
        <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors" aria-label="Close">
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.5)]">
            <Leaf className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold">Welcome back</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">AyurTrust portal</div>
          </div>
        </div>

        {/* Role picker */}
        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Sign in as</div>
          <div className="grid grid-cols-3 gap-2">
            {roles.map(r => {
              const I = r.icon;
              const active = role === r.value;
              return (
                <button key={r.value} type="button" onClick={() => setRole(r.value)}
                  className={`group relative overflow-hidden rounded-xl border p-3 text-center transition-all ${
                    active
                      ? `border-${r.tone}/60 bg-${r.tone}/10 shadow-[0_0_24px_hsl(var(--${r.tone})/0.35)]`
                      : "border-border/60 hover:border-primary/40"
                  }`}>
                  {active && <div className={`absolute -top-10 left-1/2 h-20 w-20 -translate-x-1/2 rounded-full bg-gradient-to-br ${r.tint} opacity-30 blur-2xl`} />}
                  <I className={`relative mx-auto h-5 w-5 ${active ? `text-${r.tone}` : "text-muted-foreground"}`} />
                  <div className={`relative mt-1.5 text-[11px] font-medium ${active ? "" : "text-muted-foreground"}`}>{r.value}</div>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <Field icon={<Mail className="h-4 w-4" />} type="email" placeholder="you@ayurtrust.in" value={email} onChange={setEmail} />
          <Field icon={<Lock className="h-4 w-4" />} type="password" placeholder="Password" value={pwd} onChange={setPwd} />
          <input
            value={name} onChange={e => setName(e.target.value)} placeholder="Display name (optional)"
            className="w-full rounded-xl border border-border bg-input/60 px-4 py-3 text-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />

          <button type="submit"
            className="relative mt-1 w-full overflow-hidden rounded-xl bg-gradient-primary px-6 py-3.5 font-semibold text-primary-foreground shadow-[0_0_30px_hsl(var(--primary)/0.5)] hover:scale-[1.01] transition-transform">
            <span className="relative z-10 inline-flex items-center justify-center gap-2">
              Enter portal <ArrowRight className="h-4 w-4" />
            </span>
            <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent,hsl(0_0%_100%/0.3),transparent)] bg-[length:200%_100%] animate-shimmer" />
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
          <button type="button" className="hover:text-primary transition-colors">Forgot password?</button>
          <button type="button" className="hover:text-primary transition-colors">Create account →</button>
        </div>

        <div className="mt-4 rounded-lg border border-dashed border-border/60 bg-card/40 p-2.5 text-[10px] text-muted-foreground text-center">
          Demo mode · any credentials work
        </div>
      </div>
    </div>
  );
};

const Field = ({ icon, type, placeholder, value, onChange }: { icon: ReactNode; type: string; placeholder: string; value: string; onChange: (v: string) => void }) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
    <input
      type={type} required value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-xl border border-border bg-input/60 py-3 pl-10 pr-3 text-sm focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
    />
  </div>
);

// re-import for type below
import type { ReactNode } from "react";
