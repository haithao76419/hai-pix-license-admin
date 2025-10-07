import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  FaPlus, FaTrash, FaSync, FaClock, FaHistory, FaChartBar, FaDownload, FaSearch,
} from "react-icons/fa";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { exportCSV } from "../utils/exportCSV";

export default function AdminDashboard() {
  const [tab, setTab] = useState<"dashboard" | "logs">("dashboard");
  const [licenses, setLicenses] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "used" | "unused">("all");
  const [newKey, setNewKey] = useState("");
  const [q, setQ] = useState("");        // 🔍 từ khoá tìm kiếm (license/email)

  // Tải dữ liệu
  useEffect(() => { fetchLicenses(); fetchLogs(); }, []);

  async function fetchLicenses() {
    setLoading(true);
    const { data, error } = await supabase
      .from("licenses")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) console.error("❌ Lỗi tải license:", error);
    else setLicenses(data || []);
    setLoading(false);
  }

  async function fetchLogs() {
    const { data, error } = await supabase
      .from("license_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) console.error("❌ Lỗi tải log:", error);
    else setLogs(data || []);
  }

  // Sinh key
  function generateKey() {
    const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
    setNewKey(`HAISOFT-${rand}-${new Date().getFullYear()}`);
  }

  // Tạo license
  async function createLicense() {
    if (!newKey) return alert("⚠️ Hãy sinh hoặc nhập license trước khi tạo.");
    setBusy(true);
    const { error } = await supabase.from("licenses").insert([
      { license_key: newKey, duration_days: 365, is_used: false },
    ]);
    setBusy(false);
    if (error) return alert("❌ Lỗi khi tạo license.");
    await addLog("create", `Tạo license mới: ${newKey}`);
    setNewKey("");
    fetchLicenses();
  }

  // Ghi log
  async function addLog(action: string, message: string) {
    await supabase.from("license_logs").insert([{ action, message }]);
  }

  // Gia hạn
  async function extendLicense(id: string, key: string) {
    setBusy(true);
    const { error } = await supabase.rpc("extend_license_30days", { license_id: id });
    setBusy(false);
    if (error) { console.error(error); return alert("⚠️ Lỗi khi gia hạn license."); }
    await addLog("extend", `Gia hạn 30 ngày cho key: ${key}`);
    fetchLicenses();
  }

  // Xoá
  async function deleteLicense(id: string, key: string) {
    if (!confirm(`Xoá license "${key}"?`)) return;
    setBusy(true);
    const { error } = await supabase.from("licenses").delete().eq("id", id);
    setBusy(false);
    if (error) { console.error(error); return alert("⚠️ Lỗi khi xoá license."); }
    await addLog("delete", `Xoá license: ${key}`);
    fetchLicenses();
  }

  // 🔍 Lọc + Tìm kiếm (memo hoá cho mượt)
  const filteredLicenses = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return licenses
      .filter((l) => {
        if (filter === "used") return l.is_used;
        if (filter === "unused") return !l.is_used;
        return true;
      })
      .filter((l) => {
        if (!kw) return true;
        const s1 = (l.license_key || "").toLowerCase();
        const s2 = (l.email || "").toLowerCase();
        return s1.includes(kw) || s2.includes(kw);
      });
  }, [licenses, filter, q]);

  // 📊 Thống kê
  const countUsed = licenses.filter((l) => l.is_used).length;
  const countUnused = licenses.filter((l) => !l.is_used).length;
  const countExpired = licenses.filter(
    (l) => l.expires_at && new Date(l.expires_at) < new Date()
  ).length;

  const chartData = [
    { name: "Đã kích hoạt", value: countUsed },
    { name: "Chưa kích hoạt", value: countUnused },
    { name: "Hết hạn", value: countExpired },
  ];

  // Export CSV
  function handleExport() {
    if (!filteredLicenses.length) return alert("Không có dữ liệu để xuất.");
    // chọn các cột quan trọng
    const rows = filteredLicenses.map((l) => ({
      license: l.license_key,
      email: l.email ?? "",
      is_used: l.is_used ? "yes" : "no",
      activated_at: l.activated_at ?? "",
      expires_at: l.expires_at ?? "",
      created_at: l.created_at ?? "",
    }));
    exportCSV("licenses", rows);
  }

  return (
    <div className="min-h-screen bg-[#111] text-gray-200 font-[Inter] p-6">
      {/* Busy overlay */}
      {busy && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-[#1b1b1b] border border-[#333] px-6 py-4 rounded-xl">
            Đang xử lý...
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto bg-[#1b1b1b] rounded-2xl p-6 shadow-xl border border-[#222]">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-red-500 flex items-center gap-2">
            <FaChartBar /> Hải Soft Admin Dashboard v7
          </h1>
          <div className="flex gap-2">
            <button
              onClick={fetchLicenses}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-800 px-4 py-2 rounded text-sm"
            >
              <FaSync /> Làm mới
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-800 px-4 py-2 rounded text-sm"
            >
              <FaDownload /> Export CSV
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-3 mb-6">
          <button
            className={`px-3 py-1 rounded ${tab==="dashboard" ? "bg-red-700 text-white" : "bg-gray-700 text-gray-300"}`}
            onClick={() => setTab("dashboard")}
          >
            📊 Dashboard
          </button>
          <button
            className={`px-3 py-1 rounded ${tab==="logs" ? "bg-red-700 text-white" : "bg-gray-700 text-gray-300"}`}
            onClick={() => setTab("logs")}
          >
            <FaHistory className="inline mr-1" /> Logs
          </button>
        </div>

        {tab === "dashboard" && (
          <>
            {/* Hàng công cụ: tìm kiếm + tạo */}
            <div className="flex flex-col md:flex-row gap-2 md:items-center mb-6">
              <div className="relative flex-1">
                <FaSearch className="absolute left-3 top-3 text-gray-500" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Nhập email hoặc license để tìm…"
                  className="w-full bg-[#222] border border-[#333] pl-9 pr-3 py-2 rounded"
                />
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Nhập hoặc sinh license"
                  className="bg-[#222] border border-[#333] p-2 rounded w-56"
                />
                <button
                  onClick={generateKey}
                  className="bg-gray-700 hover:bg-gray-800 px-3 py-2 rounded text-sm"
                >
                  Sinh Key
                </button>
                <button
                  onClick={createLicense}
                  className="bg-red-700 hover:bg-red-800 px-3 py-2 rounded text-sm text-white"
                >
                  <FaPlus className="inline mr-1" /> Tạo
                </button>
              </div>
            </div>

            {/* Bộ lọc */}
            <div className="flex gap-3 mb-6">
              <button
                className={`px-3 py-1 rounded ${filter==="all" ? "bg-red-700 text-white" : "bg-gray-700 text-gray-300"}`}
                onClick={() => setFilter("all")}
              >
                Tất cả
              </button>
              <button
                className={`px-3 py-1 rounded ${filter==="used" ? "bg-red-700 text-white" : "bg-gray-700 text-gray-300"}`}
                onClick={() => setFilter("used")}
              >
                Đã kích hoạt
              </button>
              <button
                className={`px-3 py-1 rounded ${filter==="unused" ? "bg-red-700 text-white" : "bg-gray-700 text-gray-300"}`}
                onClick={() => setFilter("unused")}
              >
                Chưa kích hoạt
              </button>
            </div>

            {/* Thống kê + biểu đồ */}
            <div className="mb-8">
              <h2 className="text-lg mb-2 text-gray-300 font-semibold">
                📈 Thống kê tổng quan ({licenses.length} license)
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" stroke="#aaa" />
                  <YAxis stroke="#aaa" />
                  <Tooltip contentStyle={{ backgroundColor: "#222", border: "1px solid #444" }} />
                  <Bar dataKey="value" fill="#ef4444" barSize={50} radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Bảng */}
            {loading ? (
              <p>🔄 Đang tải dữ liệu...</p>
            ) : (
              <table className="w-full text-sm border-t border-[#333]">
                <thead className="text-gray-400 border-b border-[#333]">
                  <tr>
                    <th className="py-2 text-left">License</th>
                    <th>Email</th>
                    <th>Trạng thái</th>
                    <th>Hết hạn</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLicenses.map((l) => (
                    <tr key={l.id} className="border-b border-[#222] hover:bg-[#1f1f1f] transition">
                      <td className="py-2">{l.license_key}</td>
                      <td>{l.email || "—"}</td>
                      <td>{l.is_used ? <span className="text-green-400">Đã dùng</span> : <span className="text-gray-400">Chưa dùng</span>}</td>
                      <td>{l.expires_at ? new Date(l.expires_at).toLocaleDateString() : "—"}</td>
                      <td className="flex gap-2 text-sm">
                        <button
                          onClick={() => extendLicense(l.id, l.license_key)}
                          className="bg-gray-700 hover:bg-gray-800 px-3 py-1 rounded text-xs flex items-center gap-1"
                        >
                          <FaClock /> +30 ngày
                        </button>
                        <button
                          onClick={() => deleteLicense(l.id, l.license_key)}
                          className="bg-red-700 hover:bg-red-800 px-3 py-1 rounded text-xs flex items-center gap-1"
                        >
                          <FaTrash /> Xoá
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredLicenses.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-gray-400">
                        Không có license nào phù hợp.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* TAB LOGS */}
        {tab === "logs" && (
          <div>
            <h2 className="text-lg font-semibold text-gray-300 mb-4">
              🕓 Lịch sử hoạt động (50 gần nhất)
            </h2>
            <div className="bg-[#111] rounded-xl border border-[#333] p-4 max-h-[480px] overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-gray-400 text-center py-4">Chưa có log nào.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {logs.map((log) => (
                    <li key={log.id} className="border-b border-[#222] pb-2 text-gray-300">
                      <span className="text-red-500 font-semibold">[{log.action}]</span> {log.message}
                      <br />
                      <span className="text-xs text-gray-500">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
