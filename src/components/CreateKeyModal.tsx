import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { FaPlus, FaTimes, FaSyncAlt, FaLock } from "react-icons/fa";

type Props = {
  onClose: () => void;
  onCreated: () => void;
};

export default function CreateKeyModal({ onClose, onCreated }: Props) {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [soNgay, setSoNgay] = useState<number>(30);
  const [soLuong, setSoLuong] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // 🧩 Kiểm tra quyền admin
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase.rpc("is_admin", { email: user.email });
      setIsAdmin(roleData === true);
    })();
  }, []);

  // 🔹 Tải danh sách đại lý
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("dai_ly").select("id, ten_dai_ly, email");
      if (data) setAgents(data);
    })();
  }, []);

  // 🔑 Sinh key ngẫu nhiên bảo mật hơn
  function randomKey() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let part = "";
    for (let i = 0; i < 16; i++) {
      part += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `HSF-${part}-${Date.now().toString(36).toUpperCase()}`;
  }

  // 🚀 Tạo key hàng loạt
  async function handleCreate() {
    if (!isAdmin) return alert("🚫 Chỉ quản trị viên mới có quyền tạo key.");
    if (!selectedAgent) return alert("⚠️ Chọn đại lý trước khi tạo key.");
    if (!soNgay || soNgay <= 0) return alert("⚠️ Số ngày phải lớn hơn 0.");
    if (!soLuong || soLuong <= 0) return alert("⚠️ Nhập số lượng key hợp lệ.");

    setBusy(true);

    const batch_name = `Batch_${new Date().toISOString().slice(0, 10)}_${selectedAgent}`;
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + soNgay);

    // 📦 Ghi batch
    const { data: batch, error: errBatch } = await supabase
      .from("license_batches")
      .insert([{ ten_lo: batch_name, nguoi_tao: selectedAgent, so_luong: soLuong }])
      .select()
      .single();

    if (errBatch) {
      setBusy(false);
      console.error(errBatch);
      return alert("❌ Lỗi tạo batch.");
    }

    // 🧩 Chuẩn bị danh sách key bảo mật hơn
    const newLicenses = Array.from({ length: soLuong }).map(() => ({
      license_key: randomKey(),
      dai_ly_email: selectedAgent,
      duration_days: soNgay,
      expires_at: expires_at.toISOString(),
      is_used: false,
      batch_id: batch.id,
    }));

    // 🗝️ Ghi vào bảng licenses
    const { error: errLic } = await supabase.from("licenses").insert(newLicenses);
    setBusy(false);

    if (errLic) {
      console.error(errLic);
      return alert("❌ Lỗi ghi license.");
    }

    alert(`✅ Đã tạo ${soLuong} key (${soNgay} ngày) cho đại lý ${selectedAgent}`);
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-[#1b1b1b] border border-[#333] rounded-2xl w-[420px] p-6 text-gray-200">
        <h2 className="text-xl font-semibold mb-4 flex items-center justify-between">
          <span><FaPlus className="inline mr-2" /> Tạo Key mới</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><FaTimes /></button>
        </h2>

        {!isAdmin ? (
          <div className="text-center text-red-400 py-8">
            <FaLock className="mx-auto mb-2 text-2xl" />
            <p>Bạn không có quyền truy cập chức năng này.</p>
          </div>
        ) : (
          <>
            {/* Chọn đại lý */}
            <label className="block text-sm mb-1">🎯 Chọn đại lý:</label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full bg-[#222] border border-[#333] p-2 rounded mb-3"
            >
              <option value="">-- Chọn đại lý --</option>
              {agents.map((a) => (
                <option key={a.id} value={a.email}>
                  {a.ten_dai_ly} ({a.email})
                </option>
              ))}
            </select>

            {/* Chọn số ngày */}
            <label className="block text-sm mb-1">⏱️ Số ngày hiệu lực:</label>
            <div className="flex gap-2 mb-3">
              {[1, 7, 30, 90, 365].map((n) => (
                <button
                  key={n}
                  onClick={() => setSoNgay(n)}
                  className={`px-3 py-1 rounded text-sm border ${soNgay === n ? "bg-red-700 text-white" : "bg-[#222] border-[#333] hover:bg-[#333]"}`}
                >
                  {n} ngày
                </button>
              ))}
            </div>

            {/* Số lượng */}
            <label className="block text-sm mb-1">🔢 Số lượng key cần tạo:</label>
            <input
              type="number"
              min={1}
              value={soLuong}
              onChange={(e) => setSoLuong(Number(e.target.value))}
              className="w-full bg-[#222] border border-[#333] p-2 rounded mb-4"
            />

            {/* Nút hành động */}
            <div className="flex justify-between mt-4">
              <button
                onClick={handleCreate}
                disabled={busy}
                className="bg-red-700 hover:bg-red-800 px-4 py-2 rounded text-sm text-white flex items-center gap-2"
              >
                <FaSyncAlt className={busy ? "animate-spin" : ""} />
                {busy ? "Đang tạo..." : "Tạo Key"}
              </button>
              <button
                onClick={onClose}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded text-sm"
              >
                Hủy
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
