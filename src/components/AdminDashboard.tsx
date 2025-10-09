
import { useEffect, useMemo, useState } from "react";
import {
  FaPlus,
  FaUsers,
  FaChartBar,
  FaDownload,
  FaSync,
  FaLayerGroup,
  FaSearch,
} from "react-icons/fa";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { supabase } from "../lib/supabaseClient";
import { exportCSV } from "../utils/exportCSV";

type LicenseRecord = {
  id?: string;
  license_key: string;
  batch_id?: string | null;
  agent_email?: string | null;
  status?: string | null;
  is_used?: boolean | null;
  created_at?: string | null;
  expires_at?: string | null;
  used_at?: string | null;
  assigned_at?: string | null;
};

type LicenseBatch = {
  id?: string;
  batch_id: string;
  name?: string | null;
  created_by?: string | null;
  created_at?: string | null;
};

type AgentRecord = {
  id?: string;
  email: string;
  name?: string | null;
};

type LicenseLog = {
  id?: string;
  created_at?: string | null;
  action?: string | null;
  message?: string | null;
};

type CreationMode = "single" | "bulk";
type ExportMode = "filtered" | "split" | "selected";

type DateField = "created_at" | "expires_at";

type BatchSelectionState = Record<string, string>;

type StatusKey = "used" | "unused" | "expired";

type AgentMap = Record<string, AgentRecord>;

const STATUS_LABELS: Record<StatusKey, string> = {
  used: "Used",
  unused: "Unused",
  expired: "Expired",
};

const statusClass = (status: StatusKey) => {
  switch (status) {
    case "used":
      return "text-green-400";
    case "expired":
      return "text-red-400";
    default:
      return "text-gray-200";
  }
};

const ensureUUID = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
};

const randomKey = (length = 16) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join("");
};

const formatDisplayDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
};

const sanitizeFilename = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "licenses";

const computeStatus = (license: LicenseRecord): StatusKey => {
  const normalized = (license.status || "").toLowerCase();
  if (normalized === "used") return "used";
  if (normalized === "expired") return "expired";
  if (normalized === "unused") return "unused";

  const now = Date.now();
  const expiresAt = license.expires_at ? new Date(license.expires_at).getTime() : null;
  if (expiresAt && expiresAt < now) return "expired";
  if (license.is_used || license.used_at) return "used";
  return "unused";
};

const buildCsvRow = (license: LicenseRecord, agentMap: AgentMap) => {
  const status = computeStatus(license);
  const agent = license.agent_email || "";
  const agentName = agent ? agentMap[agent]?.name ?? "" : "";
  return {
    license_key: license.license_key,
    batch_id: license.batch_id ?? "",
    agent_email: agent,
    agent_name: agentName,
    status: STATUS_LABELS[status],
    created_at: license.created_at ?? "",
    expires_at: license.expires_at ?? "",
    used_at: license.used_at ?? "",
    assigned_at: license.assigned_at ?? "",
  };
};

export default function AdminDashboard() {
  const [mainTab, setMainTab] = useState<"license-manager" | "activity">(
    "license-manager"
  );
  const [subTab, setSubTab] = useState<
    "licenses" | "batches" | "agents" | "reports"
  >("licenses");

  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [batches, setBatches] = useState<LicenseBatch[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [logs, setLogs] = useState<LicenseLog[]>([]);

  const [loadingLicenses, setLoadingLicenses] = useState(false);
  const [busy, setBusy] = useState(false);

  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");

  const [creationMode, setCreationMode] = useState<CreationMode>("single");
  const [manualKey, setManualKey] = useState("");
  const [bulkCount, setBulkCount] = useState(10);
  const [generationType, setGenerationType] = useState<"uuid" | "random16">(
    "random16"
  );
  const [batchName, setBatchName] = useState("");
  const [assignOnCreate, setAssignOnCreate] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");

  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | StatusKey>("all");
  const [keyword, setKeyword] = useState("");
  const [dateField, setDateField] = useState<DateField>("created_at");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [selectedLicenses, setSelectedLicenses] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [batchAgentSelections, setBatchAgentSelections] = useState<
    BatchSelectionState
  >({});

  useEffect(() => {
    const init = async () => {
      await Promise.all([
        fetchLicenses(),
        fetchBatches(),
        fetchAgents(),
        fetchLogs(),
        fetchCurrentUser(),
      ]);
    };

    init();

    const licenseChannel = supabase
      .channel("licenses-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "licenses" },
        () => fetchLicenses()
      )
      .subscribe();

    const batchChannel = supabase
      .channel("license-batches-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "license_batches" },
        () => fetchBatches()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(licenseChannel);
      supabase.removeChannel(batchChannel);
    };
  }, []);

  useEffect(() => {
    setSelectedLicenses(new Set());
  }, [agentFilter, batchFilter, statusFilter, keyword, dateFrom, dateTo, dateField]);

  const fetchCurrentUser = async () => {
    const { data } = await supabase.auth.getUser();
    const email = data?.user?.email || "admin@hai-soft.local";
    setCurrentUserEmail(email);
  };

  const fetchLicenses = async () => {
    setLoadingLicenses(true);
    const { data, error } = await supabase
      .from("licenses")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) {
      setLicenses(data as LicenseRecord[]);
    }
    setLoadingLicenses(false);
  };

  const fetchBatches = async () => {
    const { data } = await supabase
      .from("license_batches")
      .select("*")
      .order("created_at", { ascending: false });
    setBatches((data || []) as LicenseBatch[]);
  };

  const fetchAgents = async () => {
    const { data } = await supabase
      .from("agents")
      .select("id, name, email")
      .order("name", { ascending: true });
    if (data) setAgents(data as AgentRecord[]);
  };

  const fetchLogs = async () => {
    const { data } = await supabase
      .from("license_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs((data || []) as LicenseLog[]);
  };

  const agentMap = useMemo<AgentMap>(() => {
    const map: AgentMap = {};
    agents.forEach((agent) => {
      map[agent.email] = agent;
    });
    return map;
  }, [agents]);

  const licenseId = (license: LicenseRecord) => license.id || license.license_key;

  const toggleLicenseSelection = (id: string) => {
    setSelectedLicenses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = (rows: LicenseRecord[]) => {
    setSelectedLicenses((prev) => {
      const next = new Set(prev);
      const allSelected = rows.every((row) => next.has(licenseId(row)));
      if (allSelected) {
        rows.forEach((row) => next.delete(licenseId(row)));
      } else {
        rows.forEach((row) => next.add(licenseId(row)));
      }
      return next;
    });
  };

  const filteredLicenses = useMemo(() => {
    const keywordLower = keyword.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTime = dateTo ? new Date(dateTo).getTime() : null;

    return licenses.filter((license) => {
      const status = computeStatus(license);

      if (agentFilter !== "all") {
        const agentKey = license.agent_email || "unassigned";
        if (agentKey !== agentFilter) return false;
      }

      if (batchFilter !== "all") {
        if ((license.batch_id || "") !== batchFilter) return false;
      }

      if (statusFilter !== "all" && status !== statusFilter) {
        return false;
      }

      if (keywordLower) {
        const haystack = [
          license.license_key,
          license.agent_email || "",
          license.batch_id || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(keywordLower)) return false;
      }

      if (fromTime || toTime) {
        const fieldValue = license[dateField];
        if (!fieldValue) return false;
        const fieldTime = new Date(fieldValue).getTime();
        if (Number.isNaN(fieldTime)) return false;
        if (fromTime && fieldTime < fromTime) return false;
        if (toTime) {
          const inclusiveEnd = toTime + 24 * 60 * 60 * 1000 - 1;
          if (fieldTime > inclusiveEnd) return false;
        }
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
    dateField,
  ]);

  const batchSummary = useMemo(() => {
    const summary = new Map<
      string,
      {
        total: number;
        used: number;
        expired: number;
        unassigned: number;
        agents: Set<string>;
      }
    >();

    licenses.forEach((license) => {
      if (!license.batch_id) return;
      const status = computeStatus(license);
      if (!summary.has(license.batch_id)) {
        summary.set(license.batch_id, {
          total: 0,
          used: 0,
          expired: 0,
          unassigned: 0,
          agents: new Set<string>(),
        });
      }
      const record = summary.get(license.batch_id)!;
      record.total += 1;
      if (status === "used") record.used += 1;
      if (status === "expired") record.expired += 1;
      if (!license.agent_email) {
        record.unassigned += 1;
      } else {
        record.agents.add(license.agent_email);
      }
    });

    return summary;
  }, [licenses]);

  const agentSummary = useMemo(() => {
    const summary = new Map<
      string,
      { total: number; used: number; expired: number }
    >();

    licenses.forEach((license) => {
      const key = license.agent_email || "unassigned";
      if (!summary.has(key)) {
        summary.set(key, { total: 0, used: 0, expired: 0 });
      }
      const stats = summary.get(key)!;
      const status = computeStatus(license);
      stats.total += 1;
      if (status === "used") stats.used += 1;
      if (status === "expired") stats.expired += 1;
    });

    return summary;
  }, [licenses]);

  const reportMetrics = useMemo(() => {
    const now = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);

    let used = 0;
    let unused = 0;
    let expired = 0;
    let expiringSoon = 0;

    const byAgent = new Map<
      string,
      { total: number; used: number; expired: number }
    >();
    const byDay = new Map<string, number>();

    licenses.forEach((license) => {
      const status = computeStatus(license);
      if (status === "used") used += 1;
      else if (status === "expired") expired += 1;
      else unused += 1;

      if (license.expires_at) {
        const expiryDate = new Date(license.expires_at);
        if (
          !Number.isNaN(expiryDate.getTime()) &&
          expiryDate >= now &&
          expiryDate <= soon
        ) {
          expiringSoon += 1;
        }
      }

      const agentKey = license.agent_email || "unassigned";
      if (!byAgent.has(agentKey)) {
        byAgent.set(agentKey, { total: 0, used: 0, expired: 0 });
      }
      const agentStats = byAgent.get(agentKey)!;
      agentStats.total += 1;
      if (status === "used") agentStats.used += 1;
      if (status === "expired") agentStats.expired += 1;

      if (license.created_at) {
        const createdDate = new Date(license.created_at);
        if (!Number.isNaN(createdDate.getTime())) {
          const dateKey = createdDate.toISOString().slice(0, 10);
          byDay.set(dateKey, (byDay.get(dateKey) || 0) + 1);
        }
      }
    });

    const topAgents = Array.from(byAgent.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .map(([agentKey, stats]) => ({
        agentKey,
        displayName:
          agentKey === "unassigned"
            ? "Unassigned"
            : agentMap[agentKey]?.name
            ? `${agentMap[agentKey].name} (${agentKey})`
            : agentKey,
        ...stats,
      }));

    const chartData = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({
        date,
        count,
      }));

    return {
      total: licenses.length,
      used,
      unused,
      expired,
      expiringSoon,
      topAgents,
      chartData,
    };
  }, [licenses, agentMap]);

  const allAgentsForFilter = useMemo(() => {
    const values = new Set<string>();
    licenses.forEach((license) => {
      values.add(license.agent_email || "unassigned");
    });
    return Array.from(values);
  }, [licenses]);

  const batchOptions = useMemo(() => {
    const values = new Set<string>();
    licenses.forEach((license) => {
      if (license.batch_id) values.add(license.batch_id);
    });
    return Array.from(values);
  }, [licenses]);

  const selectedRows = useMemo(() => {
    return licenses.filter((license) =>
      selectedLicenses.has(licenseId(license))
    );
  }, [licenses, selectedLicenses]);

  const handleGenerateManualKey = () => {
    if (generationType === "uuid") {
      setManualKey(ensureUUID());
    } else {
      setManualKey(randomKey());
    }
  };

  const handleCreateLicenses = async () => {
    if (!batchName.trim()) {
      alert("Please provide a batch name.");
      return;
    }

    if (creationMode === "single" && !manualKey.trim()) {
      alert("Please enter or generate a license key.");
      return;
    }

    if (creationMode === "bulk" && (bulkCount < 1 || bulkCount > 5000)) {
      alert("Please select a quantity between 1 and 5000.");
      return;
    }

    setBusy(true);
    const batchId = ensureUUID();
    const createdBy = currentUserEmail || "admin@hai-soft.local";

    const { error: batchError } = await supabase.from("license_batches").insert([
      {
        batch_id: batchId,
        name: batchName.trim(),
        created_by: createdBy,
      },
    ]);

    if (batchError) {
      console.error("Failed to create batch", batchError);
      alert(`Failed to create batch: ${batchError.message}`);
      setBusy(false);
      return;
    }

    const basePayload = {
      batch_id: batchId,
      agent_email: assignOnCreate || null,
      status: "unused",
      expires_at: expiresAt || null,
    };

    let licensesPayload: Partial<LicenseRecord>[] = [];

    if (creationMode === "single") {
      licensesPayload = [
        {
          ...basePayload,
          license_key: manualKey.trim(),
        },
      ];
    } else {
      const payload: Partial<LicenseRecord>[] = [];
      for (let i = 0; i < bulkCount; i += 1) {
        payload.push({
          ...basePayload,
          license_key:
            generationType === "uuid" ? ensureUUID() : randomKey(),
        });
      }
      licensesPayload = payload;
    }

    const { error: licenseError } = await supabase
      .from("licenses")
      .insert(licensesPayload);

    setBusy(false);

    if (licenseError) {
      console.error("Failed to create licenses", licenseError);
      alert(`Failed to create licenses: ${licenseError.message}`);
      return;
    }

    setManualKey("");
    setBulkCount(10);
    setBatchName("");
    setAssignOnCreate("");
    setExpiresAt("");

    await Promise.all([fetchLicenses(), fetchBatches()]);
    alert("Licenses created successfully.");
  };

  const handleAssignLicenses = async () => {
    if (!selectedAgent) {
      alert("Please choose an agent to assign.");
      return;
    }

    if (!selectedLicenses.size) {
      alert("Please select at least one license.");
      return;
    }

    setBusy(true);
    const ids = Array.from(selectedLicenses);
    const { error } = await supabase
      .from("licenses")
      .update({
        agent_email: selectedAgent,
        assigned_at: new Date().toISOString(),
      })
      .in("id", ids);

    setBusy(false);

    if (error) {
      console.error("Failed to assign licenses", error);
      alert(`Failed to assign licenses: ${error.message}`);
      return;
    }

    setSelectedLicenses(new Set());
    setSelectedAgent("");
    await fetchLicenses();
    alert("Assigned licenses successfully.");
  };

  const handleAssignBatch = async (batchId: string) => {
    const agent = batchAgentSelections[batchId];
    if (!agent) {
      alert("Please select an agent for this batch.");
      return;
    }

    setBusy(true);
    const { error } = await supabase
      .from("licenses")
      .update({
        agent_email: agent,
        assigned_at: new Date().toISOString(),
      })
      .eq("batch_id", batchId);

    setBusy(false);

    if (error) {
      console.error("Failed to assign batch", error);
      alert(`Failed to assign batch: ${error.message}`);
      return;
    }

    await fetchLicenses();
    alert("Assigned batch successfully.");
  };

  const exportLicenses = (mode: ExportMode) => {
    const dateSuffix = new Date().toISOString().slice(0, 10);

    if (mode === "filtered") {
      if (!filteredLicenses.length) {
        alert("There are no licenses to export.");
        return;
      }

      exportCSV(
        `licenses_filtered_${dateSuffix}`,
        filteredLicenses.map((license) => buildCsvRow(license, agentMap))
      );
      return;
    }

    if (mode === "selected") {
      if (!selectedRows.length) {
        alert("Select at least one license to export.");
        return;
      }
      exportCSV(
        `licenses_selected_${dateSuffix}`,
        selectedRows.map((license) => buildCsvRow(license, agentMap))
      );
      return;
    }

    const grouped = new Map<string, LicenseRecord[]>();
    filteredLicenses.forEach((license) => {
      const key = license.agent_email || "unassigned";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(license);
    });

    if (!grouped.size) {
      alert("There are no licenses to export.");
      return;
    }

    grouped.forEach((rows, key) => {
      const filename = `licenses_${sanitizeFilename(key)}_${dateSuffix}`;
      exportCSV(
        filename,
        rows.map((license) => buildCsvRow(license, agentMap))
      );
    });
  };

  const refreshAll = async () => {
    await Promise.all([
      fetchLicenses(),
      fetchBatches(),
      fetchAgents(),
      fetchLogs(),
    ]);
  };

  const renderLicenseManagerHeader = () => (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl font-bold text-red-500 flex items-center gap-3">
          <FaChartBar className="text-red-400" /> Hai Soft License Manager
        </h1>
        <p className="text-gray-400 text-sm">
          Create, assign, track, and export license keys in one place.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={refreshAll}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
        >
          <FaSync /> Refresh
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => exportLicenses("filtered")}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg text-sm"
          >
            <FaDownload /> Export (filtered)
          </button>
          <button
            onClick={() => exportLicenses("split")}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
          >
            <FaDownload /> Export by agent
          </button>
          <button
            onClick={() => exportLicenses("selected")}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
          >
            <FaDownload /> Export selection
          </button>
        </div>
      </div>
    </div>
  );

  const renderCreationPanel = () => (
    <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl p-6 mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <FaPlus className="text-red-400" /> Create license keys
        </h2>
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => setCreationMode("single")}
            className={`px-3 py-1 rounded-lg border ${
              creationMode === "single"
                ? "border-red-500 text-red-400"
                : "border-transparent bg-gray-900 text-gray-400"
            }`}
          >
            Single key
          </button>
          <button
            onClick={() => setCreationMode("bulk")}
            className={`px-3 py-1 rounded-lg border ${
              creationMode === "bulk"
                ? "border-red-500 text-red-400"
                : "border-transparent bg-gray-900 text-gray-400"
            }`}
          >
            Bulk create
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-2 text-sm text-gray-300">
          Batch name
          <input
            className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
            value={batchName}
            onChange={(event) => setBatchName(event.target.value)}
            placeholder="E.g. Promo March 2024"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-gray-300">
          Assign to agent (optional)
          <select
            className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
            value={assignOnCreate}
            onChange={(event) => setAssignOnCreate(event.target.value)}
          >
            <option value="">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.email} value={agent.email}>
                {agent.name ? `${agent.name} (${agent.email})` : agent.email}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <label className="flex flex-col gap-2 text-sm text-gray-300">
          Expiration date (optional)
          <input
            type="date"
            className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-gray-300">
          Key generator
          <select
            className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
            value={generationType}
            onChange={(event) => setGenerationType(event.target.value as any)}
          >
            <option value="random16">Random 16 characters</option>
            <option value="uuid">UUID v4</option>
          </select>
        </label>
        {creationMode === "bulk" ? (
          <label className="flex flex-col gap-2 text-sm text-gray-300">
            Quantity
            <input
              type="number"
              min={1}
              max={5000}
              className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
              value={bulkCount}
              onChange={(event) => setBulkCount(Number(event.target.value))}
            />
          </label>
        ) : (
          <label className="flex flex-col gap-2 text-sm text-gray-300">
            License key
            <div className="flex gap-2">
              <input
                className="flex-1 bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
                value={manualKey}
                onChange={(event) => setManualKey(event.target.value)}
                placeholder="Enter or generate key"
              />
              <button
                onClick={handleGenerateManualKey}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
              >
                Generate
              </button>
            </div>
          </label>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleCreateLicenses}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-500 px-5 py-2 rounded-lg text-sm"
        >
          <FaPlus /> Create licenses
        </button>
      </div>
    </div>
  );

  const renderFilterBar = () => (
    <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl p-4 mb-6">
      <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-2 text-sm text-gray-300">
          Agent
          <select
            className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
          >
            <option value="all">All agents</option>
            {allAgentsForFilter.map((agentKey) => (
              <option key={agentKey} value={agentKey}>
                {agentKey === "unassigned"
                  ? "Unassigned"
                  : agentMap[agentKey]?.name
                  ? `${agentMap[agentKey].name} (${agentKey})`
                  : agentKey}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-gray-300">
          Batch
          <select
            className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
            value={batchFilter}
            onChange={(event) => setBatchFilter(event.target.value)}
          >
            <option value="all">All batches</option>
            {batchOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-gray-300">
          Status
          <select
            className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as any)}
          >
            <option value="all">All statuses</option>
            <option value="unused">Unused</option>
            <option value="used">Used</option>
            <option value="expired">Expired</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-gray-300">
          Keyword
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="w-full bg-[#181818] border border-[#2a2a2a] rounded-lg pl-9 pr-3 py-2 text-sm"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Search by key or email"
            />
          </div>
        </label>
      </div>
      <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-4 mt-4">
        <label className="flex flex-col gap-2 text-sm text-gray-300">
          Date field
          <select
            className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
            value={dateField}
            onChange={(event) => setDateField(event.target.value as DateField)}
          >
            <option value="created_at">Created at</option>
            <option value="expires_at">Expires at</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-gray-300">
          From
          <input
            type="date"
            className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-gray-300">
          To
          <input
            type="date"
            className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>
        <div className="flex flex-col gap-2 text-sm text-gray-300">
          &nbsp;
          <button
            onClick={() => {
              setAgentFilter("all");
              setBatchFilter("all");
              setStatusFilter("all");
              setKeyword("");
              setDateFrom("");
              setDateTo("");
              setDateField("created_at");
            }}
            className="mt-auto bg-gray-800 hover:bg-gray-700 text-sm px-4 py-2 rounded-lg"
          >
            Reset filters
          </button>
        </div>
      </div>
    </div>
  );

  const renderLicenseTable = () => (
    <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 border-b border-[#1f1f1f]">
        <div className="flex items-center gap-3 text-sm text-gray-300">
          <FaLayerGroup className="text-red-400" /> {filteredLicenses.length} licenses
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
          <select
            className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
            value={selectedAgent}
            onChange={(event) => setSelectedAgent(event.target.value)}
          >
            <option value="">Select agent</option>
            {agents.map((agent) => (
              <option key={agent.email} value={agent.email}>
                {agent.name ? `${agent.name} (${agent.email})` : agent.email}
              </option>
            ))}
          </select>
          <button
            onClick={handleAssignLicenses}
            className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg text-sm"
          >
            Assign selected
          </button>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-gray-400 uppercase text-xs tracking-wider bg-[#101010]">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={
                    filteredLicenses.length > 0 &&
                    filteredLicenses.every((row) =>
                      selectedLicenses.has(licenseId(row))
                    )
                  }
                  onChange={() => toggleSelectAll(filteredLicenses)}
                />
              </th>
              <th className="px-4 py-3 text-left">License key</th>
              <th className="px-4 py-3 text-left">Batch</th>
              <th className="px-4 py-3 text-left">Agent</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Created</th>
              <th className="px-4 py-3 text-left">Expires</th>
            </tr>
          </thead>
          <tbody>
            {loadingLicenses ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Loading licenses...
                </td>
              </tr>
            ) : !filteredLicenses.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  No licenses match your filters.
                </td>
              </tr>
            ) : (
              filteredLicenses.map((license) => {
                const status = computeStatus(license);
                const agentKey = license.agent_email || "unassigned";
                const agentLabel =
                  agentKey === "unassigned"
                    ? "Unassigned"
                    : agentMap[agentKey]?.name
                    ? `${agentMap[agentKey].name} (${agentKey})`
                    : agentKey;
                return (
                  <tr
                    key={licenseId(license)}
                    className="border-t border-[#1f1f1f] hover:bg-[#181818] transition"
                  >
                    <td className="px-4 py-3 align-middle">
                      <input
                        type="checkbox"
                        checked={selectedLicenses.has(licenseId(license))}
                        onChange={() => toggleLicenseSelection(licenseId(license))}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-200">
                      {license.license_key}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {license.batch_id || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{agentLabel}</td>
                    <td className={`px-4 py-3 font-semibold ${statusClass(status)}`}>
                      {STATUS_LABELS[status]}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {formatDisplayDate(license.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {formatDisplayDate(license.expires_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderBatches = () => (
    <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl">
      <div className="flex items-center justify-between p-4 border-b border-[#1f1f1f]">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <FaLayerGroup className="text-red-400" /> Batches overview
        </h3>
        <span className="text-sm text-gray-400">{batches.length} batches</span>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-gray-400 uppercase text-xs tracking-wider bg-[#101010]">
            <tr>
              <th className="px-4 py-3 text-left">Batch</th>
              <th className="px-4 py-3 text-left">Batch ID</th>
              <th className="px-4 py-3 text-left">Created by</th>
              <th className="px-4 py-3 text-left">Created at</th>
              <th className="px-4 py-3 text-left">Total</th>
              <th className="px-4 py-3 text-left">Used</th>
              <th className="px-4 py-3 text-left">Expired</th>
              <th className="px-4 py-3 text-left">Unassigned</th>
              <th className="px-4 py-3 text-left">Agents</th>
              <th className="px-4 py-3 text-left">Assign</th>
            </tr>
          </thead>
          <tbody>
            {!batches.length ? (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-gray-500">
                  No batches available.
                </td>
              </tr>
            ) : (
              batches.map((batch) => {
                const summary = batchSummary.get(batch.batch_id) || {
                  total: 0,
                  used: 0,
                  expired: 0,
                  unassigned: 0,
                  agents: new Set<string>(),
                };
                const agentList = Array.from(summary.agents);
                return (
                  <tr
                    key={batch.batch_id}
                    className="border-t border-[#1f1f1f] hover:bg-[#181818]"
                  >
                    <td className="px-4 py-3 text-gray-200">{batch.name || "—"}</td>
                    <td className="px-4 py-3 font-mono text-gray-300">
                      {batch.batch_id}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{batch.created_by || "—"}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {formatDisplayDate(batch.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-200">{summary.total}</td>
                    <td className="px-4 py-3 text-green-400">{summary.used}</td>
                    <td className="px-4 py-3 text-red-400">{summary.expired}</td>
                    <td className="px-4 py-3 text-gray-300">{summary.unassigned}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {agentList.length
                        ? agentList
                            .map((agentKey) =>
                              agentMap[agentKey]?.name
                                ? `${agentMap[agentKey].name} (${agentKey})`
                                : agentKey
                            )
                            .join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
                          value={batchAgentSelections[batch.batch_id] || ""}
                          onChange={(event) =>
                            setBatchAgentSelections((prev) => ({
                              ...prev,
                              [batch.batch_id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select agent</option>
                          {agents.map((agent) => (
                            <option key={agent.email} value={agent.email}>
                              {agent.name
                                ? `${agent.name} (${agent.email})`
                                : agent.email}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssignBatch(batch.batch_id)}
                          className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg text-sm"
                        >
                          Assign batch
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
  );

  const renderAgents = () => (
    <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl">
      <div className="flex items-center justify-between p-4 border-b border-[#1f1f1f]">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <FaUsers className="text-red-400" /> Agents
        </h3>
        <span className="text-sm text-gray-400">{agents.length} agents</span>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-gray-400 uppercase text-xs tracking-wider bg-[#101010]">
            <tr>
              <th className="px-4 py-3 text-left">Agent</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Total keys</th>
              <th className="px-4 py-3 text-left">Used</th>
              <th className="px-4 py-3 text-left">Expired</th>
            </tr>
          </thead>
          <tbody>
            {!agents.length ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  No agents found.
                </td>
              </tr>
            ) : (
              agents.map((agent) => {
                const stats = agentSummary.get(agent.email) || {
                  total: 0,
                  used: 0,
                  expired: 0,
                };
                return (
                  <tr
                    key={agent.email}
                    className="border-t border-[#1f1f1f] hover:bg-[#181818]"
                  >
                    <td className="px-4 py-3 text-gray-200">
                      {agent.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{agent.email}</td>
                    <td className="px-4 py-3 text-gray-200">{stats.total}</td>
                    <td className="px-4 py-3 text-green-400">{stats.used}</td>
                    <td className="px-4 py-3 text-red-400">{stats.expired}</td>
                  </tr>
                );
              })
            )}
            <tr className="border-t border-[#1f1f1f] bg-[#151515]">
              <td className="px-4 py-3 text-gray-200 font-semibold">
                Unassigned
              </td>
              <td className="px-4 py-3 text-gray-300">—</td>
              <td className="px-4 py-3 text-gray-200">
                {agentSummary.get("unassigned")?.total || 0}
              </td>
              <td className="px-4 py-3 text-green-400">
                {agentSummary.get("unassigned")?.used || 0}
              </td>
              <td className="px-4 py-3 text-red-400">
                {agentSummary.get("unassigned")?.expired || 0}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="grid gap-6">
      <div className="grid md:grid-cols-4 sm:grid-cols-2 gap-4">
        <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">
            Total keys
          </p>
          <p className="text-3xl font-semibold text-white">
            {reportMetrics.total}
          </p>
        </div>
        <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">
            Used
          </p>
          <p className="text-3xl font-semibold text-green-400">
            {reportMetrics.used}
          </p>
        </div>
        <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">
            Unused
          </p>
          <p className="text-3xl font-semibold text-gray-200">
            {reportMetrics.unused}
          </p>
        </div>
        <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">
            Expired
          </p>
          <p className="text-3xl font-semibold text-red-400">
            {reportMetrics.expired}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Expiring within 7 days
          </h3>
          <p className="text-4xl font-bold text-yellow-400">
            {reportMetrics.expiringSoon}
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Keep agents informed to avoid service interruptions.
          </p>
        </div>
        <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Top agents by volume
          </h3>
          <ul className="space-y-3 text-sm text-gray-300">
            {!reportMetrics.topAgents.length && (
              <li className="text-gray-500">No agent data available.</li>
            )}
            {reportMetrics.topAgents.map((agent) => (
              <li key={agent.agentKey} className="flex justify-between">
                <span>{agent.displayName}</span>
                <span className="text-gray-200 font-semibold">
                  {agent.total} keys
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Licenses created per day
        </h3>
        {reportMetrics.chartData.length ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reportMetrics.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "#111", opacity: 0.3 }}
                  contentStyle={{ backgroundColor: "#111", border: "1px solid #1f1f1f" }}
                />
                <Bar dataKey="count" fill="#ef4444" radius={[6, 6, 0, 0]} barSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No chart data available.</p>
        )}
      </div>
    </div>
  );

  const renderActivityLogs = () => (
    <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl">
      <div className="flex items-center justify-between p-4 border-b border-[#1f1f1f]">
        <h3 className="text-lg font-semibold text-white">Activity logs</h3>
        <button
          onClick={fetchLogs}
          className="text-sm bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg"
        >
          Refresh logs
        </button>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-gray-400 uppercase text-xs tracking-wider bg-[#101010]">
            <tr>
              <th className="px-4 py-3 text-left">Timestamp</th>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Message</th>
            </tr>
          </thead>
          <tbody>
            {!logs.length ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                  No activity logs available.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr
                  key={log.id || `${log.created_at}-${log.action}`}
                  className="border-t border-[#1f1f1f] hover:bg-[#181818]"
                >
                  <td className="px-4 py-3 text-gray-300">
                    {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-200">{log.action || "—"}</td>
                  <td className="px-4 py-3 text-gray-300">{log.message || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-gray-200 font-[Inter] p-6">
      {busy && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <div className="bg-[#151515] border border-[#2a2a2a] px-6 py-4 rounded-xl text-sm text-gray-200">
            Processing...
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMainTab("license-manager")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                mainTab === "license-manager"
                  ? "bg-red-600 text-white"
                  : "bg-[#181818] text-gray-300"
              }`}
            >
              <FaChartBar /> License Manager
            </button>
            <button
              onClick={() => setMainTab("activity")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                mainTab === "activity"
                  ? "bg-red-600 text-white"
                  : "bg-[#181818] text-gray-300"
              }`}
            >
              Activity Logs
            </button>
          </div>
        </div>

        {mainTab === "license-manager" ? (
          <div className="space-y-6">
            {renderLicenseManagerHeader()}

            <div className="bg-[#131313] border border-[#1f1f1f] rounded-2xl p-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSubTab("licenses")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                  subTab === "licenses"
                    ? "bg-red-600 text-white"
                    : "bg-[#181818] text-gray-300"
                }`}
              >
                <FaLayerGroup /> Licenses
              </button>
              <button
                onClick={() => setSubTab("batches")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                  subTab === "batches"
                    ? "bg-red-600 text-white"
                    : "bg-[#181818] text-gray-300"
                }`}
              >
                <FaPlus /> Batches
              </button>
              <button
                onClick={() => setSubTab("agents")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                  subTab === "agents"
                    ? "bg-red-600 text-white"
                    : "bg-[#181818] text-gray-300"
                }`}
              >
                <FaUsers /> Agents
              </button>
              <button
                onClick={() => setSubTab("reports")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                  subTab === "reports"
                    ? "bg-red-600 text-white"
                    : "bg-[#181818] text-gray-300"
                }`}
              >
                <FaChartBar /> Reports
              </button>
            </div>

            {subTab === "licenses" && (
              <>
                {renderCreationPanel()}
                {renderFilterBar()}
                {renderLicenseTable()}
              </>
            )}
            {subTab === "batches" && renderBatches()}
            {subTab === "agents" && renderAgents()}
            {subTab === "reports" && renderReports()}
          </div>
        ) : (
          renderActivityLogs()
        )}
      </div>
    </div>
  );
}
