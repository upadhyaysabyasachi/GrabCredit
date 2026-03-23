"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { getDashboardCheckouts, getCheckoutHealth } from "@/lib/api";
import type { CheckoutStatusResponse, CheckoutHealthResponse } from "@/lib/types";

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
        className="px-4 py-2 text-sm font-medium rounded-md bg-white text-gray-900 shadow-sm"
      >
        Checkouts
      </Link>
      <Link
        href="/dashboard/callbacks"
        className="px-4 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700 hover:bg-white/50"
      >
        Callbacks
      </Link>
    </div>
  );
}

const STATUS_OPTIONS = ["ALL", "INITIATED", "PENDING", "SUCCESS", "DECLINED", "FAILED", "TIMED_OUT"];

export default function CheckoutsPage() {
  const [checkouts, setCheckouts] = useState<CheckoutStatusResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [health, setHealth] = useState<CheckoutHealthResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCheckouts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { status?: string; limit: number } = { limit: 50 };
      if (statusFilter !== "ALL") params.status = statusFilter;
      const res = await getDashboardCheckouts(params);
      setCheckouts(res.checkouts);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load checkouts");
    } finally {
      setLoading(false);
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await getCheckoutHealth();
      setHealth(res);
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    fetchCheckouts();
    fetchHealth();
  }, [statusFilter]);

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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Operator Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">Checkout status overview.</p>

      <DashboardNav />

      {/* Health Summary */}
      {health && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{health.total}</p>
          </div>
          {Object.entries(health.by_status).map(([status, count]) => (
            <div key={status} className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{status}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{count}</p>
            </div>
          ))}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Failure Rate</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-gray-900">{(health.failure_rate * 100).toFixed(1)}%</p>
              <StatusBadge status={health.health} />
            </div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600">Filter by Status:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === "ALL" ? "All" : s}</option>
          ))}
        </select>
        <span className="text-sm text-gray-400 ml-auto">{total} total</span>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading checkouts...</div>
      ) : checkouts.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No checkouts found.</div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Checkout ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Retry Count</th>
                <th className="px-4 py-3">Partner Ref</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {checkouts.map((c) => (
                <tr key={c.checkout_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-600 text-xs">{c.checkout_id.slice(0, 12)}...</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-gray-600">{c.retry_count}</td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">
                    {c.partner_ref ? c.partner_ref.slice(0, 16) : "--"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(c.created_at)}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
