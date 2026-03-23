/**
 * API client for GrabCredit backend.
 * All API calls go through this module — never call backend directly from components.
 */

import type {
  EligibilityCheckRequest,
  EligibilityCheckResponse,
  CheckoutInitiateRequest,
  CheckoutInitiateResponse,
  CheckoutStatusResponse,
  CheckoutHealthResponse,
  CallbackStatsResponse,
  User,
  Merchant,
  Deal,
  CallbackLog,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || error.detail?.error || `API error ${res.status}`);
  }

  return res.json();
}

// --- Eligibility ---

export async function checkEligibility(
  data: EligibilityCheckRequest
): Promise<EligibilityCheckResponse> {
  return request("/api/eligibility/check", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// --- Checkout ---

export async function initiateCheckout(
  data: CheckoutInitiateRequest
): Promise<CheckoutInitiateResponse> {
  return request("/api/checkout/initiate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getCheckoutStatus(
  checkoutId: string
): Promise<CheckoutStatusResponse> {
  return request(`/api/checkout/${checkoutId}/status`);
}

// --- Dashboard ---

export async function getDashboardDecisions(params?: {
  user_id?: string;
  decision?: string;
  limit?: number;
  offset?: number;
}): Promise<{ decisions: EligibilityCheckResponse[]; total: number; limit: number; offset: number }> {
  const searchParams = new URLSearchParams();
  if (params?.user_id) searchParams.set("user_id", params.user_id);
  if (params?.decision) searchParams.set("decision", params.decision);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  return request(`/api/dashboard/decisions${qs ? `?${qs}` : ""}`);
}

export async function getDecisionDetail(decisionId: string) {
  return request<{
    decision: EligibilityCheckResponse;
    user: { name: string; email: string } | null;
    merchant: { name: string; category: string } | null;
    checkouts: CheckoutStatusResponse[];
    callbacks: CallbackLog[];
  }>(`/api/dashboard/decisions/${decisionId}`);
}

export async function getDashboardCheckouts(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  return request<{ checkouts: CheckoutStatusResponse[]; total: number }>(`/api/dashboard/checkouts${qs ? `?${qs}` : ""}`);
}

export async function getCheckoutHealth(): Promise<CheckoutHealthResponse> {
  return request("/api/dashboard/checkouts/health");
}

export async function getDashboardCallbacks(params?: {
  is_duplicate?: boolean;
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.is_duplicate !== undefined)
    searchParams.set("is_duplicate", String(params.is_duplicate));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();
  return request<{ callbacks: CallbackLog[]; total: number }>(`/api/dashboard/callbacks${qs ? `?${qs}` : ""}`);
}

export async function getCallbackStats(): Promise<CallbackStatsResponse> {
  return request("/api/dashboard/callbacks/stats");
}

// --- Simulator ---

export async function getSimulatorUsers(): Promise<User[]> {
  return request("/api/simulator/users");
}

export async function getSimulatorMerchants(): Promise<Merchant[]> {
  return request("/api/simulator/merchants");
}

export async function getSimulatorDeals(merchantId?: string): Promise<Deal[]> {
  const qs = merchantId ? `?merchant_id=${merchantId}` : "";
  return request(`/api/simulator/deals${qs}`);
}

export async function toggleKYC(userId: string) {
  return request<{ user_id: string; kyc_status: string; previous_status: string }>(
    `/api/simulator/toggle-kyc/${userId}`,
    { method: "POST" }
  );
}

export async function resetVelocity(userId: string) {
  return request<{ user_id: string; velocity_events_cleared: boolean }>(
    `/api/simulator/reset-velocity/${userId}`,
    { method: "POST" }
  );
}
