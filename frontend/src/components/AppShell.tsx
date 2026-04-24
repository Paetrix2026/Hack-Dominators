import { Link, useLocation, useNavigate } from "react-router-dom";
import { Leaf, Bell, LogOut } from "lucide-react";
import { Particles } from "./Particles";
import { ReactNode } from "react";
import { useAuth } from "@/lib/auth";

interface NavItem { label: string; to: string; icon: React.ComponentType<{ className?: string }>; }

interface Props {
  role: "Farmer" | "Manufacturer" | "Consumer";
  nav: NavItem[];
  children: ReactNode;
}

export const AppShell = ({ role, nav, children }: Props) => {
  const loc = useLocation();
  const nav2 = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => { logout(); nav2("/"); };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none fixed -left-40 top-20 h-96 w-96 rounded-full bg-primary/20 blur-[120px] animate-drift" />
      <div className="pointer-events-none fixed -right-40 bottom-20 h-96 w-96 rounded-full bg-accent/20 blur-[120px] animate-drift" style={{ animationDelay: "4s" }} />
      <div className="pointer-events-none fixed inset-0"><Particles density={35} /></div>

      <div className="relative flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden md:flex w-64 flex-col border-r border-border/50 bg-background/40 backdrop-blur-xl">
          <Link to="/" className="flex items-center gap-2 px-6 py-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-gradient-primary blur-md opacity-70" />
              <div className="relative grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary text-primary-foreground">
                <Leaf className="h-5 w-5" />
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide">AyurTrust</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Chain</div>
            </div>
          </Link>

          <div className="px-4 mb-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{role} portal</div>
          <nav className="flex-1 px-3 space-y-1">
            {nav.map((n) => {
              const active = loc.pathname === n.to;
              const Icon = n.icon;
              return (
                <Link key={n.to} to={n.to}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                    active ? "bg-primary/10 text-primary border border-primary/30 shadow-[0_0_20px_hsl(var(--primary)/0.25)]" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}>
                  <Icon className={`h-4 w-4 ${active ? "drop-shadow-[0_0_6px_hsl(var(--primary))]" : ""}`} />
                  <span>{n.label}</span>
                </Link>
              );
            })}
          </nav>
          {user && (
            <div className="mx-3 mb-3 rounded-xl border border-border/50 bg-card/50 p-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-accent text-xs font-bold text-accent-foreground">{user.name[0]}</div>
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-xs font-semibold">{user.name}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{user.email}</div>
                </div>
              </div>
            </div>
          )}
          <button onClick={handleLogout} className="mx-3 mb-4 flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5 text-sm text-muted-foreground hover:text-destructive hover:border-destructive/50 hover:bg-destructive/10 transition-colors">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/50 bg-background/40 px-4 md:px-8 py-4 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-secondary/40 bg-secondary/10 px-3 py-1 text-[11px] font-medium text-secondary">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-secondary" />
                </span>
                Chain online
              </span>
              <span className="hidden sm:inline text-xs text-muted-foreground font-mono">block #482,931</span>
            </div>
            <div className="flex items-center gap-3">
              <button className="relative grid h-9 w-9 place-items-center rounded-full border border-border/60 hover:border-primary/50 transition-colors">
                <Bell className="h-4 w-4" />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
              </button>
              <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-2 py-1 pr-3">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-accent text-xs font-bold text-accent-foreground">
                  {(user?.name?.[0] ?? role[0])}
                </div>
                <div className="hidden sm:block leading-tight">
                  <div className="text-xs font-semibold">{user?.name ?? role}</div>
                  <div className="text-[10px] text-muted-foreground">{role.toLowerCase()} · verified</div>
                </div>
              </div>
              <button onClick={handleLogout} className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors" title="Sign out">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </header>

          <div className="px-4 md:px-8 py-6 md:py-8 animate-fade-in-up">{children}</div>
        </main>
      </div>
    </div>
  );
};
