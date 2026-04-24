import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sprout, Factory, ScanLine, ShieldCheck, Cpu, Link2, LogIn, LogOut } from "lucide-react";
import { Particles } from "@/components/Particles";
import { LoginModal } from "@/components/LoginModal";
import { Role, useAuth } from "@/lib/auth";

const roles: { role: Role; icon: React.ComponentType<{ className?: string }>; title: string; desc: string; accent: string; glow: string; border: string }[] = [
  {
    role: "Farmer",
    icon: Sprout,
    title: "Farmer",
    desc: "Log batches by voice or photo. Auto GPS, AI quality, instant trust score.",
    accent: "from-secondary to-primary",
    glow: "shadow-[0_0_60px_hsl(var(--secondary)/0.4)]",
    border: "border-secondary/40",
  },
  {
    role: "Manufacturer",
    icon: Factory,
    title: "Manufacturer",
    desc: "Monitor batches, fraud alerts, and on-chain stages across your supply.",
    accent: "from-primary to-accent",
    glow: "shadow-[0_0_60px_hsl(var(--primary)/0.4)]",
    border: "border-primary/40",
  },
  {
    role: "Consumer",
    icon: ScanLine,
    title: "Consumer",
    desc: "Scan a QR. Watch the herb's full journey verified on the blockchain.",
    accent: "from-accent to-primary",
    glow: "shadow-[0_0_60px_hsl(var(--accent)/0.4)]",
    border: "border-accent/40",
  },
];

const Index = () => {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [openLogin, setOpenLogin] = useState(false);
  const [defaultRole, setDefaultRole] = useState<Role>("Farmer");

  const handleEnter = (role: Role) => {
    if (user?.role === role) { nav(`/${role.toLowerCase()}`); return; }
    setDefaultRole(role);
    setOpenLogin(true);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-accent/20 blur-[140px]" />
      <Particles density={70} />

      <header className="relative z-10 flex items-center justify-between gap-3 px-6 md:px-10 py-6">
        <div>
          <div className="text-base font-semibold tracking-wide">AyurTrust</div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Chain</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary animate-pulse" />
            Mainnet
          </span>
          {user ? (
            <div className="flex items-center gap-2">
              <button onClick={() => nav(`/${user.role.toLowerCase()}`)}
                className="hidden sm:inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/20 transition-colors">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-primary text-[10px] font-bold text-primary-foreground">{user.name[0]}</span>
                {user.name}
              </button>
              <button onClick={logout}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs hover:border-destructive/50 hover:text-destructive transition-colors">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          ) : (
            <button onClick={() => setOpenLogin(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/0.4)] hover:scale-[1.03] transition-transform">
              <LogIn className="h-3.5 w-3.5" /> Sign in
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pt-12 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs text-primary backdrop-blur-md animate-fade-in-up">
          <Cpu className="h-3.5 w-3.5" />
          AI quality scoring
          <span className="text-border">•</span>
          <Link2 className="h-3.5 w-3.5" />
          On-chain provenance
        </div>

        <h1 className="mt-6 text-5xl md:text-7xl font-bold tracking-tight animate-fade-in-up" style={{ animationDelay: "80ms" }}>
          From <span className="bg-gradient-to-r from-secondary via-primary to-accent bg-clip-text text-transparent">soil to shelf</span>,
          <br /> verified at every step.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground animate-fade-in-up" style={{ animationDelay: "160ms" }}>
          AyurTrust Chain pairs computer vision with an immutable ledger so every Ayurvedic herb carries a tamper-proof story — from the farmer's hand to your cup.
        </p>

        <div className="mx-auto mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r, i) => {
            const Icon = r.icon;
            const isMine = user?.role === r.role;
            return (
              <button key={r.role} onClick={() => handleEnter(r.role)}
                className={`glass glass-hover group relative overflow-hidden rounded-2xl border p-6 text-left animate-fade-in-up ${r.border}`}
                style={{ animationDelay: `${240 + i * 80}ms` }}>
                <div className={`absolute -top-20 -right-20 h-48 w-48 rounded-full bg-gradient-to-br ${r.accent} opacity-20 blur-3xl transition-opacity group-hover:opacity-40`} />
                <div className={`relative grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br ${r.accent} ${r.glow}`}>
                  <Icon className="h-7 w-7 text-background" />
                </div>
                <h3 className="mt-5 text-xl font-semibold flex items-center gap-2">
                  {r.title}
                  {isMine && <span className="rounded-full border border-secondary/40 bg-secondary/10 px-2 py-0.5 text-[10px] font-medium text-secondary">signed in</span>}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{r.desc}</p>
                <div className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {isMine ? "Open portal" : "Sign in →"}
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-3 gap-4 text-left animate-fade-in-up" style={{ animationDelay: "560ms" }}>
          {[
            { k: "12,481", v: "Batches verified", i: ShieldCheck },
            { k: "98.2%", v: "AI accuracy", i: Cpu },
            { k: "342", v: "Connected farms", i: Sprout },
          ].map(({ k, v, i: I }) => (
            <div key={v} className="glass rounded-xl p-4">
              <I className="h-4 w-4 text-primary" />
              <div className="mt-2 font-mono text-2xl font-bold neon-text-primary">{k}</div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{v}</div>
            </div>
          ))}
        </div>
      </main>

      <LoginModal open={openLogin} onClose={() => setOpenLogin(false)} defaultRole={defaultRole} />
    </div>
  );
};

export default Index;
