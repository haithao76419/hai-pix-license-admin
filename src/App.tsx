import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import AdminDashboard from "./components/AdminDashboard";
import AgentDashboard from "./components/AgentDashboard";

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<"admin" | "agent" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // 🔑 Khi app khởi động
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // 🧠 Khi có session → kiểm tra quyền
  useEffect(() => {
    if (session?.access_token) checkRole();
  }, [session]);

  // ✅ Gọi function kiểm tra quyền
  async function checkRole() {
    try {
      const token = session?.access_token;

      // Gọi function is-admin
      const resAdmin = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/is-admin`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        }
      );
      const adminJson = await resAdmin.json();

      if (adminJson?.isAdmin) {
        setRole("admin");
      } else {
        // Nếu không phải admin thì mặc định kiểm tra là đại lý
        setRole("agent");
      }
    } catch (err) {
      console.error("❌ Lỗi kiểm tra role:", err);
      setRole(null);
    }
  }

  // 🔐 Đăng nhập
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Sai tài khoản hoặc mật khẩu!");
    else {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      checkRole();
    }
  }

  // 🚪 Đăng xuất
  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
  }

  // 🌀 Loading
  if (loading)
    return (
      <div className="flex items-center justify-center h-screen bg-[#111] text-gray-300">
        ⏳ Đang tải...
      </div>
    );

  // 🔒 Chưa đăng nhập
  if (!session)
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#111] text-gray-200 font-[Inter]">
        <form
          onSubmit={signIn}
          className="bg-[#1b1b1b] p-8 rounded-2xl shadow-xl w-96 border border-[#333]"
        >
          <h1 className="text-2xl font-bold mb-6 text-center text-red-500">
            🔐 License Manager — Đăng nhập
          </h1>
          <input
            type="email"
            placeholder="Nhập email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-3 p-2 bg-[#222] border border-[#333] rounded text-gray-200"
          />
          <input
            type="password"
            placeholder="Nhập mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-4 p-2 bg-[#222] border border-[#333] rounded text-gray-200"
          />
          <button
            type="submit"
            className="w-full bg-red-700 hover:bg-red-800 py-2 rounded text-white font-medium transition-all"
          >
            Đăng nhập
          </button>
        </form>
      </div>
    );

  // 🧩 Khi đang kiểm tra quyền
  if (role === null)
    return (
      <div className="flex items-center justify-center h-screen bg-[#111] text-gray-400">
        🔄 Đang kiểm tra quyền truy cập...
      </div>
    );

  // 👑 Nếu là Admin
  if (role === "admin")
    return (
      <div>
        <div className="p-3 bg-[#111] text-gray-400 text-sm flex justify-between items-center">
          <span>Xin chào, {session.user.email} (Admin)</span>
          <button
            onClick={signOut}
            className="bg-red-700 hover:bg-red-800 text-white px-3 py-1 rounded"
          >
            Đăng xuất
          </button>
        </div>
        <AdminDashboard />
      </div>
    );

  // 🤝 Nếu là Đại lý (Agent)
  if (role === "agent")
    return (
      <div>
        <div className="p-3 bg-[#111] text-gray-400 text-sm flex justify-between items-center">
          <span>Xin chào, {session.user.email} (Đại lý)</span>
          <button
            onClick={signOut}
            className="bg-red-700 hover:bg-red-800 text-white px-3 py-1 rounded"
          >
            Đăng xuất
          </button>
        </div>
        <AgentDashboard />
      </div>
    );

  // 🚫 Nếu không có quyền
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#111] text-gray-300 font-[Inter]">
      <div className="text-center bg-[#1b1b1b] p-8 rounded-2xl border border-[#333] w-96 shadow-lg">
        <h2 className="text-xl mb-3 text-red-500">🚫 Truy cập bị từ chối</h2>
        <p className="text-gray-400 mb-4">
          Tài khoản{" "}
          <span className="text-white">{session.user.email}</span> không có
          quyền truy cập.
        </p>
        <button
          onClick={signOut}
          className="bg-gray-700 hover:bg-gray-800 px-4 py-2 rounded text-sm text-white"
        >
          Đăng xuất
        </button>
      </div>
    </div>
  );
}
