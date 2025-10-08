import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  FaChartPie,
  FaClock,
  FaKey,
  FaSync,
  FaDownload,
  FaLock,
} from "react-icons/fa";
import { exportCSV } from "../utils/exportCSV";
import {
  getUserLicenseStatus,
  getLicenseExpiringSoon,
  getLicenseExpired,
} from "../lib/views";

/**
 * 🧩 Giao diện dành cho Đại lý — xem kho key riêng
 */
export default function AgentDashboard() {
  const [licenses, setLicenses] = useState<any[]>([]);
  const [expSoon, setExpSoon] = useState<any[]>([]);
  const [expired, setExpired] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userEmail = userData?.user?.email;
      if (!userEmail) return;

      setEmail(userEmail);

      const [own, soon, exp] = await Promise.all([
        getUserLicenseStatus(userEmail),
        getLicenseExpiringSoon(),
        getLicenseExpired(),
      ]);

      if (own.data) setLicenses(own.data);
      if (soon.data) setExpSoon(soon.data);
      if (exp.data) setExpired(exp.data);

      setLoading(false);
    })();
  }, []);

  function handleExport() {
    if (!licenses.length) return alert("Không có dữ liệu để xuất.");
    const rows = licenses.map((l) => ({
      license_key: l.license_key,
      is_used: l.is_used ? "yes" : "no",
      expires_at: l.expires_at ?? "",
      activated_at: l.activated_at ?? "",
    }));
    exportCSV("agent_licenses", rows);
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen bg-[#111] text-gray-300">
        🔄 Đang tải kho license...
      </div>
    );

  return (
    <div className="min-h-screen bg-[#111] text-gray-200 font-[Inter] p-6">
      <div className="max-w-6xl mx-auto bg-[#1b1b1b] rounded-2xl p-6 border border-[#222] shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-red-500 flex items-center gap-2">
            <FaChartPie /> Hải Soft — Đại lý License
          </h1>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-800 px-4 py-2 rounded text-sm"
            >
              <FaDownload /> Export CSV
            </button>
          </div>
        </div>

        {/* Thống kê */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-center">
          <div className="bg-[#222] p-3 rounded-xl border border-[#333]">
            <FaKey className="mx-auto text-red-400 mb-1" />
            <p className="text-lg font-semibold">{licenses.length}</p>
            <p className="text-xs text-gray-400">Tổng key</p>
          </div>
          <div className="bg-[#222] p-3 rounded-xl border border-[#333]">
            <FaLock className="mx-auto text-green-400 mb-1" />
            <p className="text-lg font-semibold">
              {licenses.filter((l) => l.is_used).length}
            </p>
            <p className="text-xs text-gray-400">Đã kích hoạt</p>
          </div>
          <div className="bg-[#222] p-3 rounded-xl border border-[#333]">
            <FaClock className="mx-auto text-yellow-400 mb-1" />
            <p className="text-lg font-semibold">{expSoon.length}</p>
            <p className="text-xs text-gray-400">Sắp hết hạn</p>
          </div>
          <div className="bg-[#222] p-3 rounded-xl border border-[#333]">
            <FaSync className="mx-auto text-gray-400 mb-1" />
            <p className="text-lg font-semibold">{expired.length}</p>
            <p className="text-xs text-gray-400">Đã hết hạn</p>
          </div>
        </div>

        {/* Bảng danh sách */}
        <div>
          <h2 className="text-lg mb-3 text-gray-300 font-semibold">
            📜 Danh sách license của bạn ({email})
          </h2>

          {licenses.length === 0 ? (
            <p className="text-gray-400">Bạn chưa có license nào.</p>
          ) : (
            <table className="w-full text-sm border-t border-[#333]">
              <thead className="text-gray-400 border-b border-[#333]">
                <tr>
                  <th className="py-2 text-left">License</th>
                  <th>Trạng thái</th>
                  <th>Hết hạn</th>
                  <th>Kích hoạt lúc</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-[#222] hover:bg-[#1f1f1f]"
                  >
                    <td className="py-2">{l.license_key}</td>
                    <td>
                      {l.is_used ? (
                        <span className="text-green-400">Đã dùng</span>
                      ) : (
                        <span className="text-gray-400">Chưa dùng</span>
                      )}
                    </td>
                    <td>
                      {l.expires_at
                        ? new Date(l.expires_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      {l.activated_at
                        ? new Date(l.activated_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
