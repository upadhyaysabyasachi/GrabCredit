"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import JsonViewer from "@/components/JsonViewer";
import {
  getDashboardDecisions,
  getDecisionDetail,
  getCheckoutHealth,
} from "@/lib/api";
import type {
  EligibilityCheckResponse,
  CheckoutHealthResponse,
  CheckoutStatusResponse,
  CallbackLog,
} from "@/lib/types";

function DashboardNav() {
  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6">
      <Link
        href="/dashboard"
        className="px-4 py-2 text-sm font-medium rounded-md bg-white text-gray-900 shadow-sm"
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
        className="px-4 py-2 text-sm font-medium rounded-md text-gray-500 hover:text-gray-700 hover:bg-white/50"
      >
        Callbacks
      </Link>
    </div>
  );
}


interface DecisionDetail {
  decision: EligibilityCheckResponse;
  user: { name: string; email: string } | null;
  merchant: { name: string; category: string } | null;
  checkouts: CheckoutStatusResponse[];
  callbacks: CallbackLog[];
}

export default function DashboardPage() {
  const [decisions, setDecisions] = useState<EligibilityCheckResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [health, setHealth] = useState<CheckoutHealthResponse | null>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DecisionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchDecisions = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { decision?: string; limit: number } = { limit: 50 };
      if (filter !== "ALL") params.decision = filter;
      const res = await getDashboardDecisions(params);
      setDecisions(res.decisions);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load decisions");
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
    fetchDecisions();
    fetchHealth();
  }, [filter]);

  const handleExpand = async (decisionId: string) => {
    if (expandedId === decisionId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(decisionId);
    setDetailLoading(true);
    try {
      const res = await getDecisionDetail(decisionId);
      setDetail(res);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

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
      <p className="text-sm text-gray-500 mb-6">Monitor eligibility decisions, checkout statuses, and partner callbacks.</p>

      <DashboardNav />

      {/* Health Summary */}
      {health && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Checkouts</p>
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
        <label className="text-sm text-gray-600">Filter by Decision:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="ALL">All</option>
          <option value="APPROVED">Approved</option>
          <option value="DECLINED">Declined</option>
        </select>
        <span className="text-sm text-gray-400 ml-auto">{total} total</span>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading decisions...</div>
      ) : decisions.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No decisions found.</div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">User ID</th>
                <th className="px-4 py-3">Merchant ID</th>
                <th className="px-4 py-3 text-right">Cart Value</th>
                <th className="px-4 py-3">Decision</th>
                <th className="px-4 py-3">Reason Codes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {decisions.map((d) => (
                <>
                  <tr
                    key={d.decision_id}
                    onClick={() => handleExpand(d.decision_id)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-600">{formatDate(d.created_at)}</td>
                    <td className="px-4 py-3 font-mono text-gray-500">{d.user_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-mono text-gray-500">{d.merchant_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{"\u20b9"}{d.cart_value.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3"><StatusBadge status={d.decision} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {d.reason_codes.length > 0
                          ? d.reason_codes.map((code) => (
                              <span key={code} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                {code}
                              </span>
                            ))
                          : <span className="text-xs text-gray-300">--</span>}
                      </div>
                    </td>
                  </tr>
                  {expandedId === d.decision_id && (
                    <tr key={`${d.decision_id}-detail`}>
                      <td colSpan={6} className="px-4 py-4 bg-gray-50">
                        {detailLoading ? (
                          <p className="text-sm text-gray-400">Loading details...</p>
                        ) : detail ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-xs text-gray-500 uppercase mb-1">User</p>
                                <p className="text-gray-700">{detail.user?.name ?? d.user_id.slice(0, 8)}</p>
                                {detail.user?.email && (
                                  <p className="text-xs text-gray-400">{detail.user.email}</p>
                                )}
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 uppercase mb-1">Merchant</p>
                                <p className="text-gray-700">{detail.merchant?.name ?? d.merchant_id.slice(0, 8)}</p>
                                {detail.merchant?.category && (
                                  <p className="text-xs text-gray-400">{detail.merchant.category}</p>
                                )}
                              </div>
                            </div>

                            {/* Risk Signals */}
                            <div>
                              <p className="text-xs text-gray-500 uppercase mb-2">Risk Signals</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {Object.entries(d.risk_signals).map(([key, signal]) => (
                                  <div
                                    key={key}
                                    className={`p-2 rounded border text-xs ${
                                      signal.result === "PASS"
                                        ? "border-green-200 bg-green-50"
                                        : "border-red-200 bg-red-50"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium text-gray-700">{signal.rule}</span>
                                      <StatusBadge status={signal.result} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Linked Checkouts */}
                            {detail.checkouts.length > 0 && (
                              <div>
                                <p className="text-xs text-gray-500 uppercase mb-2">Linked Checkouts</p>
                                <div className="space-y-1">
                                  {detail.checkouts.map((c) => (
                                    <div
                                      key={c.checkout_id}
                                      className="flex items-center justify-between bg-white border border-gray-200 rounded p-2 text-xs"
                                    >
                                      <span className="font-mono text-gray-500">{c.checkout_id.slice(0, 12)}...</span>
                                      <StatusBadge status={c.status} />
                                      <span className="text-gray-400">{c.retry_count} retries</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <JsonViewer data={detail.decision} title="Full Decision JSON" />
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">Failed to load details.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
