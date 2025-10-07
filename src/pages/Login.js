import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
export default function Login({ onLogin }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [msg, setMsg] = useState("");
    async function handleLogin(e) {
        e.preventDefault();
        setMsg("🔄 Đang đăng nhập...");
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error)
            setMsg(`❌ ${error.message}`);
        else {
            setMsg("✅ Đăng nhập thành công!");
            onLogin();
        }
    }
    return (<div className="min-h-screen bg-[#0b0b0b] flex items-center justify-center text-gray-200">
      <form onSubmit={handleLogin} className="bg-[#141414] p-8 rounded-lg border border-red-900 shadow-lg w-[320px]">
        <h1 className="text-2xl font-bold text-center text-red-400 mb-6">
          🔐 Hải Soft Admin Login
        </h1>

        <input type="email" placeholder="Email" className="w-full mb-3 p-2 rounded bg-[#1a1a1a] border border-red-800 outline-none" value={email} onChange={(e) => setEmail(e.target.value)}/>

        <input type="password" placeholder="Mật khẩu" className="w-full mb-4 p-2 rounded bg-[#1a1a1a] border border-red-800 outline-none" value={password} onChange={(e) => setPassword(e.target.value)}/>

        <button type="submit" className="w-full bg-red-700 hover:bg-red-800 py-2 rounded font-medium">
          Đăng nhập
        </button>

        {msg && <p className="text-sm text-center mt-4">{msg}</p>}
      </form>
    </div>);
}
