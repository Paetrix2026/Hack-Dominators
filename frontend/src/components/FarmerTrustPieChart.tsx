import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

type Props = {
  qualityScore: number;
  trustScore: number;
};

export default function FarmerTrustPieChart({ qualityScore, trustScore }: Props) {
  return (
    <>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={[
              { name: "Quality", value: qualityScore },
              { name: "Trust", value: trustScore },
            ]}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            <Cell fill="hsl(var(--primary))" />
            <Cell fill="hsl(var(--secondary))" />
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: "#1A1A1A", border: "1px solid #333", borderRadius: "8px" }}
            itemStyle={{ color: "#fff" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-[-130px] flex flex-col items-center">
        <div className="text-2xl font-bold">{trustScore}</div>
        <div className="text-[10px] text-muted-foreground">Trust Score</div>
      </div>
    </>
  );
}
