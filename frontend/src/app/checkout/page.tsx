"use client";

import { useState, useCallback } from "react";
import StatusBadge from "@/components/StatusBadge";
import JsonViewer from "@/components/JsonViewer";
import { usePolling } from "@/hooks/usePolling";
import {
  checkEligibility,
  initiateCheckout,
  getCheckoutStatus,
} from "@/lib/api";
import type {
  Deal,
  EligibilityCheckResponse,
  CheckoutInitiateResponse,
  CheckoutStatusResponse,
  EMIOption,
  PartnerBehavior,
  CheckoutStatus,
} from "@/lib/types";

const TEST_USERS = [
  { id: "a1000000-0000-0000-0000-000000000001", name: "Priya Sharma", tier: "GOLD" },
  { id: "a1000000-0000-0000-0000-000000000002", name: "Rahul Verma", tier: "SILVER" },
  { id: "a1000000-0000-0000-0000-000000000003", name: "Anita Desai", tier: "GOLD" },
  { id: "a1000000-0000-0000-0000-000000000004", name: "Vikram Singh", tier: "BRONZE" },
  { id: "a1000000-0000-0000-0000-000000000005", name: "Meera Patel", tier: "PLATINUM" },
];

const HARDCODED_DEALS: Deal[] = [
  {
    id: "c3000000-0000-0000-0000-000000000001",
    merchant_id: "b2000000-0000-0000-0000-000000000001",
    title: "50% off Electronics",
    description: "Up to \u20b95,000 off on Flipkart Electronics",
    min_order_value: 8000,
    discount_text: "Up to \u20b95,000",
    is_active: true,
    merchants: { name: "Flipkart Electronics", category: "Electronics", bnpl_enabled: true },
  },
  {
    id: "c3000000-0000-0000-0000-000000000002",
    merchant_id: "b2000000-0000-0000-0000-000000000002",
    title: "Flat \u20b92,000 off Fashion",
    description: "On orders above \u20b95,000 at Amazon Fashion",
    min_order_value: 5000,
    discount_text: "\u20b92,000 flat off",
    is_active: true,
    merchants: { name: "Amazon Fashion", category: "Fashion", bnpl_enabled: true },
  },
  {
    id: "c3000000-0000-0000-0000-000000000003",
    merchant_id: "b2000000-0000-0000-0000-000000000003",
    title: "30% off Everything",
    description: "Up to \u20b91,500 off at Local Store",
    min_order_value: 3000,
    discount_text: "Up to \u20b91,500",
    is_active: true,
    merchants: { name: "Local Store", category: "Retail", bnpl_enabled: false },
  },
];

const TERMINAL_STATUSES: CheckoutStatus[] = ["SUCCESS", "DECLINED", "FAILED", "TIMED_OUT"];

const STEP_LABELS = ["Select Deal", "Cart & Eligibility", "Result", "Checkout"];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {STEP_LABELS.map((label, i) => {
        const step = i + 1;
        const isActive = step === currentStep;
        const isCompleted = step < currentStep;
        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${isCompleted ? "bg-indigo-600 text-white" : isActive ? "bg-indigo-600 text-white ring-4 ring-indigo-200" : "bg-gray-200 text-gray-500"}`}
              >
                {isCompleted ? "\u2713" : step}
              </div>
              <span className={`mt-1 text-xs ${isActive ? "text-indigo-600 font-medium" : "text-gray-400"}`}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`w-16 h-0.5 mx-2 ${step < currentStep ? "bg-indigo-600" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CheckoutPage() {
  const [userId, setUserId] = useState(TEST_USERS[0].id);
  const [step, setStep] = useState(1);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [cartValue, setCartValue] = useState(0);
  const [deals] = useState<Deal[]>(HARDCODED_DEALS);
  const [eligibility, setEligibility] = useState<EligibilityCheckResponse | null>(null);
  const [selectedTenure, setSelectedTenure] = useState<EMIOption | null>(null);
  const partnerBehavior: PartnerBehavior = "success";
  const [checkoutResponse, setCheckoutResponse] = useState<CheckoutInitiateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollingFetcher = useCallback(
    () => getCheckoutStatus(checkoutResponse?.checkout_id || ""),
    [checkoutResponse?.checkout_id]
  );

  const { data: pollData, isPolling } = usePolling<CheckoutStatusResponse>(pollingFetcher, {
    enabled: step === 4 && !!checkoutResponse?.checkout_id,
    intervalMs: 2000,
    isTerminal: (d) => TERMINAL_STATUSES.includes(d.status),
  });

  const handleDealSelect = (deal: Deal) => {
    setSelectedDeal(deal);
    setCartValue(deal.min_order_value);
    setStep(2);
    setError(null);
  };

  const handleCheckEligibility = async () => {
    if (!selectedDeal) return;
    setLoading(true);
    setError(null);
    try {
      const res = await checkEligibility({
        user_id: userId,
        merchant_id: selectedDeal.merchant_id,
        cart_value: cartValue,
        deal_id: selectedDeal.id,
      });
      setEligibility(res);
      if (res.emi_terms?.options?.length) {
        setSelectedTenure(res.emi_terms.options[0]);
      }
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eligibility check failed");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmBNPL = async () => {
    if (!eligibility || !selectedTenure) return;
    setLoading(true);
    setError(null);
    try {
      const isPartial = eligibility.recovery_options?.some((r) => r.type === "PARTIAL_BNPL") ?? false;
      const amount = isPartial
        ? eligibility.recovery_options?.find((r) => r.type === "PARTIAL_BNPL")?.bnpl_amount ?? cartValue
        : cartValue;
      const res = await initiateCheckout({
        decision_id: eligibility.decision_id,
        emi_tenure_months: selectedTenure.tenure_months,
        partner_behavior: partnerBehavior,
        is_partial_bnpl: isPartial,
        amount,
      });
      setCheckoutResponse(res);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout initiation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedDeal(null);
    setCartValue(0);
    setEligibility(null);
    setSelectedTenure(null);
    setCheckoutResponse(null);
    setError(null);
  };

  const currentUser = TEST_USERS.find((u) => u.id === userId);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">BNPL Checkout</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">Test User:</label>
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              handleReset();
            }}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {TEST_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.tier})
              </option>
            ))}
          </select>
        </div>
      </div>

      <StepIndicator currentStep={step} />

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Deal Selection */}
      {step === 1 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Select a Deal</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {deals.map((deal) => (
              <button
                key={deal.id}
                onClick={() => handleDealSelect(deal)}
                className="text-left border border-gray-200 rounded-lg p-5 hover:border-indigo-400 hover:shadow-md transition-all"
              >
                <div className="text-xs font-medium text-indigo-600 uppercase tracking-wide mb-1">
                  {deal.merchants?.name}
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">{deal.title}</h3>
                <p className="text-sm text-gray-500 mb-3">{deal.description}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Min. order: {"\u20b9"}{deal.min_order_value.toLocaleString("en-IN")}</span>
                  <span className="font-medium text-green-600">{deal.discount_text}</span>
                </div>
                {!deal.merchants?.bnpl_enabled && (
                  <div className="mt-2 text-xs text-orange-600 font-medium">BNPL not available</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Cart & Eligibility */}
      {step === 2 && selectedDeal && (
        <div className="max-w-lg mx-auto">
          <div className="border border-gray-200 rounded-lg p-6 mb-6">
            <div className="text-xs font-medium text-indigo-600 uppercase tracking-wide mb-1">
              {selectedDeal.merchants?.name}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{selectedDeal.title}</h3>
            <p className="text-sm text-gray-500 mb-4">{selectedDeal.description}</p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cart Value ({"\u20b9"})
              </label>
              <input
                type="number"
                value={cartValue}
                onChange={(e) => setCartValue(Number(e.target.value))}
                min={0}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <p className="text-xs text-gray-400 mb-4">
              User: {currentUser?.name} | Tier: {currentUser?.tier}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleCheckEligibility}
                disabled={loading || cartValue <= 0}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Checking..." : "Check BNPL Eligibility"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Result */}
      {step === 3 && eligibility && (
        <div className="max-w-lg mx-auto">
          <div className="border border-gray-200 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Eligibility Result</h3>
              <StatusBadge status={eligibility.decision} />
            </div>

            {eligibility.decision === "APPROVED" && eligibility.emi_terms && (
              <>
                <p className="text-sm text-gray-500 mb-4">
                  You are approved for BNPL on {"\u20b9"}{eligibility.cart_value.toLocaleString("en-IN")}. Select an EMI plan:
                </p>
                <div className="space-y-2 mb-6">
                  {eligibility.emi_terms.options.map((opt) => (
                    <button
                      key={opt.tenure_months}
                      onClick={() => setSelectedTenure(opt)}
                      className={`w-full text-left p-3 rounded-lg border text-sm transition-colors
                        ${selectedTenure?.tenure_months === opt.tenure_months
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-gray-200 hover:border-gray-300"}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{opt.tenure_months} months</span>
                        <span className="text-indigo-600 font-semibold">
                          {"\u20b9"}{opt.monthly_emi.toLocaleString("en-IN")}/mo
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {opt.interest_rate}% p.a. | Total: {"\u20b9"}{opt.total_amount.toLocaleString("en-IN")}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => { setStep(2); setEligibility(null); }}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleConfirmBNPL}
                    disabled={loading || !selectedTenure}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {loading ? "Processing..." : "Confirm BNPL"}
                  </button>
                </div>
              </>
            )}

            {eligibility.decision === "DECLINED" && (
              <>
                <div className="mb-4">
                  {eligibility.reason_codes.map((code) => {
                    const messages: Record<string, string> = {
                      KYC_INCOMPLETE: "Complete your KYC verification to unlock BNPL.",
                      CREDIT_TIER_INSUFFICIENT: "Your account needs a higher trust level for BNPL. Complete more transactions to upgrade.",
                      CART_VALUE_EXCEEDS_LIMIT: `Your BNPL limit is \u20b9${Number((eligibility.risk_signals?.cart_value_limit?.input as Record<string, number>)?.limit || 0).toLocaleString("en-IN")}. The cart value exceeds this limit.`,
                      MERCHANT_NOT_ELIGIBLE: "BNPL is not available for this merchant yet.",
                      VELOCITY_LIMIT_EXCEEDED: (() => {
                        const vi = eligibility.risk_signals?.velocity_check?.input as Record<string, number> | undefined;
                        const retry = vi?.retry_after_minutes;
                        return retry
                          ? `You\u2019ve made too many BNPL checks recently (${vi?.checks_in_hour}/${vi?.limit} in the last hour). Please try again in ~${retry} minutes.`
                          : "Too many eligibility checks recently. Please wait and try again later.";
                      })(),
                    };
                    return (
                      <div key={code} className="flex items-start gap-3 mb-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                        <StatusBadge status={code} />
                        <p className="text-sm text-gray-700">{messages[code] || code}</p>
                      </div>
                    );
                  })}
                </div>

                {eligibility.recovery_options && eligibility.recovery_options.length > 0 && (
                  <div className="border-t border-gray-100 pt-4 mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">Recovery Options</p>
                    <div className="space-y-3">
                      {eligibility.recovery_options.map((opt, i) => (
                        <div key={i} className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <StatusBadge status={opt.type} />
                          </div>
                          <p className="text-sm text-gray-700 mb-2">{opt.message}</p>
                          {opt.type === "PARTIAL_BNPL" && opt.upfront_amount != null && opt.bnpl_amount != null && (
                            <div className="text-xs text-gray-500 mb-2">
                              Pay {"\u20b9"}{opt.upfront_amount.toLocaleString("en-IN")} upfront + {"\u20b9"}{opt.bnpl_amount.toLocaleString("en-IN")} via BNPL
                            </div>
                          )}
                          {opt.type === "PARTIAL_BNPL" && opt.emi_terms && (
                            <>
                              <div className="space-y-1 mb-3">
                                {opt.emi_terms.options.map((emi) => (
                                  <button
                                    key={emi.tenure_months}
                                    onClick={() => setSelectedTenure(emi)}
                                    className={`w-full text-left p-2 rounded border text-xs ${
                                      selectedTenure?.tenure_months === emi.tenure_months
                                        ? "border-indigo-500 bg-indigo-50"
                                        : "border-gray-200"
                                    }`}
                                  >
                                    {emi.tenure_months}mo - {"\u20b9"}{emi.monthly_emi}/mo ({emi.interest_rate}% p.a.)
                                  </button>
                                ))}
                              </div>
                              <button
                                onClick={handleConfirmBNPL}
                                disabled={loading || !selectedTenure}
                                className="w-full px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                              >
                                {loading ? "Processing..." : opt.cta_label}
                              </button>
                            </>
                          )}
                          {opt.type !== "PARTIAL_BNPL" && (
                            <p className="text-xs text-indigo-600 font-medium">{opt.cta_label}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => { setStep(2); setEligibility(null); }}
                  className="w-full px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50"
                >
                  Try Again
                </button>
              </>
            )}
          </div>

          <JsonViewer data={eligibility} title="Eligibility Response JSON" />
        </div>
      )}

      {/* Step 4: Checkout */}
      {step === 4 && (
        <div className="max-w-lg mx-auto">
          <div className="border border-gray-200 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Checkout Status</h3>

            {isPolling && !pollData && (
              <div className="flex items-center gap-3 text-gray-500 py-8 justify-center">
                <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Processing checkout...</span>
              </div>
            )}

            {pollData && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Status</span>
                  <StatusBadge status={pollData.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Checkout ID</span>
                  <span className="text-sm font-mono text-gray-700">{pollData.checkout_id.slice(0, 12)}...</span>
                </div>
                {pollData.partner_ref && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Partner Reference</span>
                    <span className="text-sm font-mono text-gray-700">{pollData.partner_ref}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Retry Count</span>
                  <span className="text-sm text-gray-700">{pollData.retry_count}</span>
                </div>
                {pollData.error_detail && (
                  <div className="bg-red-50 border border-red-100 rounded p-3">
                    <p className="text-xs text-red-600">{pollData.error_detail}</p>
                  </div>
                )}

                {isPolling && (
                  <div className="flex items-center gap-2 text-sm text-yellow-600">
                    <div className="w-3 h-3 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin" />
                    Waiting for partner callback...
                  </div>
                )}

                {!isPolling && TERMINAL_STATUSES.includes(pollData.status) && (
                  <div className={`p-4 rounded-lg text-center text-sm font-medium ${
                    pollData.status === "SUCCESS"
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}>
                    {pollData.status === "SUCCESS"
                      ? "Payment completed successfully!"
                      : pollData.status === "TIMED_OUT"
                      ? "Partner response timed out. Please try again."
                      : pollData.status === "DECLINED"
                      ? "Payment was declined by the partner."
                      : "Payment failed. Please try again."}
                  </div>
                )}
              </div>
            )}

            {(!isPolling || (pollData && TERMINAL_STATUSES.includes(pollData.status))) && (
              <button
                onClick={handleReset}
                className="mt-6 w-full px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50"
              >
                Start Over
              </button>
            )}
          </div>

          {pollData && <JsonViewer data={pollData} title="Checkout Status JSON" />}
          {checkoutResponse && <div className="mt-3"><JsonViewer data={checkoutResponse} title="Checkout Initiation JSON" /></div>}
        </div>
      )}
    </div>
  );
}
