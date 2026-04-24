import { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "primary" | "secondary" | "accent" | "danger";
}

const toneMap = {
  primary: { text: "text-primary", glow: "shadow-[0_0_30px_hsl(var(--primary)/0.25)]", border: "border-primary/30" },
  secondary: { text: "text-secondary", glow: "shadow-[0_0_30px_hsl(var(--secondary)/0.25)]", border: "border-secondary/30" },
  accent: { text: "text-accent", glow: "shadow-[0_0_30px_hsl(var(--accent)/0.3)]", border: "border-accent/30" },
  danger: { text: "text-destructive", glow: "shadow-[0_0_30px_hsl(var(--destructive)/0.35)]", border: "border-destructive/40" },
};

export const StatCard = ({ label, value, hint, icon, tone = "primary" }: Props) => {
  const t = toneMap[tone];
  return (
    <div className={`glass glass-hover relative overflow-hidden rounded-2xl p-5 border ${t.border} ${t.glow}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
          <div className={`mt-2 font-mono text-3xl font-bold ${t.text}`} style={{ textShadow: `0 0 20px currentColor` }}>{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {icon && <div className={`grid h-10 w-10 place-items-center rounded-xl bg-white/5 ${t.text}`}>{icon}</div>}
      </div>
      <div className={`absolute -bottom-px left-4 right-4 h-px bg-gradient-to-r from-transparent via-current to-transparent ${t.text} opacity-60`} />
    </div>
  );
};
