import { useEffect, useState } from "react";

interface Props { value: number; size?: number; label?: string; }

/** Animated circular trust score gauge with conic neon ring. */
export const TrustGauge = ({ value, size = 180, label = "Trust Score" }: Props) => {
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(value));
    return () => cancelAnimationFrame(id);
  }, [value]);

  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (v / 100) * c;

  const tone =
    value >= 80 ? "hsl(var(--secondary))" :
    value >= 60 ? "hsl(var(--primary))" :
    value >= 40 ? "hsl(var(--warning))" : "hsl(var(--destructive))";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full bg-gradient-trust opacity-20 blur-2xl animate-spin-slow" />
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} stroke="hsl(var(--border))" strokeWidth={stroke} fill="none" />
        <circle
          cx={size/2} cy={size/2} r={r}
          stroke={tone} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.22,1,0.36,1)", filter: `drop-shadow(0 0 12px ${tone})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono text-4xl font-bold" style={{ color: tone, textShadow: `0 0 20px ${tone}` }}>
          {Math.round(v)}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
};
