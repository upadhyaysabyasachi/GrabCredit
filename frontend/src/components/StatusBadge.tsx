"use client";

const statusColors: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-800",
  DECLINED: "bg-red-100 text-red-800",
  INITIATED: "bg-blue-100 text-blue-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  SUCCESS: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  TIMED_OUT: "bg-orange-100 text-orange-800",
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  red: "bg-red-100 text-red-800",
  completed: "bg-green-100 text-green-800",
  incomplete: "bg-yellow-100 text-yellow-800",
  PASS: "bg-green-100 text-green-800",
  FAIL: "bg-red-100 text-red-800",
  DUPLICATE: "bg-orange-100 text-orange-800",
  ORIGINAL: "bg-blue-100 text-blue-800",
  PARTIAL_BNPL: "bg-purple-100 text-purple-800",
  INLINE_KYC: "bg-teal-100 text-teal-800",
  UPGRADE_PATH: "bg-cyan-100 text-cyan-800",
  ALT_DEALS: "bg-gray-100 text-gray-600",
};

export default function StatusBadge({ status }: { status: string }) {
  const color = statusColors[status] || "bg-gray-100 text-gray-800";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}
    >
      {status}
    </span>
  );
}
