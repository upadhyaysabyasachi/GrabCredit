"use client";

import { useState, useEffect, useCallback } from "react";
import StatusBadge from "@/components/StatusBadge";
import JsonViewer from "@/components/JsonViewer";
import { usePolling } from "@/hooks/usePolling";
import {
  getSimulatorUsers,
  getSimulatorMerchants,
  checkEligibility,
  initiateCheckout,
  getCheckoutStatus,
  toggleKYC,
  resetVelocity,
} from "@/lib/api";
import type {
  User,
  Merchant,
  EligibilityCheckResponse,
  CheckoutInitiateResponse,
  CheckoutStatusResponse,
  PartnerBehavior,
  CheckoutStatus,
} from "@/lib/types";

const PARTNER_BEHAVIORS: { value: PartnerBehavior; label: string }[] = [
  { value: "success", label: "Success" },
  { value: "decline", label: "Partner Decline" },
  { value: "transient_failure", label: "Transient Failure (5xx + retry)" },
  { value: "timeout", label: "Timeout (no callback)" },
  { value: "duplicate", label: "Duplicate Callback" },
];

const TERMINAL_STATUSES: CheckoutStatus[] = [
  "SUCCESS",
  "DECLINED",
  "FAILED",
  "TIMED_OUT",
];

const REASON_MESSAGES: Record<string, string> = {
  KYC_INCOMPLETE: "Your KYC verification is incomplete. Complete KYC to unlock BNPL.",
  CREDIT_TIER_INSUFFICIENT: "Your current credit tier does not meet the minimum requirement for this transaction.",
  CART_VALUE_EXCEEDS_LIMIT: "Your cart value exceeds your approved BNPL limit.",
  MERCHANT_NOT_ELIGIBLE: "This merchant is not enabled for BNPL payments.",
  VELOCITY_LIMIT_EXCEEDED: "Too many eligibility checks in a short period. Please try again later.",
};

export default function SimulatorPage() {
  // --- Form state ---
  const [users, setUsers] = useState<User[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedMerchantId, setSelectedMerchantId] = useState("");
  const [cartValue, setCartValue] = useState<number>(8000);
  const [partnerBehavior, setPartnerBehavior] = useState<PartnerBehavior>("success");

  // --- Result state ---
  const [eligibilityResult, setEligibilityResult] = useState<EligibilityCheckResponse | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutInitiateResponse | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatusResponse | null>(null);

  // --- UI state ---
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pollCheckoutId, setPollCheckoutId] = useState<string | null>(null);

  // --- Load users and merchants ---
  useEffect(() => {
    Promise.all([getSimulatorUsers(), getSimulatorMerchants()])
      .then(([u, m]) => {
        setUsers(u);
        setMerchants(m);
        if (u.length > 0) setSelectedUserId(u[0].id);
        if (m.length > 0) setSelectedMerchantId(m[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  // --- Polling for checkout status ---
  const fetchCheckoutStatus = useCallback(
    () => getCheckoutStatus(pollCheckoutId!),
    [pollCheckoutId]
  );

  const { isPolling } = usePolling<CheckoutStatusResponse>(
    fetchCheckoutStatus,
    {
      enabled: !!pollCheckoutId,
      intervalMs: 2000,
      maxDurationMs: 6 * 60 * 1000,
      isTerminal: (d) => TERMINAL_STATUSES.includes(d.status),
      onUpdate: (d) => setCheckoutStatus(d),
    }
  );

  // --- Handlers ---
  const handleRunScenario = async () => {
    setLoading(true);
    setError(null);
    setEligibilityResult(null);
    setCheckoutResult(null);
    setCheckoutStatus(null);
    setPollCheckoutId(null);
    setActionMessage(null);

    try {
      const result = await checkEligibility({
        user_id: selectedUserId,
        merchant_id: selectedMerchantId,
        cart_value: cartValue,
      });
      setEligibilityResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to check eligibility");
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateCheckout = async (
    isPartialBnpl = false,
    amount?: number
  ) => {
    if (!eligibilityResult) return;
    setCheckoutLoading(true);
    setError(null);

    const emiTenure =
      eligibilityResult.emi_terms?.options?.[0]?.tenure_months ?? 3;

    try {
      const result = await initiateCheckout({
        decision_id: eligibilityResult.decision_id,
        emi_tenure_months: emiTenure,
        partner_behavior: partnerBehavior,
        is_partial_bnpl: isPartialBnpl,
        amount: amount ?? eligibilityResult.cart_value,
      });
      setCheckoutResult(result);
      setCheckoutStatus({
        checkout_id: result.checkout_id,
        status: result.status,
        partner_ref: null,
        error_detail: null,
        retry_count: 0,
        created_at: result.created_at,
        updated_at: result.created_at,
      });
      setPollCheckoutId(result.checkout_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to initiate checkout");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleToggleKYC = async () => {
    if (!selectedUserId) return;
    try {
      const res = await toggleKYC(selectedUserId);
      setActionMessage(
        `KYC toggled: ${res.previous_status} -> ${res.kyc_status}`
      );
      // Refresh users
      const u = await getSimulatorUsers();
      setUsers(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to toggle KYC");
    }
  };

  const handleResetVelocity = async () => {
    if (!selectedUserId) return;
    try {
      await resetVelocity(selectedUserId);
      setActionMessage("Velocity events cleared for selected user.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset velocity");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Scenario Simulator
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Test BNPL eligibility and checkout flows with configurable parameters.
        </p>

        <div className="flex gap-8">
          {/* ===== LEFT: Form ===== */}
          <div className="w-2/5 flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
              {/* User */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  User
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} -- KYC: {u.kyc_status}, {u.credit_tier}, Limit:{" "}
                      {u.max_bnpl_limit.toLocaleString("en-IN", {
                        style: "currency",
                        currency: "INR",
                        maximumFractionDigits: 0,
                      })}
                    </option>
                  ))}
                </select>
              </div>

              {/* Merchant */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Merchant
                </label>
                <select
                  value={selectedMerchantId}
                  onChange={(e) => setSelectedMerchantId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {merchants.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} -- BNPL:{" "}
                      {m.bnpl_enabled ? "Enabled" : "Disabled"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cart Value */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cart Value (INR)
                </label>
                <input
                  type="number"
                  min={0}
                  value={cartValue}
                  onChange={(e) => setCartValue(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Partner Behavior */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Partner Behavior
                </label>
                <select
                  value={partnerBehavior}
                  onChange={(e) =>
                    setPartnerBehavior(e.target.value as PartnerBehavior)
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {PARTNER_BEHAVIORS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Run button */}
              <button
                onClick={handleRunScenario}
                disabled={loading || !selectedUserId || !selectedMerchantId}
                className="w-full bg-indigo-600 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Running..." : "Run Scenario"}
              </button>

              {/* Utility links */}
              <div className="flex gap-4 pt-1">
                <button
                  onClick={handleResetVelocity}
                  className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                >
                  Reset Velocity
                </button>
                <button
                  onClick={handleToggleKYC}
                  className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                >
                  Toggle KYC
                </button>
              </div>

              {/* Action message */}
              {actionMessage && (
                <p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                  {actionMessage}
                </p>
              )}
            </div>
          </div>

          {/* ===== RIGHT: Results ===== */}
          <div className="w-3/5 space-y-6">
            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Empty state */}
            {!eligibilityResult && !error && !loading && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center text-gray-400">
                <p className="text-lg font-medium mb-1">No results yet</p>
                <p className="text-sm">
                  Configure a scenario and click &quot;Run Scenario&quot; to see
                  results.
                </p>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center text-gray-500">
                <div className="inline-block h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm">Checking eligibility...</p>
              </div>
            )}

            {/* Eligibility Result */}
            {eligibilityResult && (
              <>
                {/* Decision header */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">
                      Eligibility Decision
                    </h2>
                    <StatusBadge status={eligibilityResult.decision} />
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Decision ID</span>
                      <p className="font-mono text-xs text-gray-700 truncate">
                        {eligibilityResult.decision_id}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Cart Value</span>
                      <p className="font-medium text-gray-900">
                        {eligibilityResult.cart_value.toLocaleString("en-IN", {
                          style: "currency",
                          currency: "INR",
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Expires</span>
                      <p className="text-gray-700 text-xs">
                        {new Date(eligibilityResult.expires_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Risk Signals */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Risk Signals
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="pb-2 font-medium">Rule</th>
                        <th className="pb-2 font-medium">Input</th>
                        <th className="pb-2 font-medium text-right">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(eligibilityResult.risk_signals).map(
                        ([key, signal]) => (
                          <tr
                            key={key}
                            className="border-b border-gray-50 last:border-0"
                          >
                            <td className="py-2 font-mono text-xs text-gray-700">
                              {key}
                            </td>
                            <td className="py-2 text-xs text-gray-500">
                              {typeof signal.input === "object"
                                ? JSON.stringify(signal.input)
                                : String(signal.input)}
                            </td>
                            <td className="py-2 text-right">
                              <StatusBadge status={signal.result} />
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>

                {/* APPROVED: EMI Terms */}
                {eligibilityResult.decision === "APPROVED" &&
                  eligibilityResult.emi_terms && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">
                        EMI Terms
                      </h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b border-gray-100">
                            <th className="pb-2 font-medium">Tenure</th>
                            <th className="pb-2 font-medium">Monthly EMI</th>
                            <th className="pb-2 font-medium">Interest Rate</th>
                            <th className="pb-2 font-medium text-right">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {eligibilityResult.emi_terms.options.map((opt) => (
                            <tr
                              key={opt.tenure_months}
                              className="border-b border-gray-50 last:border-0"
                            >
                              <td className="py-2">
                                {opt.tenure_months} months
                              </td>
                              <td className="py-2">
                                {opt.monthly_emi.toLocaleString("en-IN", {
                                  style: "currency",
                                  currency: "INR",
                                  maximumFractionDigits: 0,
                                })}
                              </td>
                              <td className="py-2">{opt.interest_rate}%</td>
                              <td className="py-2 text-right font-medium">
                                {opt.total_amount.toLocaleString("en-IN", {
                                  style: "currency",
                                  currency: "INR",
                                  maximumFractionDigits: 0,
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Initiate Checkout */}
                      {!checkoutResult && (
                        <button
                          onClick={() => handleInitiateCheckout()}
                          disabled={checkoutLoading}
                          className="mt-4 bg-green-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {checkoutLoading
                            ? "Initiating..."
                            : "Initiate Checkout"}
                        </button>
                      )}
                    </div>
                  )}

                {/* DECLINED: Reason Codes + Recovery */}
                {eligibilityResult.decision === "DECLINED" && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Decline Reasons
                    </h3>
                    <ul className="space-y-2">
                      {eligibilityResult.reason_codes.map((code) => {
                        let message = REASON_MESSAGES[code] || code;
                        if (code === "VELOCITY_LIMIT_EXCEEDED") {
                          const vi = eligibilityResult.risk_signals?.velocity_check?.input as Record<string, number> | undefined;
                          if (vi?.retry_after_minutes) {
                            message = `Too many eligibility checks (${vi.checks_in_hour}/${vi.limit} in the last hour). Try again in ~${vi.retry_after_minutes} minutes.`;
                          }
                        } else if (code === "CART_VALUE_EXCEEDS_LIMIT") {
                          const ci = eligibilityResult.risk_signals?.cart_value_limit?.input as Record<string, number> | undefined;
                          if (ci?.limit) {
                            message = `Cart value (\u20b9${ci.cart.toLocaleString("en-IN")}) exceeds your BNPL limit of \u20b9${ci.limit.toLocaleString("en-IN")}.`;
                          }
                        }
                        return (
                          <li
                            key={code}
                            className="flex items-start gap-3 text-sm"
                          >
                            <StatusBadge status="FAIL" />
                            <div>
                              <span className="font-mono text-xs text-gray-700">
                                {code}
                              </span>
                              <p className="text-gray-500 text-xs mt-0.5">
                                {message}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {/* Recovery Options */}
                    {eligibilityResult.recovery_options &&
                      eligibilityResult.recovery_options.length > 0 && (
                        <div className="pt-3 border-t border-gray-100">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">
                            Recovery Options
                          </h4>
                          <div className="space-y-3">
                            {eligibilityResult.recovery_options.map(
                              (opt, idx) => (
                                <div
                                  key={idx}
                                  className="bg-gray-50 rounded-lg p-4 border border-gray-100"
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                                      {opt.type}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-700 mb-2">
                                    {opt.message}
                                  </p>

                                  {/* Partial BNPL split details */}
                                  {opt.type === "PARTIAL_BNPL" &&
                                    opt.upfront_amount != null &&
                                    opt.bnpl_amount != null && (
                                      <div className="flex gap-4 mb-3 text-sm">
                                        <div className="bg-white rounded px-3 py-2 border border-gray-200">
                                          <span className="text-gray-500 text-xs">
                                            Upfront
                                          </span>
                                          <p className="font-semibold text-gray-900">
                                            {opt.upfront_amount.toLocaleString(
                                              "en-IN",
                                              {
                                                style: "currency",
                                                currency: "INR",
                                                maximumFractionDigits: 0,
                                              }
                                            )}
                                          </p>
                                        </div>
                                        <div className="bg-white rounded px-3 py-2 border border-gray-200">
                                          <span className="text-gray-500 text-xs">
                                            BNPL
                                          </span>
                                          <p className="font-semibold text-gray-900">
                                            {opt.bnpl_amount.toLocaleString(
                                              "en-IN",
                                              {
                                                style: "currency",
                                                currency: "INR",
                                                maximumFractionDigits: 0,
                                              }
                                            )}
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                  {/* Partial BNPL EMI terms */}
                                  {opt.type === "PARTIAL_BNPL" &&
                                    opt.emi_terms &&
                                    opt.emi_terms.options.length > 0 && (
                                      <table className="w-full text-xs mb-3">
                                        <thead>
                                          <tr className="text-left text-gray-500 border-b border-gray-200">
                                            <th className="pb-1 font-medium">
                                              Tenure
                                            </th>
                                            <th className="pb-1 font-medium">
                                              EMI
                                            </th>
                                            <th className="pb-1 font-medium">
                                              Rate
                                            </th>
                                            <th className="pb-1 font-medium text-right">
                                              Total
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {opt.emi_terms.options.map((emi) => (
                                            <tr
                                              key={emi.tenure_months}
                                              className="border-b border-gray-100 last:border-0"
                                            >
                                              <td className="py-1">
                                                {emi.tenure_months}m
                                              </td>
                                              <td className="py-1">
                                                {emi.monthly_emi.toLocaleString(
                                                  "en-IN",
                                                  {
                                                    style: "currency",
                                                    currency: "INR",
                                                    maximumFractionDigits: 0,
                                                  }
                                                )}
                                              </td>
                                              <td className="py-1">
                                                {emi.interest_rate}%
                                              </td>
                                              <td className="py-1 text-right">
                                                {emi.total_amount.toLocaleString(
                                                  "en-IN",
                                                  {
                                                    style: "currency",
                                                    currency: "INR",
                                                    maximumFractionDigits: 0,
                                                  }
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}

                                  {/* CTA button */}
                                  {opt.type === "PARTIAL_BNPL" &&
                                  opt.bnpl_amount != null &&
                                  !checkoutResult ? (
                                    <button
                                      onClick={() =>
                                        handleInitiateCheckout(
                                          true,
                                          opt.bnpl_amount!
                                        )
                                      }
                                      disabled={checkoutLoading}
                                      className="bg-indigo-600 text-white py-1.5 px-3 rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                    >
                                      {checkoutLoading
                                        ? "Processing..."
                                        : opt.cta_label || "Accept Split"}
                                    </button>
                                  ) : opt.type === "INLINE_KYC" ? (
                                    <button
                                      onClick={handleToggleKYC}
                                      className="bg-yellow-500 text-white py-1.5 px-3 rounded text-xs font-medium hover:bg-yellow-600 transition-colors"
                                    >
                                      {opt.cta_label || "Complete KYC"}
                                    </button>
                                  ) : opt.type !== "PARTIAL_BNPL" ? (
                                    <span className="text-xs text-gray-500 italic">
                                      {opt.cta_label}
                                    </span>
                                  ) : null}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                )}

                {/* Checkout Status */}
                {checkoutResult && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-900">
                        Checkout Status
                      </h3>
                      {isPolling && (
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                          <span className="inline-block h-2 w-2 bg-yellow-400 rounded-full animate-pulse" />
                          Polling...
                        </span>
                      )}
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-gray-500">Checkout ID</span>
                          <p className="font-mono text-xs text-gray-700 truncate">
                            {checkoutResult.checkout_id}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">Idempotency Key</span>
                          <p className="font-mono text-xs text-gray-700 truncate">
                            {checkoutResult.idempotency_key}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <span className="text-gray-500">Status</span>
                          <div className="mt-1">
                            <StatusBadge
                              status={
                                checkoutStatus?.status ?? checkoutResult.status
                              }
                            />
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500">Amount</span>
                          <p className="font-medium text-gray-900">
                            {checkoutResult.amount.toLocaleString("en-IN", {
                              style: "currency",
                              currency: "INR",
                              maximumFractionDigits: 0,
                            })}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">Partial BNPL</span>
                          <p className="text-gray-700">
                            {checkoutResult.is_partial_bnpl ? "Yes" : "No"}
                          </p>
                        </div>
                      </div>

                      {checkoutStatus && (
                        <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-100">
                          <div>
                            <span className="text-gray-500">Retry Count</span>
                            <p className="text-gray-700">
                              {checkoutStatus.retry_count}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Partner Ref</span>
                            <p className="font-mono text-xs text-gray-700">
                              {checkoutStatus.partner_ref || "--"}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Last Updated</span>
                            <p className="text-xs text-gray-700">
                              {new Date(
                                checkoutStatus.updated_at
                              ).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      )}

                      {checkoutStatus?.error_detail && (
                        <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg mt-2">
                          {checkoutStatus.error_detail}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Raw JSON */}
                <div className="space-y-3">
                  <JsonViewer
                    data={eligibilityResult}
                    title="Eligibility Response JSON"
                  />
                  {checkoutResult && (
                    <JsonViewer
                      data={checkoutResult}
                      title="Checkout Initiate JSON"
                    />
                  )}
                  {checkoutStatus && (
                    <JsonViewer
                      data={checkoutStatus}
                      title="Checkout Status JSON"
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
