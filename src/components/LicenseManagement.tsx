import { useEffect, useMemo, useState } from "react";
import {
  FaChartPie,
  FaCheck,
  FaClipboardList,
  FaDownload,
  FaFilter,
  FaKey,
  FaLayerGroup,
  FaPlus,
  FaSync,
  FaTrash,
  FaUserTag,
  FaClock,
} from "react-icons/fa";
import { ResponsiveContainer, BarChart, Bar, Tooltip, XAxis, YAxis } from "recharts";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../lib/supabaseClient";
import { exportCSV } from "../utils/exportCSV";

interface LicenseRecord {
  id: string;
  license_key: string;
  dai_ly_id: string | null;
  email: string | null;
  batch_id: string | null;
  created_at: string;
  expires_at: string | null;
  is_used: boolean | null;
  duration_days: number | null;
}

type StatusFilter =
  | "all"
  | "used"
  | "unused"
  | "assigned"
  | "unassigned"
  | "expiring"
  | "expired";

interface LicenseManagementProps {
  onActivity?: () => void;
}

const SOON_THRESHOLD_DAYS = 7;

function sanitizeFileName(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase();
}

function buildCsvRows(records: LicenseRecord[]) {
  return records.map((l) => ({
    license_key: l.license_key,
    dai_ly: l.dai_ly_id ?? "",
    user_email: l.email ?? "",
    batch_id: l.batch_id ?? "",
    created_at: l.created_at,
    expires_at: l.expires_at ?? "",
    status: l.is_used ? "Đã kích hoạt" : "Chưa kích hoạt",
  }));
}

export default function LicenseManagement({ onActivity }: LicenseManagementProps) {
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [creationKey, setCreationKey] = useState<string>("");
  const [creationCount, setCreationCount] = useState<number>(10);
  const [creationDuration, setCreationDuration] = useState<number>(30);
  const [creationAgent, setCreationAgent] = useState<string>("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assigningAgent, setAssigningAgent] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    refreshData();
    const channel = supabase
      .channel("license-management-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "licenses" },
        () => refreshData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function refreshData() {
    setLoading(true);
    const [{ data, error }, agentsRes] = await Promise.all([
      supabase
        .from("licenses")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("dai_ly").select("email").order("email", { ascending: true }),
    ]);

    if (!error && data) {
      setLicenses(data as LicenseRecord[]);
    } else if (error) {
      console.error("❌ Lỗi tải licenses", error);
    }

    if (agentsRes.data) {
      setAgents(agentsRes.data.map((item) => item.email).filter(Boolean));
    }

    setLoading(false);
    setSelectedIds(new Set());
  }

  function generateKey() {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const stamp = Date.now().toString(36).toUpperCase();
    return `HAISOFT-${rand}-${stamp}`;
  }

  async function addLog(action: string, message: string) {
    await supabase.from("license_logs").insert([{ action, message }]);
    onActivity?.();
  }

  async function createSingleLicense() {
    const finalKey = (creationKey || generateKey()).trim();
    if (!finalKey) {
      alert("⚠️ Không thể tạo license trống.");
      return;
    }

    setBusy(true);
    const batchId = uuidv4();
    const payload = {
      license_key: finalKey,
      duration_days: creationDuration || null,
      is_used: false,
      dai_ly_id: creationAgent || null,
      batch_id: batchId,
    };
    const { error } = await supabase.from("licenses").insert([payload]);
    setBusy(false);

    if (error) {
      console.error("❌ Lỗi tạo license", error);
      alert(`❌ Không thể tạo license: ${error.message}`);
      return;
    }

    await addLog(
      "create",
      `Tạo license ${finalKey} (batch ${batchId}${creationAgent ? ` • ${creationAgent}` : ""})`
    );
    alert("✅ Đã tạo license mới!");
    setCreationKey("");
    refreshData();
  }

  async function createBatchLicenses() {
    if (creationCount < 1) {
      alert("⚠️ Số lượng phải lớn hơn 0");
      return;
    }
    setBusy(true);
    const batchId = uuidv4();
    const now = Date.now();

    const records = Array.from({ length: creationCount }, (_, index) => ({
      license_key: generateKey(),
      duration_days: creationDuration || null,
      is_used: false,
      dai_ly_id: creationAgent || null,
      batch_id: batchId,
      created_at: new Date(now + index).toISOString(),
    }));

    const { error } = await supabase.from("licenses").insert(records);
    setBusy(false);

    if (error) {
      console.error("❌ Lỗi tạo batch", error);
      alert(`❌ Không thể tạo batch: ${error.message}`);
      return;
    }

    await addLog(
      "bulk_create",
      `Tạo ${creationCount} license (batch ${batchId}${creationAgent ? ` • ${creationAgent}` : ""})`
    );
    alert(`✅ Đã tạo ${creationCount} license mới!`);
    refreshData();
  }

  async function assignLicense(id: string, licenseKey: string, agentEmail: string) {
    setBusy(true);
    const { error } = await supabase
      .from("licenses")
      .update({ dai_ly_id: agentEmail || null })
      .eq("id", id);
    setBusy(false);

    if (error) {
      console.error("❌ Lỗi gán license", error);
      alert(`❌ Không thể gán license: ${error.message}`);
      return;
    }

    await addLog(
      "assign",
      `Gán license ${licenseKey} cho ${agentEmail || "(bỏ gán)"}`
    );
    setAssigningId(null);
    refreshData();
  }

  async function extendLicense(id: string, licenseKey: string) {
    setBusy(true);
    const { error } = await supabase.rpc("extend_license_30days", {
      license_id: id,
    });
    setBusy(false);
    if (error) {
      alert("⚠️ RPC extend_license_30days chưa khả dụng.");
      return;
    }
    await addLog("extend", `Gia hạn 30 ngày cho ${licenseKey}`);
    refreshData();
  }

  async function deleteLicense(id: string, licenseKey: string) {
    if (!confirm(`Xoá license ${licenseKey}?`)) return;
    setBusy(true);
    const { error } = await supabase.from("licenses").delete().eq("id", id);
    setBusy(false);
    if (error) {
      alert(`❌ Không thể xoá: ${error.message}`);
      return;
    }
    await addLog("delete", `Xoá license ${licenseKey}`);
    refreshData();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(items: LicenseRecord[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = items.every((item) => next.has(item.id));
      if (allSelected) {
        items.forEach((item) => next.delete(item.id));
      } else {
        items.forEach((item) => next.add(item.id));
      }
      return next;
    });
  }

  const agentOptions = useMemo(() => {
    const fromData = Array.from(
      new Set(licenses.map((l) => l.dai_ly_id).filter(Boolean) as string[])
    );
    const merged = Array.from(new Set([...fromData, ...agents]));
    return merged.sort((a, b) => a.localeCompare(b));
  }, [agents, licenses]);

  const batchOptions = useMemo(() => {
    return Array.from(
      new Set(licenses.map((l) => l.batch_id).filter(Boolean) as string[])
    );
  }, [licenses]);

  function calcStatus(license: LicenseRecord) {
    const expiresAt = license.expires_at ? new Date(license.expires_at) : null;
    if (expiresAt && expiresAt < new Date()) return "expired";
    if (expiresAt) {
      const soon = new Date();
      soon.setDate(soon.getDate() + SOON_THRESHOLD_DAYS);
      if (expiresAt <= soon) return "expiring";
    }
    if (license.is_used) return "used";
    if (license.dai_ly_id) return "assigned";
    return "unused";
  }

  const filteredLicenses = useMemo(() => {
    const lowerKeyword = keyword.trim().toLowerCase();
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return licenses.filter((license) => {
      if (agentFilter !== "all" && license.dai_ly_id !== agentFilter) return false;
      if (batchFilter !== "all" && license.batch_id !== batchFilter) return false;

      if (statusFilter !== "all") {
        const status = calcStatus(license) as StatusFilter;
        if (statusFilter === "unused" && status !== "unused") return false;
        else if (statusFilter === "used" && status !== "used") return false;
        else if (statusFilter === "assigned" && status !== "assigned")
          return false;
        else if (statusFilter === "unassigned" && license.dai_ly_id)
          return false;
        else if (statusFilter === "expiring" && status !== "expiring")
          return false;
        else if (statusFilter === "expired" && status !== "expired")
          return false;
      }

      if (fromDate) {
        const created = new Date(license.created_at);
        if (created < fromDate) return false;
      }
      if (toDate) {
        const created = new Date(license.created_at);
        if (created > toDate) return false;
      }

      if (lowerKeyword) {
        const keywords = [
          license.license_key,
          license.dai_ly_id ?? "",
          license.email ?? "",
          license.batch_id ?? "",
        ].join(" ").toLowerCase();
        if (!keywords.includes(lowerKeyword)) return false;
      }

      return true;
    });
  }, [
    licenses,
    agentFilter,
    batchFilter,
    statusFilter,
    keyword,
    dateFrom,
    dateTo,
  ]);

  const summary = useMemo(() => {
    const total = licenses.length;
    const used = licenses.filter((l) => Boolean(l.is_used)).length;
    const assigned = licenses.filter((l) => Boolean(l.dai_ly_id)).length;
    const unassigned = total - assigned;
    const unused = total - used;
    const expired = licenses.filter((l) => calcStatus(l) === "expired").length;
    const expiringSoon = licenses.filter((l) => calcStatus(l) === "expiring").length;

    return {
      total,
      used,
      unused,
      assigned,
      unassigned,
      expired,
      expiringSoon,
      usageRate: total ? Math.round((used / total) * 100) : 0,
    };
  }, [licenses]);

  const chartData = useMemo(
    () => [
      { name: "Đã dùng", value: summary.used },
      { name: "Chưa dùng", value: summary.unused },
      { name: "Sắp hết hạn", value: summary.expiringSoon },
      { name: "Hết hạn", value: summary.expired },
    ],
    [summary]
  );

  const agentDistribution = useMemo(() => {
    const map = new Map<string, { total: number; used: number }>();
    licenses.forEach((license) => {
      const key = license.dai_ly_id || "Chưa gán";
      if (!map.has(key)) {
        map.set(key, { total: 0, used: 0 });
      }
      const entry = map.get(key)!;
      entry.total += 1;
      if (license.is_used) entry.used += 1;
    });
    return Array.from(map.entries())
      .map(([agent, stats]) => ({
        agent,
        ...stats,
      }))
      .sort((a, b) => b.total - a.total);
  }, [licenses]);

  const selectedRecords = useMemo(() => {
    return licenses.filter((l) => selectedIds.has(l.id));
  }, [licenses, selectedIds]);

  const allFilteredSelected = useMemo(() => {
    if (!filteredLicenses.length) return false;
    return filteredLicenses.every((item) => selectedIds.has(item.id));
  }, [filteredLicenses, selectedIds]);

  function exportFiltered() {
    if (!filteredLicenses.length) {
      alert("⚠️ Không có dữ liệu để xuất.");
      return;
    }
    exportCSV("licenses_filter", buildCsvRows(filteredLicenses));
  }

  function exportSelected() {
    if (!selectedRecords.length) {
      alert("⚠️ Hãy chọn ít nhất 1 license.");
      return;
    }
    exportCSV("licenses_selected", buildCsvRows(selectedRecords));
  }

  function exportByAgent() {
    if (!filteredLicenses.length) {
      alert("⚠️ Không có dữ liệu để xuất.");
      return;
    }
    const grouped = filteredLicenses.reduce(
      (acc, license) => {
        const key = license.dai_ly_id || "ChuaGan";
        if (!acc[key]) acc[key] = [];
        acc[key].push(license);
        return acc;
      },
      {} as Record<string, LicenseRecord[]>
    );

    Object.entries(grouped).forEach(([agent, rows]) => {
      const fileName = `licenses_${sanitizeFileName(agent)}`;
      exportCSV(fileName, buildCsvRows(rows));
    });
  }

  const filteredCount = filteredLicenses.length;

  return (
    <div className="space-y-6 text-sm">
      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="rounded-2xl border border-red-500/40 bg-[#111] px-6 py-4 text-center text-gray-200 shadow-2xl">
            ⏳ Hệ thống Hải Soft đang xử lý...
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#2a2a2f] bg-[#141416] p-5 shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <FaKey className="text-red-500" /> Trung tâm License
            </h2>
            <p className="text-gray-400">
              Tạo, phân phối và giám sát license trong một màn hình duy nhất.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={refreshData}
              className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#1c1c1f] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-200 hover:border-red-500"
            >
              <FaSync /> Làm mới
            </button>
            <button
              onClick={exportFiltered}
              className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#1c1c1f] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-200 hover:border-red-500"
            >
              <FaDownload /> Export bộ lọc
            </button>
            <button
              onClick={exportSelected}
              className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#1c1c1f] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-200 hover:border-red-500"
            >
              <FaDownload /> Export đã chọn
            </button>
            <button
              onClick={exportByAgent}
              className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#1c1c1f] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-200 hover:border-red-500"
            >
              <FaDownload /> Export theo đại lý
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-gradient-to-br from-[#1b1b1f] to-[#131316] p-4 border border-red-500/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-400">
              Tổng số key
            </p>
            <p className="mt-2 text-3xl font-black text-white">{summary.total}</p>
            <p className="text-xs text-gray-400">Usage rate {summary.usageRate}%</p>
          </div>
          <div className="rounded-xl bg-[#111]/80 p-4 border border-[#27272a]">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Đã kích hoạt
            </p>
            <p className="mt-2 text-2xl font-bold text-green-400">{summary.used}</p>
            <p className="text-xs text-gray-500">Còn lại: {summary.unused}</p>
          </div>
          <div className="rounded-xl bg-[#111]/80 p-4 border border-[#27272a]">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Đang thuộc đại lý
            </p>
            <p className="mt-2 text-2xl font-bold text-amber-300">{summary.assigned}</p>
            <p className="text-xs text-gray-500">Chưa gán: {summary.unassigned}</p>
          </div>
          <div className="rounded-xl bg-[#111]/80 p-4 border border-[#27272a]">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Cảnh báo
            </p>
            <p className="mt-2 text-lg font-semibold text-red-400">
              {summary.expiringSoon} sắp hết hạn • {summary.expired} đã hết hạn
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#2a2a2f] bg-[#141416] p-5 shadow-lg">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
          <FaLayerGroup className="text-red-500" /> Tạo License / Batch
        </h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-xs uppercase tracking-wide text-gray-400">
              License tuỳ chỉnh
            </label>
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                value={creationKey}
                onChange={(e) => setCreationKey(e.target.value)}
                placeholder="Nhập hoặc bấm Sinh key tự động"
                className="flex-1 rounded-lg border border-[#27272a] bg-[#111] px-3 py-2 text-gray-200 focus:border-red-500"
              />
              <button
                onClick={() => setCreationKey(generateKey())}
                className="rounded-lg border border-[#27272a] bg-[#1c1c1f] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-200 hover:border-red-500"
              >
                Sinh key
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="block text-xs uppercase tracking-wide text-gray-400">
                  Số ngày hiệu lực
                </label>
                <input
                  type="number"
                  min={0}
                  value={creationDuration}
                  onChange={(e) => setCreationDuration(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#27272a] bg-[#111] px-3 py-2 text-gray-200 focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-gray-400">
                  Gán cho đại lý
                </label>
                <select
                  value={creationAgent}
                  onChange={(e) => setCreationAgent(e.target.value)}
                  className="w-full rounded-lg border border-[#27272a] bg-[#111] px-3 py-2 text-gray-200 focus:border-red-500"
                >
                  <option value="">-- Không gán --</option>
                  {agentOptions.map((agent) => (
                    <option key={agent} value={agent}>
                      {agent}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={createSingleLicense}
                  className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-900/30 hover:bg-red-500"
                >
                  <FaPlus className="mr-2 inline" /> Tạo key đơn
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <label className="block text-xs uppercase tracking-wide text-gray-400">
              Tạo batch tự động
            </label>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="block text-xs uppercase tracking-wide text-gray-400">
                  Số lượng key
                </label>
                <input
                  type="number"
                  min={1}
                  value={creationCount}
                  onChange={(e) => setCreationCount(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#27272a] bg-[#111] px-3 py-2 text-gray-200 focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-gray-400">
                  Gán cho đại lý
                </label>
                <select
                  value={creationAgent}
                  onChange={(e) => setCreationAgent(e.target.value)}
                  className="w-full rounded-lg border border-[#27272a] bg-[#111] px-3 py-2 text-gray-200 focus:border-red-500"
                >
                  <option value="">-- Không gán --</option>
                  {agentOptions.map((agent) => (
                    <option key={`batch-${agent}`} value={agent}>
                      {agent}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={createBatchLicenses}
                  className="w-full rounded-lg border border-red-600 bg-transparent px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-600/20"
                >
                  <FaLayerGroup className="mr-2 inline" /> Tạo batch
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Batch mới sẽ tự động sinh <span className="text-red-400">batch_id UUID</span>
              và gom nhóm trong báo cáo.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#2a2a2f] bg-[#141416] p-5 shadow-lg">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
          <FaFilter className="text-red-500" /> Bộ lọc thông minh
        </h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="block text-xs uppercase tracking-wide text-gray-400">
              Từ khoá
            </label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="License / đại lý / email / batch"
              className="w-full rounded-lg border border-[#27272a] bg-[#111] px-3 py-2 text-gray-200 focus:border-red-500"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-400">
              Trạng thái
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full rounded-lg border border-[#27272a] bg-[#111] px-3 py-2 text-gray-200 focus:border-red-500"
            >
              <option value="all">Tất cả</option>
              <option value="unused">Chưa dùng</option>
              <option value="used">Đã dùng</option>
              <option value="assigned">Đã gán đại lý</option>
              <option value="unassigned">Chưa gán đại lý</option>
              <option value="expiring">Sắp hết hạn (&lt;=7 ngày)</option>
              <option value="expired">Đã hết hạn</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-400">
              Đại lý
            </label>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-full rounded-lg border border-[#27272a] bg-[#111] px-3 py-2 text-gray-200 focus:border-red-500"
            >
              <option value="all">Tất cả</option>
              {agentOptions.map((agent) => (
                <option key={`filter-agent-${agent}`} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-400">
              Batch ID
            </label>
            <select
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="w-full rounded-lg border border-[#27272a] bg-[#111] px-3 py-2 text-gray-200 focus:border-red-500"
            >
              <option value="all">Tất cả</option>
              {batchOptions.map((batch) => (
                <option key={`batch-${batch}`} value={batch}>
                  {batch}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-400">
              Từ ngày
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-[#27272a] bg-[#111] px-3 py-2 text-gray-200 focus:border-red-500"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-400">
              Đến ngày
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-[#27272a] bg-[#111] px-3 py-2 text-gray-200 focus:border-red-500"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-400">
          <span>
            <FaFilter className="mr-1 inline text-red-500" /> Đang hiển thị {filteredCount}{" "}
            / {licenses.length} license
          </span>
          <button
            onClick={() => {
              setKeyword("");
              setStatusFilter("all");
              setAgentFilter("all");
              setBatchFilter("all");
              setDateFrom("");
              setDateTo("");
            }}
            className="rounded-lg border border-[#27272a] bg-transparent px-3 py-1 text-xs text-gray-300 hover:border-red-500"
          >
            Reset bộ lọc
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[#2a2a2f] bg-[#141416] p-5 shadow-lg">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
            <FaClipboardList className="text-red-500" /> Danh sách license
          </h3>
          {filteredCount > 0 && (
            <button
              onClick={() => toggleSelectAll(filteredLicenses)}
              className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#1c1c1f] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-200 hover:border-red-500"
            >
              {allFilteredSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            </button>
          )}
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-[#1f1f23]">
          <table className="min-w-full text-left text-xs text-gray-200">
            <thead className="bg-[#111] text-[11px] uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-3 py-3">Chọn</th>
                <th className="px-3 py-3">License</th>
                <th className="px-3 py-3">Đại lý</th>
                <th className="px-3 py-3">Batch</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-3 py-3">Tạo lúc</th>
                <th className="px-3 py-3">Hết hạn</th>
                <th className="px-3 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : filteredLicenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                    Không tìm thấy license phù hợp.
                  </td>
                </tr>
              ) : (
                filteredLicenses.map((license) => {
                  const status = calcStatus(license);
                  const expiresAt = license.expires_at
                    ? new Date(license.expires_at)
                    : null;
                  const createdAt = new Date(license.created_at);
                  const statusColor =
                    status === "expired"
                      ? "text-red-400"
                      : status === "expiring"
                      ? "text-amber-300"
                      : status === "used"
                      ? "text-green-400"
                      : status === "assigned"
                      ? "text-blue-300"
                      : "text-gray-300";

                  return (
                    <tr
                      key={license.id}
                      className="border-t border-[#1f1f23] bg-[#121214] hover:bg-[#1a1a1f]"
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(license.id)}
                          onChange={() => toggleSelect(license.id)}
                        />
                      </td>
                      <td className="px-3 py-3 font-semibold text-white">
                        {license.license_key}
                      </td>
                      <td className="px-3 py-3">
                        {assigningId === license.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={assigningAgent}
                              onChange={(e) => setAssigningAgent(e.target.value)}
                              className="rounded-lg border border-[#27272a] bg-[#111] px-2 py-1 text-gray-200 focus:border-red-500"
                            >
                              <option value="">-- Không gán --</option>
                              {agentOptions.map((agent) => (
                                <option key={`assign-${agent}`} value={agent}>
                                  {agent}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() =>
                                assignLicense(
                                  license.id,
                                  license.license_key,
                                  assigningAgent
                                )
                              }
                              className="rounded-lg bg-green-600 px-2 py-1 text-white hover:bg-green-500"
                            >
                              <FaCheck />
                            </button>
                            <button
                              onClick={() => setAssigningId(null)}
                              className="rounded-lg bg-gray-700 px-2 py-1 text-white hover:bg-gray-600"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>{license.dai_ly_id ?? "—"}</span>
                            <button
                              onClick={() => {
                                setAssigningId(license.id);
                                setAssigningAgent(license.dai_ly_id ?? "");
                              }}
                              className="rounded-lg border border-[#27272a] bg-[#1c1c1f] px-2 py-1 text-[11px] text-gray-200 hover:border-red-500"
                            >
                              <FaUserTag className="inline" /> Gán
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-400">
                        {license.batch_id ?? "—"}
                      </td>
                      <td className={`px-3 py-3 font-semibold ${statusColor}`}>
                        {status === "unused" && "Chưa gán"}
                        {status === "used" && "Đã dùng"}
                        {status === "assigned" && "Đã gán đại lý"}
                        {status === "expiring" && "Sắp hết hạn"}
                        {status === "expired" && "Đã hết hạn"}
                      </td>
                      <td className="px-3 py-3 text-gray-400">
                        {createdAt.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-gray-400">
                        {expiresAt ? expiresAt.toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => extendLicense(license.id, license.license_key)}
                            className="rounded-lg border border-[#27272a] bg-[#1c1c1f] px-2 py-1 text-[11px] text-gray-200 hover:border-red-500"
                          >
                            <FaClock className="mr-1 inline" /> +30d
                          </button>
                          <button
                            onClick={() => deleteLicense(license.id, license.license_key)}
                            className="rounded-lg border border-red-500 bg-red-600/10 px-2 py-1 text-[11px] text-red-300 hover:bg-red-600/30"
                          >
                            <FaTrash className="mr-1 inline" /> Xoá
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-[#2a2a2f] bg-[#141416] p-5 shadow-lg">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
          <FaChartPie className="text-red-500" /> Báo cáo tổng hợp
        </h3>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-[#1f1f23] bg-[#111] p-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#888" />
                <YAxis stroke="#666" allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "#1a1a1f" }}
                  contentStyle={{
                    backgroundColor: "#1c1c1f",
                    border: "1px solid #27272a",
                    borderRadius: 12,
                    color: "#f5f5f5",
                  }}
                />
                <Bar dataKey="value" fill="#ef4444" radius={[8, 8, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {agentDistribution.slice(0, 6).map((agent) => (
              <div
                key={`agent-stat-${agent.agent}`}
                className="flex items-center justify-between rounded-lg border border-[#1f1f23] bg-[#111] px-3 py-2 text-xs text-gray-300"
              >
                <div>
                  <p className="font-semibold text-white">{agent.agent}</p>
                  <p className="text-[11px] text-gray-500">
                    {agent.used} đã kích hoạt / {agent.total} tổng key
                  </p>
                </div>
                <div className="text-right text-[11px] text-gray-400">
                  {agent.total ? Math.round((agent.used / agent.total) * 100) : 0}%
                </div>
              </div>
            ))}
            {agentDistribution.length === 0 && (
              <p className="rounded-lg border border-[#1f1f23] bg-[#111] px-3 py-2 text-center text-gray-500">
                Chưa có dữ liệu phân phối đại lý.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
