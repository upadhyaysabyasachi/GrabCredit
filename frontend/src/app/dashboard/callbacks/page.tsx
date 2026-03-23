"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { getDashboardCallbacks, getCallbackStats } from "@/lib/api";
import type { CallbackLog, CallbackStatsResponse } from "@/lib/types";

function DashboardNav() {
  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6">
      <Link
        href="/dashboard"
        className="px-4 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700 hover:bg-white/50"
      >
        Decisions
      </Link>
      <Link
        href="/dashboard/checkouts"
        className="px-4 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700 hover:bg-white/50"
      >
        Checkouts
      </Link>
      <Link
        href="/dashboard/callbacks"
        className="px-4 py-2 text-sm font-medium rounded-md bg-white text-gray-900 shadow-sm"
      >
        Callbacks
      </Link>
    </div>
  );
}

export default function CallbacksPage() {
  const [callbacks, setCallbacks] = useState<CallbackLog[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<CallbackStatsResponse | null>(null);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCallbacks = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { is_duplicate?: boolean; limit: number } = { limit: 50 };
      if (duplicatesOnly) params.is_duplicate = true;
      const res = await getDashboardCallbacks(params);
      setCallbacks(res.callbacks);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load callbacks");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await getCallbackStats();
      setStats(res);
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    fetchCallbacks();
    fetchStats();
  }, [duplicatesOnly]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getPayloadStatus = (payload: Record<string, unknown>): string => {
    return (payload.status as string) || (payload.transaction_status as string) || "--";
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Operator Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">Partner callback logs and duplicate detection.</p>

      <DashboardNav />

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Callbacks</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Duplicates</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">{stats.duplicate_count}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Duplicate Rate</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{(stats.duplicate_rate * 100).toFixed(1)}%</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3 mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={duplicatesOnly}
            onChange={(e) => setDuplicatesOnly(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Show duplicates only
        </label>
        <span className="text-sm text-gray-400 ml-auto">{total} total</span>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading callbacks...</div>
      ) : callbacks.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No callbacks found.</div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Callback ID</th>
                <th className="px-4 py-3">Checkout ID</th>
                <th className="px-4 py-3">Idempotency Key</th>
                <th className="px-4 py-3">Payload Status</th>
                <th className="px-4 py-3">Duplicate</th>
                <th className="px-4 py-3">Late</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {callbacks.map((cb) => (
                <tr
                  key={cb.id}
                  className={`hover:bg-gray-50 ${cb.is_duplicate ? "bg-orange-50/50" : ""}`}
                >
                  <td className="px-4 py-3 font-mono text-gray-600 text-xs">{cb.id.slice(0, 12)}...</td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">{cb.checkout_id.slice(0, 12)}...</td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs" title={cb.idempotency_key}>
                    {cb.idempotency_key.slice(0, 20)}...
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={getPayloadStatus(cb.raw_payload)} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={cb.is_duplicate ? "DUPLICATE" : "ORIGINAL"} />
                  </td>
                  <td className="px-4 py-3">
                    {cb.is_late ? (
                      <span className="text-xs text-orange-600 font-medium">LATE</span>
                    ) : (
                      <span className="text-xs text-gray-300">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(cb.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
