import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  FaPlus,
  FaTrash,
  FaSync,
  FaClock,
  FaHistory,
  FaChartBar,
  FaDownload,
  FaUsers,
} from "react-icons/fa";
import { exportCSV } from "../utils/exportCSV";
import {
  getThongKeDaiLy,
  getLicenseExpiringSoon,
  getLicenseExpired,
} from "../lib/views";
import { v4 as uuidv4 } from "uuid";

export default function AdminDashboard() {
  const [licenses, setLicenses] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [expSoon, setExpSoon] = useState<any[]>([]);
  const [expired, setExpired] = useState<any[]>([]);
  const [daiLyList, setDaiLyList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "used" | "unused" | "expiring" | "expired">("all");
  const [filterDate, setFilterDate] = useState<string>("");
  const [filterBatch, setFilterBatch] = useState<string>("");

  const [newKey, setNewKey] = useState("");
  const [bulkCount, setBulkCount] = useState<number>(5);
  const [duration, setDuration] = useState<number>(30);
  const [agency, setAgency] = useState<string>("");

  useEffect(() => {
    const init = async () => {
      await fetchLicenses();
      await fetchLogs();
      await fetchStats();
    };
    init();
  }, []);

  async function fetchStats() {
    const [soon, exp] = await Promise.all([
      getLicenseExpiringSoon(),
      getLicenseExpired(),
    ]);
    if (soon.data) setExpSoon(soon.data);
    if (exp.data) setExpired(exp.data);

    const { data: daiLy } = await supabase.from("dai_ly").select("id, email");
    if (daiLy) setDaiLyList(daiLy);
  }

  async function fetchLicenses() {
    setLoading(true);
    const { data, error } = await supabase.from("licenses").select("*").order("created_at", { ascending: false });
    if (error) console.error("fetchLicenses error:", error);
    setLicenses(data || []);
    setLoading(false);
  }

  async function fetchLogs() {
    const { data } = await supabase.from("license_logs").select("*").order("created_at", { ascending: false }).limit(100);
    setLogs(data || []);
  }

  async function getAgencyUUID(email: string) {
    if (!email) return null;
    const { data, error } = await supabase.from("dai_ly").select("id").eq("email", email).single();
    if (error || !data) return null;
    return data.id;
  }

  function generateLicenseKey() {
    const prefix = "HAISOFT";
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const year = new Date().getFullYear();
    return `${prefix}-${random}-${year}`;
  }

  async function createLicense() {
    if (!newKey) return alert("⚠️ Hãy sinh hoặc nhập license trước khi tạo.");
    setBusy(true);
    const batch_id = uuidv4();
    const dai_ly_uuid = agency ? await getAgencyUUID(agency) : null;

    const { error } = await supabase.from("licenses").insert([
      {
        license_key: newKey,
        duration_days: duration,
        is_used: false,
        email: null,
        dai_ly_id: dai_ly_uuid,
        batch_id,
      },
    ]);
    setBusy(false);
    if (error) return alert("❌ Lỗi khi tạo license: " + error.message);

    alert("✅ Tạo license thành công!");
    setNewKey("");
    fetchLicenses();
  }

  async function createBulk() {
    if (bulkCount < 1) return alert("⚠️ Nhập số lượng > 0");
    setBusy(true);
    const batch_id = uuidv4();
    const dai_ly_uuid = agency ? await getAgencyUUID(agency) : null;

    const batch = [];
    for (let i = 0; i < bulkCount; i++) {
      const randKey = generateLicenseKey();
      batch.push({
        license_key: randKey,
        duration_days: duration,
        is_used: false,
        dai_ly_id: dai_ly_uuid,
        batch_id,
      });
    }
    const { error } = await supabase.from("licenses").insert(batch);
    setBusy(false);
    if (error) return alert("❌ Lỗi khi tạo hàng loạt: " + error.message);

    alert(`✅ Đã tạo ${bulkCount} license mới!`);
    fetchLicenses();
  }

  async function assignAgency(id: string) {
    const email = prompt("Nhập email đại lý muốn gán:");
    if (!email) return;
    const dai_ly_uuid = await getAgencyUUID(email);
    if (!dai_ly_uuid) return alert("Không tìm thấy đại lý.");
    setBusy(true);
    const { error } = await supabase.from("licenses").update({ dai_ly_id: dai_ly_uuid }).eq("id", id);
    setBusy(false);
    if (error) return alert("❌ Lỗi khi gán đại lý: " + error.message);
    alert("✅ Đã gán đại lý thành công!");
    fetchLicenses();
  }

  async function deleteLicense(id: string, key: string) {
    if (!confirm(`Xoá license "${key}"?`)) return;
    setBusy(true);
    await supabase.from("licenses").delete().eq("id", id);
    setBusy(false);
    fetchLicenses();
  }

  // 📍 Map đại lý_id -> email hiển thị
  function getAgencyEmail(uuid: string) {
    const found = daiLyList.find((d) => d.id === uuid);
    return found ? found.email : "—";
  }

  // 🔍 Lọc thông minh (gồm tên đại lý, batch, email, key, ngày)
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
        const agencyEmail = getAgencyEmail(l.dai_ly_id)?.toLowerCase() || "";
        return (
          (l.license_key || "").toLowerCase().includes(kw) ||
          (l.email || "").toLowerCase().includes(kw) ||
          agencyEmail.includes(kw) ||
          (l.batch_id || "").toLowerCase().includes(kw)
        );
      })
      .filter((l) => {
        if (filterDate && l.created_at) return l.created_at.startsWith(filterDate);
        if (filterBatch)
          return (l.batch_id || "").toLowerCase().includes(filterBatch.toLowerCase());
        return true;
      });
  }, [licenses, filter, q, expSoon, expired, filterDate, filterBatch, daiLyList]);

  const handleExport = () => {
    if (!filteredLicenses.length) return alert("Không có dữ liệu để xuất.");
    exportCSV("licenses_filtered", filteredLicenses);
    alert("✅ Đã xuất CSV theo bộ lọc!");
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

      <div className="max-w-7xl mx-auto bg-[#1b1b1b] rounded-2xl p-6 border border-[#222]">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-red-500 flex items-center gap-2">
            <FaChartBar /> Hải Soft License Manager v12.2
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
              className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded text-sm"
            >
              <FaDownload /> Export CSV
            </button>
          </div>
        </div>

        {/* Bộ lọc nâng cao */}
        <div className="grid md:grid-cols-4 gap-3 mb-6">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Tìm theo đại lý, email, key, batch..."
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
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="bg-[#222] border border-[#333] p-2 rounded"
          />
          <input
            placeholder="Nhập batch_id"
            value={filterBatch}
            onChange={(e) => setFilterBatch(e.target.value)}
            className="bg-[#222] border border-[#333] p-2 rounded"
          />
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
              onClick={() => setNewKey(generateLicenseKey())}
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
              {daiLyList.map((x) => (
                <option key={x.id} value={x.email}>
                  {x.email}
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

        {/* Bảng danh sách */}
        {loading ? (
          <p className="text-center py-4 text-gray-400">Đang tải dữ liệu...</p>
        ) : (
          <table className="w-full text-sm mt-6 border-t border-[#333]">
            <thead className="text-gray-400 border-b border-[#333]">
              <tr>
                <th>License</th>
                <th>Đại lý (Email)</th>
                <th>Ngày tạo</th>
                <th>Hiệu lực (ngày)</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredLicenses.map((l) => (
                <tr key={l.id} className="border-b border-[#222] hover:bg-[#1f1f1f]">
                  <td>{l.license_key}</td>
                  <td>{getAgencyEmail(l.dai_ly_id)}</td>
                  <td>{l.created_at ? new Date(l.created_at).toLocaleDateString() : "—"}</td>
                  <td>{l.duration_days || "—"}</td>
                  <td>{l.is_used ? "Đã dùng" : "Chưa dùng"}</td>
                  <td className="flex gap-2 text-xs">
                    <button
                      onClick={() => assignAgency(l.id)}
                      className="bg-blue-700 hover:bg-blue-800 px-3 py-1 rounded flex items-center gap-1"
                    >
                      <FaUsers /> Gán ĐL
                    </button>
                    <button
                      onClick={() => deleteLicense(l.id, l.license_key)}
                      className="bg-red-700 hover:bg-red-800 px-3 py-1 rounded flex items-center gap-1"
                    >
                      <FaTrash /> Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
