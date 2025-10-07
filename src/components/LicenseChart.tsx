import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

type Props = {
  used: number;
  unused: number;
  expired: number;
};

export default function LicenseChart({ used, unused, expired }: Props) {
  const data = [
    { name: "Đã kích hoạt", value: used },
    { name: "Chưa kích hoạt", value: unused },
    { name: "Đã hết hạn", value: expired },
  ];
  const COLORS = ["#22c55e", "#eab308", "#ef4444"];

  return (
    <div className="bg-[#141414] border border-red-900 rounded-lg p-4 mb-6">
      <h2 className="text-red-300 mb-2 font-semibold">Biểu đồ License</h2>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" outerRadius={90} dataKey="value">
            {data.map((_entry, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a1a",
              border: "1px solid #333",
              color: "#fff",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
