// TypeScript types matching backend Pydantic models

export type Decision = "APPROVED" | "DECLINED";

export type CheckoutStatus =
  | "INITIATED"
  | "PENDING"
  | "SUCCESS"
  | "DECLINED"
  | "FAILED"
  | "TIMED_OUT";

export type PartnerBehavior =
  | "success"
  | "decline"
  | "transient_failure"
  | "timeout"
  | "duplicate";

export type ReasonCode =
  | "KYC_INCOMPLETE"
  | "CREDIT_TIER_INSUFFICIENT"
  | "CART_VALUE_EXCEEDS_LIMIT"
  | "MERCHANT_NOT_ELIGIBLE"
  | "VELOCITY_LIMIT_EXCEEDED";

export type RecoveryType =
  | "PARTIAL_BNPL"
  | "INLINE_KYC"
  | "UPGRADE_PATH"
  | "ALT_DEALS";

// --- Data types ---

export interface User {
  id: string;
  name: string;
  email: string;
  kyc_status: "completed" | "incomplete";
  credit_tier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  max_bnpl_limit: number;
}

export interface Merchant {
  id: string;
  name: string;
  category: string;
  bnpl_enabled: boolean;
  max_cart_value: number;
}

export interface Deal {
  id: string;
  merchant_id: string;
  title: string;
  description: string;
  min_order_value: number;
  discount_text: string;
  is_active: boolean;
  merchants?: { name: string; category: string; bnpl_enabled: boolean };
}

export interface RuleResult {
  rule: string;
  input: unknown;
  result: "PASS" | "FAIL";
}

export interface EMIOption {
  tenure_months: number;
  monthly_emi: number;
  interest_rate: number;
  total_amount: number;
}

export interface EMITerms {
  options: EMIOption[];
}

export interface RecoveryOption {
  type: RecoveryType;
  upfront_amount?: number;
  bnpl_amount?: number;
  emi_terms?: EMITerms;
  message: string;
  cta_label: string;
  cta_action: string;
}

// --- API Request/Response types ---

export interface EligibilityCheckRequest {
  user_id: string;
  merchant_id: string;
  cart_value: number;
  deal_id?: string;
}

export interface EligibilityCheckResponse {
  decision_id: string;
  user_id: string;
  merchant_id: string;
  cart_value: number;
  decision: Decision;
  reason_codes: string[];
  risk_signals: Record<string, RuleResult>;
  emi_terms: EMITerms | null;
  recovery_options: RecoveryOption[] | null;
  expires_at: string;
  created_at: string;
}

export interface CheckoutInitiateRequest {
  decision_id: string;
  emi_tenure_months: number;
  partner_behavior: PartnerBehavior;
  is_partial_bnpl: boolean;
  amount: number;
}

export interface CheckoutInitiateResponse {
  checkout_id: string;
  decision_id: string;
  idempotency_key: string;
  status: CheckoutStatus;
  amount: number;
  is_partial_bnpl: boolean;
  created_at: string;
}

export interface CheckoutStatusResponse {
  checkout_id: string;
  status: CheckoutStatus;
  partner_ref: string | null;
  error_detail: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface CheckoutHealthResponse {
  total: number;
  by_status: Record<string, number>;
  failure_rate: number;
  health: "green" | "yellow" | "red";
  window_minutes: number;
}

export interface CallbackStatsResponse {
  total: number;
  duplicate_count: number;
  duplicate_rate: number;
}

export interface CallbackLog {
  id: string;
  checkout_id: string;
  idempotency_key: string;
  raw_payload: Record<string, unknown>;
  is_duplicate: boolean;
  is_late: boolean;
  processed_at: string;
  created_at: string;
}

export interface ErrorResponse {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}
