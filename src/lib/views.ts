import { supabase } from "./supabaseClient";

/**
 * 🏷️ Lấy toàn bộ kho license (Admin xem tất cả)
 */
export async function getKhoDaiLy() {
  return await supabase
    .from("v_kho_dai_ly")
    .select("*")
    .order("ten_dai_ly", { ascending: true });
}

/**
 * 📦 Lấy kho license theo email đại lý cụ thể
 */
export async function getKhoTheoDaiLy(email: string) {
  return await supabase
    .from("v_kho_dai_ly")
    .select("*")
    .eq("email_dai_ly", email)
    .order("created_at", { ascending: false });
}

/**
 * 📊 Thống kê theo từng đại lý
 */
export async function getThongKeDaiLy() {
  return await supabase.from("v_thong_ke_dai_ly").select("*");
}

/**
 * 📈 Tổng hợp toàn hệ thống
 */
export async function getTongKho() {
  return await supabase.from("v_tong_kho").select("*");
}

/**
 * ⏰ Key sắp hết hạn
 */
export async function getLicenseExpiringSoon() {
  return await supabase.from("v_license_expiring_soon").select("*");
}

/**
 * 💀 Key đã hết hạn
 */
export async function getLicenseExpired() {
  return await supabase.from("v_license_expired").select("*");
}

/**
 * 🧍 Dữ liệu riêng của đại lý đang đăng nhập
 */
export async function getUserLicenseStatus(userEmail: string) {
  return await supabase
    .from("v_user_license_status")
    .select("*")
    .eq("user_email", userEmail);
}
