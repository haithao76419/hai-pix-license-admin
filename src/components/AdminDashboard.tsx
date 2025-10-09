import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import LicenseManagement from "./LicenseManagement";
import { FaHistory, FaListUl } from "react-icons/fa";

type TabKey = "license" | "logs";

interface LicenseLog {
  id: string;
  created_at: string;
  action: string;
  message: string;
  actor_email?: string | null;
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<TabKey>("license");
  const [logs, setLogs] = useState<LicenseLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    fetchLogs();
    const channel = supabase
      .channel("license-log-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "license_logs" },
        () => fetchLogs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchLogs() {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from("license_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error && data) setLogs(data as LicenseLog[]);
    setLoadingLogs(false);
  }

  return (
    <div className="min-h-screen bg-[#08080b] p-6 text-gray-200">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-[#1b1b20] bg-[#0f0f11] shadow-[0_0_40px_rgba(239,68,68,0.15)]">
        <div className="flex flex-col gap-4 border-b border-[#1b1b20] bg-gradient-to-r from-[#16161a] via-[#101013] to-[#1a0f0f] px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-red-400">
              Hải Soft Enterprise Suite
            </p>
            <h1 className="mt-2 text-3xl font-black text-white">
              License Management Control Center
            </h1>
            <p className="text-sm text-gray-400">
              Kiểm soát toàn diện việc cấp phát license, theo dõi hoạt động realtime.
            </p>
          </div>
          <div className="rounded-2xl border border-red-500/40 bg-red-600/10 px-4 py-3 text-sm text-red-200 shadow-lg">
            ⚡ Tất cả hành động được đồng bộ trực tiếp với Supabase.
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-b border-[#1b1b20] px-6 py-4">
          <button
            onClick={() => setTab("license")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === "license"
                ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                : "border border-[#1f1f23] bg-[#141418] text-gray-300 hover:border-red-500"
            }`}
          >
            <FaListUl /> Trung tâm License
          </button>
          <button
            onClick={() => setTab("logs")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === "logs"
                ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                : "border border-[#1f1f23] bg-[#141418] text-gray-300 hover:border-red-500"
            }`}
          >
            <FaHistory /> Nhật ký hệ thống
          </button>
        </div>

        <div className="px-6 py-6">
          {tab === "license" ? (
            <LicenseManagement onActivity={fetchLogs} />
          ) : (
            <div className="rounded-2xl border border-[#1b1b20] bg-[#121215] p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                  <FaHistory className="text-red-500" /> Nhật ký hoạt động gần đây
                </h2>
                <span className="text-xs uppercase tracking-wide text-gray-500">
                  Hiển thị tối đa 200 bản ghi
                </span>
              </div>
              <div className="mt-4 overflow-x-auto rounded-xl border border-[#1f1f23]">
                <table className="min-w-full text-left text-xs text-gray-200">
                  <thead className="bg-[#111] text-[11px] uppercase tracking-wider text-gray-400">
                    <tr>
                      <th className="px-3 py-3">Thời gian</th>
                      <th className="px-3 py-3">Hành động</th>
                      <th className="px-3 py-3">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingLogs ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-gray-400">
                          Đang tải nhật ký...
                        </td>
                      </tr>
                    ) : logs.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                          Chưa có hoạt động nào.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr
                          key={log.id}
                          className="border-t border-[#1f1f23] bg-[#121214] hover:bg-[#1a1a1f]"
                        >
                          <td className="px-3 py-3 text-gray-400">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-3 font-semibold text-red-300 uppercase">
                            {log.action}
                          </td>
                          <td className="px-3 py-3 text-gray-200">{log.message}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
