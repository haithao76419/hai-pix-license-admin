import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Props = {
  children: React.ReactNode;
};

export default function AdminProtected({ children }: Props) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdmin();
  }, []);

  // 🧠 Gọi function "is-admin" trên Supabase để xác minh quyền quản trị
  async function checkAdmin() {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;

    if (!token) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/is-admin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: "{}",
        }
      );

      const json = await res.json();
      console.log("🔎 Kết quả kiểm tra quyền:", json);
      setIsAdmin(json.isAdmin === true);
    } catch (err) {
      console.error("❌ Lỗi khi kiểm tra quyền admin:", err);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  // ⏳ Khi đang kiểm tra quyền
  if (loading)
    return (
      <div className="flex justify-center items-center h-screen bg-[#111] text-gray-400 font-[Inter]">
        🔄 Đang kiểm tra quyền truy cập...
      </div>
    );

  // 🚫 Nếu không có quyền admin
  if (!isAdmin)
    return (
      <div className="flex justify-center items-center h-screen bg-[#111] text-gray-200 font-[Inter]">
        <div className="bg-[#1b1b1b] p-8 rounded-2xl border border-[#333] w-96 text-center shadow-lg">
          <h2 className="text-xl mb-3 text-red-500 font-semibold">
            🚫 Truy cập bị từ chối
          </h2>
          <p className="text-gray-400 mb-4">
            Tài khoản hiện tại không có quyền quản trị.
          </p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.reload();
            }}
            className="bg-gray-700 hover:bg-gray-800 px-4 py-2 rounded text-sm text-white"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    );

  // ✅ Nếu là admin → cho phép hiển thị nội dung bên trong
  return <>{children}</>;
}
