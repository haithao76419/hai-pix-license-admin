import { useEffect, useState } from "react";

export default function AgentDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(
          "https://ahqlhseqsdkzzlbddppvj.supabase.co/functions/v1/agent-stats",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("supabase_token")}`,
              "x-user-email": "haithao7641@gmail.com",
              "Content-Type": "application/json",
            },
          }
        );
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <p className="text-gray-400">⏳ Đang tải dữ liệu...</p>;
  if (error) return <p className="text-red-400">❌ {error}</p>;

  return (
    <div className="p-6 bg-[#0f0f0f] text-white rounded-2xl shadow-xl max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-center text-cyan-400">
        📊 Thống kê Đại lý
      </h2>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="p-4 bg-[#1a1a1a] rounded-xl border border-cyan-600">
          <p className="text-sm text-gray-400">Tổng Key</p>
          <p className="text-2xl font-bold text-cyan-300">
            {data?.summary?.total}
          </p>
        </div>
        <div className="p-4 bg-[#1a1a1a] rounded-xl border border-green-600">
          <p className="text-sm text-gray-400">Đã kích hoạt</p>
          <p className="text-2xl font-bold text-green-300">
            {data?.summary?.used}
          </p>
        </div>
        <div className="p-4 bg-[#1a1a1a] rounded-xl border border-yellow-600">
          <p className="text-sm text-gray-400">Chưa kích hoạt</p>
          <p className="text-2xl font-bold text-yellow-300">
            {data?.summary?.unused}
          </p>
        </div>
      </div>

      <div className="bg-[#1a1a1a] p-4 rounded-xl">
        <h3 className="text-lg mb-2 font-semibold">Danh sách key</h3>
        <table className="w-full text-sm border-collapse">
          <thead className="text-cyan-400 border-b border-gray-600">
            <tr>
              <th className="text-left p-2">License Key</th>
              <th className="text-left p-2">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {data?.items?.map((k: any, i: number) => (
              <tr key={i} className="border-b border-gray-700">
                <td className="p-2">{k.license_key}</td>
                <td className="p-2 text-sm">
                  {k.trang_thai === "Đã kích hoạt" ? (
                    <span className="text-green-400">✅ Đã kích hoạt</span>
                  ) : (
                    <span className="text-yellow-400">🕓 Chưa kích hoạt</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
