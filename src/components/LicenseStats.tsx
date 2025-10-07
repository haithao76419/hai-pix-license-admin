type Props = {
  total: number;
  used: number;
  unused: number;
  expired: number;
};

export default function LicenseStats({ total, used, unused, expired }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-[#141414] border border-red-900 rounded-lg p-4 text-center">
        <div className="text-gray-400 text-sm">Tổng License</div>
        <div className="text-2xl font-bold text-red-400">{total}</div>
      </div>

      <div className="bg-[#141414] border border-green-900 rounded-lg p-4 text-center">
        <div className="text-gray-400 text-sm">Đã kích hoạt</div>
        <div className="text-2xl font-bold text-green-400">{used}</div>
      </div>

      <div className="bg-[#141414] border border-yellow-900 rounded-lg p-4 text-center">
        <div className="text-gray-400 text-sm">Chưa kích hoạt</div>
        <div className="text-2xl font-bold text-yellow-400">{unused}</div>
      </div>

      <div className="bg-[#141414] border border-red-900 rounded-lg p-4 text-center">
        <div className="text-gray-400 text-sm">Đã hết hạn</div>
        <div className="text-2xl font-bold text-red-500">{expired}</div>
      </div>
    </div>
  );
}
