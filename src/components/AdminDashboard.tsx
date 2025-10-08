import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  FaPlus, FaTrash, FaSync, FaClock, FaHistory, FaChartBar, FaDownload, FaSearch, FaUsers,
} from "react-icons/fa";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { exportCSV } from "../utils/exportCSV";
import {
  getThongKeDaiLy,
  getTongKho,
  getLicenseExpiringSoon,
  getLicenseExpired,
  getKhoDaiLy,
} from "../lib/views";

export default function AdminDashboard() {
  const [tab, setTab] = useState<"dashboard" | "dai_ly" | "logs">("dashboard");
  const [licenses, setLicenses] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [thongKeDaiLy, setThongKeDaiLy] = useState<any[]>([]);
  const [expSoon, setExpSoon] = useState<any[]>([]);
  const [expired, setExpired] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "used" | "unused" | "expiring" | "expired">("all");
  const [newKey, setNewKey] = useState("");
  const [bulkCount, setBulkCount] = useState<number>(5);
  const [duration, setDuration] = useState<number>(30);
  const [agency, setAgency] = useState<string>("");
  const [daiLyList, setDaiLyList] = useState<string[]>([]);

  // 🧩 Load dữ liệu ban đầu
  useEffect(() => {
    fetchLicenses();
    fetchLogs();
    fetchStats();

    const channel = supabase
      .channel("license-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "licenses" }, fetchLicenses)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  async function fetchStats() {
    const [tk, soon, exp] = await Promise.all([
      getThongKeDaiLy(),
      getLicenseExpiringSoon(),
      getLicenseExpired(),
    ]);
    if (tk.data) setThongKeDaiLy(tk.data);
    if (soon.data) setExpSoon(soon.data);
    if (exp.data) setExpired(exp.data);

    const { data: daiLy } = await supabase.from("dai_ly").select("email");
    if (daiLy) setDaiLyList(daiLy.map((x) => x.email));
  }

  async function fetchLicenses() {
    setLoading(true);
    const { data, error } = await supabase
      .from("licenses")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setLicenses(data || []);
    setLoading(false);
  }

  async function fetchLogs() {
    const { data } = await supabase
      .from("license_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs(data || []);
  }

  function generateKey() {
    const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
    setNewKey(`HAISOFT-${rand}-${new Date().getFullYear()}`);
  }

  async function createLicense() {
    if (!newKey) return alert("⚠️ Hãy sinh hoặc nhập license trước khi tạo.");
    setBusy(true);
    const { error } = await supabase.from("licenses").insert([
      {
        license_key: newKey,
        duration_days: duration,
        is_used: false,
        email: null,
        expires_at: null,
        dai_ly: agency || null,
      },
    ]);
    setBusy(false);
    if (error) return alert("❌ Lỗi khi tạo license.");
    await addLog("create", `Tạo license mới: ${newKey}`);
    setNewKey("");
    fetchLicenses();
  }

  async function createBulk() {
    if (bulkCount < 1) return alert("⚠️ Nhập số lượng > 0");
    setBusy(true);
    const batch = [];
    for (let i = 0; i < bulkCount; i++) {
      const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
      batch.push({
        license_key: `HAISOFT-${rand}-${new Date().getFullYear()}`,
        duration_days: duration,
        is_used: false,
        dai_ly: agency || null,
      });
    }
    const { error } = await supabase.from("licenses").insert(batch);
    setBusy(false);
    if (error) return alert("❌ Lỗi khi tạo hàng loạt license.");
    await addLog("bulk_create", `Tạo ${bulkCount} license mới cho ${agency || "hệ thống"}`);
    fetchLicenses();
  }

  async function addLog(action: string, message: string) {
    await supabase.from("license_logs").insert([{ action, message }]);
  }

  async function extendLicense(id: string, key: string) {
    setBusy(true);
    const { error } = await supabase.rpc("extend_license_30days", { license_id: id });
    setBusy(false);
    if (error) return alert("⚠️ RPC extend_license_30days chưa sẵn sàng.");
    await addLog("extend", `Gia hạn 30 ngày cho key: ${key}`);
    fetchLicenses();
  }

  async function deleteLicense(id: string, key: string) {
    if (!confirm(`Xoá license "${key}"?`)) return;
    setBusy(true);
    await supabase.from("licenses").delete().eq("id", id);
    setBusy(false);
    await addLog("delete", `Xoá license: ${key}`);
    fetchLicenses();
  }

  // 🔍 Lọc license
  const filteredLicenses = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return licenses
      .filter((l) => {
        if (filter === "used") return l.is_used;
        if (filter === "unused") return !l.is_used;
        if (filter === "expiring") return expSoon.some((e) => e.license_key === l.license_key);
        if (filter === "expired") return expired.some((e) => e.license_key === l.license_key);
        return true;
      })
      .filter((l) => {
        if (!kw) return true;
        return (
          (l.license_key || "").toLowerCase().includes(kw) ||
          (l.email || "").toLowerCase().includes(kw) ||
          (l.dai_ly || "").toLowerCase().includes(kw)
        );
      });
  }, [licenses, filter, q, expSoon, expired]);

  const countUsed = licenses.filter((l) => l.is_used).length;
  const countUnused = licenses.filter((l) => !l.is_used).length;
  const countExpSoon = expSoon.length;
  const countExpired = expired.length;

  const chartData = [
    { name: "Đã kích hoạt", value: countUsed },
    { name: "Chưa kích hoạt", value: countUnused },
    { name: "Sắp hết hạn", value: countExpSoon },
    { name: "Hết hạn", value: countExpired },
  ];

  const handleExport = () => {
    if (!filteredLicenses.length) return alert("Không có dữ liệu để xuất.");
    const rows = filteredLicenses.map((l) => ({
      license: l.license_key,
      dai_ly: l.dai_ly ?? "",
      email: l.email ?? "",
      is_used: l.is_used ? "Đã dùng" : "Chưa dùng",
      expires_at: l.expires_at ?? "",
    }));
    exportCSV("licenses_export", rows);
  };

  return (
    <div className="min-h-screen bg-[#111] text-gray-200 font-[Inter] p-6">
      {busy && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-[#1b1b1b] border border-[#333] px-6 py-4 rounded-xl">
            ⏳ Đang xử lý...
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto bg-[#1b1b1b] rounded-2xl p-6 shadow-xl border border-[#222]">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-red-500 flex items-center gap-2">
            <FaChartBar /> Hải Soft License Manager v11.3
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
            onClick={() => setTab("dashboard")}
            className={`px-3 py-1 rounded ${tab === "dashboard" ? "bg-red-700 text-white" : "bg-gray-700 text-gray-300"}`}
          >
            📊 Dashboard
          </button>
          <button
            onClick={() => setTab("dai_ly")}
            className={`px-3 py-1 rounded ${tab === "dai_ly" ? "bg-red-700 text-white" : "bg-gray-700 text-gray-300"}`}
          >
            <FaUsers className="inline mr-1" /> Đại lý
          </button>
          <button
            onClick={() => setTab("logs")}
            className={`px-3 py-1 rounded ${tab === "logs" ? "bg-red-700 text-white" : "bg-gray-700 text-gray-300"}`}
          >
            <FaHistory className="inline mr-1" /> Logs
          </button>
        </div>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <>
            <div className="grid md:grid-cols-2 gap-3 mb-6">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="🔍 Nhập email / đại lý / license để tìm..."
                className="bg-[#222] border border-[#333] p-2 rounded"
              />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="bg-[#222] border border-[#333] p-2 rounded"
              >
                <option value="all">Tất cả</option>
                <option value="used">Đã dùng</option>
                <option value="unused">Chưa dùng</option>
                <option value="expiring">Sắp hết hạn</option>
                <option value="expired">Đã hết hạn</option>
              </select>
            </div>

            {/* Panel tạo key */}
            <div className="bg-[#181818] border border-[#333] rounded-xl p-4 mb-8">
              <h2 className="text-lg text-red-500 font-semibold mb-3">➕ Tạo License mới</h2>
              <div className="grid md:grid-cols-4 gap-2 items-center">
                <input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Nhập hoặc sinh license"
                  className="bg-[#222] border border-[#333] p-2 rounded"
                />
                <button
                  onClick={generateKey}
                  className="bg-gray-700 hover:bg-gray-800 px-3 py-2 rounded text-sm"
                >
                  Sinh Key
                </button>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  placeholder="Số ngày hiệu lực"
                  className="bg-[#222] border border-[#333] p-2 rounded"
                />
                <select
                  value={agency}
                  onChange={(e) => setAgency(e.target.value)}
                  className="bg-[#222] border border-[#333] p-2 rounded"
                >
                  <option value="">--Chọn đại lý--</option>
                  {daiLyList.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3 flex gap-3">
                <button
                  onClick={createLicense}
                  className="bg-red-700 hover:bg-red-800 px-3 py-2 rounded text-white text-sm"
                >
                  <FaPlus className="inline mr-1" /> Tạo đơn
                </button>
                <input
                  type="number"
                  value={bulkCount}
                  onChange={(e) => setBulkCount(Number(e.target.value))}
                  className="bg-[#222] border border-[#333] p-2 rounded w-24"
                  placeholder="SL"
                />
                <button
                  onClick={createBulk}
                  className="bg-gray-700 hover:bg-gray-800 px-3 py-2 rounded text-white text-sm"
                >
                  <FaPlus className="inline mr-1" /> Tạo hàng loạt
                </button>
              </div>
            </div>

            {/* Biểu đồ */}
            <h2 className="text-gray-300 text-lg mb-2 font-semibold">📈 Thống kê tổng quan ({licenses.length})</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#aaa" />
                <YAxis stroke="#aaa" />
                <Tooltip contentStyle={{ backgroundColor: "#222", border: "1px solid #444" }} />
                <Bar dataKey="value" fill="#ef4444" barSize={50} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Cảnh báo */}
            <div className="mt-4 text-sm text-gray-300">
              <p>🟢 Đã kích hoạt: {countUsed}</p>
              <p>🟡 Sắp hết hạn (&lt;7 ngày): {countExpSoon}</p>
              <p>🔴 Đã hết hạn: {countExpired}</p>
              <p>⚪ Chưa kích hoạt: {countUnused}</p>
            </div>

            {/* Bảng danh sách */}
            {loading ? (
              <p className="text-center py-4 text-gray-400">Đang tải dữ liệu...</p>
            ) : (
              <table className="w-full text-sm mt-6 border-t border-[#333]">
                <thead className="text-gray-400 border-b border-[#333]">
                  <tr>
                    <th>License</th>
                    <th>Đại lý</th>
                    <th>Người dùng</th>
                    <th>Trạng thái</th>
                    <th>Hết hạn</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLicenses.map((l) => {
                    const isExp = expired.some((e) => e.license_key === l.license_key);
                    const isSoon = expSoon.some((e) => e.license_key === l.license_key);
                    const color = isExp ? "text-red-400" : isSoon ? "text-yellow-400" : "text-green-400";
                    return (
                      <tr key={l.id} className="border-b border-[#222] hover:bg-[#1f1f1f]">
                        <td className="py-2">{l.license_key}</td>
                        <td>{l.dai_ly || "—"}</td>
                        <td>{l.email || "—"}</td>
                        <td className={color}>
                          {isExp ? "Hết hạn" : isSoon ? "Sắp hết hạn" : l.is_used ? "Đã dùng" : "Chưa dùng"}
                        </td>
                        <td>{l.expires_at ? new Date(l.expires_at).toLocaleDateString() : "—"}</td>
                        <td className="flex gap-2 text-xs">
                          <button
                            onClick={() => extendLicense(l.id, l.license_key)}
                            className="bg-gray-700 hover:bg-gray-800 px-3 py-1 rounded flex items-center gap-1"
                          >
                            <FaClock /> +30d
                          </button>
                          <button
                            onClick={() => deleteLicense(l.id, l.license_key)}
                            className="bg-red-700 hover:bg-red-800 px-3 py-1 rounded flex items-center gap-1"
                          >
                            <FaTrash /> Xoá
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* Logs */}
        {tab === "logs" && (
          <div className="mt-4 text-sm">
            <h2 className="text-lg text-red-500 mb-3 font-semibold">
              <FaHistory className="inline mr-2" /> Nhật ký hoạt động
            </h2>
            <table className="w-full border-t border-[#333]">
              <thead className="text-gray-400 border-b border-[#333]">
                <tr>
                  <th>Thời gian</th>
                  <th>Hành động</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-[#222] hover:bg-[#1f1f1f]">
                    <td>{new Date(log.created_at).toLocaleString()}</td>
                    <td>{log.action}</td>
                    <td>{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
