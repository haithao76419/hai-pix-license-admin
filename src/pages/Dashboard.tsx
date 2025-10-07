import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import AdminDashboard from "../components/AdminDashboard";

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    })();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    onLogout();
  }

  if (!user) return <p className="text-center mt-20">⏳ Đang tải...</p>;

  return (
    <div>
      <div className="flex justify-between items-center bg-[#111] px-6 py-3 border-b border-red-900">
        <div className="text-red-300 font-semibold">
          👋 Xin chào, {user.email}
        </div>
        <button
          onClick={handleLogout}
          className="text-sm bg-red-700 hover:bg-red-800 px-3 py-1 rounded"
        >
          Đăng xuất
        </button>
      </div>
      <AdminDashboard />
    </div>
  );
}
