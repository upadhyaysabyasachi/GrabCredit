-- GrabCredit Schema
-- Run this in Supabase SQL Editor

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    kyc_status TEXT NOT NULL CHECK (kyc_status IN ('completed', 'incomplete')) DEFAULT 'incomplete',
    credit_tier TEXT NOT NULL CHECK (credit_tier IN ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM')) DEFAULT 'BRONZE',
    max_bnpl_limit DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- MERCHANTS
-- ============================================
CREATE TABLE merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    bnpl_enabled BOOLEAN NOT NULL DEFAULT false,
    max_cart_value DECIMAL(12,2) NOT NULL DEFAULT 100000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- DEALS (for cart value sourcing)
-- ============================================
CREATE TABLE deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    title TEXT NOT NULL,
    description TEXT,
    min_order_value DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_text TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- ELIGIBILITY DECISIONS (audit log)
-- ============================================
CREATE TABLE eligibility_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    deal_id UUID REFERENCES deals(id),
    cart_value DECIMAL(12,2) NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'DECLINED')),
    reason_codes TEXT[] NOT NULL DEFAULT '{}',
    risk_signals JSONB NOT NULL DEFAULT '{}',
    emi_terms JSONB,
    recovery_options JSONB,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eligibility_decisions_user_id ON eligibility_decisions(user_id);
CREATE INDEX idx_eligibility_decisions_created_at ON eligibility_decisions(created_at DESC);
CREATE INDEX idx_eligibility_decisions_decision ON eligibility_decisions(decision);

-- ============================================
-- CHECKOUT ATTEMPTS (state machine)
-- ============================================
CREATE TABLE checkout_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id UUID NOT NULL REFERENCES eligibility_decisions(id),
    idempotency_key TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('INITIATED', 'PENDING', 'SUCCESS', 'DECLINED', 'FAILED', 'TIMED_OUT')) DEFAULT 'INITIATED',
    partner_ref TEXT,
    error_detail TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    partner_behavior TEXT DEFAULT 'success',  -- For mock partner: success, decline, transient_failure, timeout, duplicate
    amount DECIMAL(12,2) NOT NULL,
    emi_tenure_months INTEGER,  -- Selected EMI tenure (3, 6, 9, or 12 months)
    is_partial_bnpl BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checkout_attempts_decision_id ON checkout_attempts(decision_id);
CREATE INDEX idx_checkout_attempts_status ON checkout_attempts(status);
CREATE INDEX idx_checkout_attempts_created_at ON checkout_attempts(created_at DESC);
CREATE INDEX idx_checkout_attempts_idempotency_key ON checkout_attempts(idempotency_key);

-- ============================================
-- CALLBACK LOGS (every raw partner callback)
-- ============================================
CREATE TABLE callback_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkout_id UUID NOT NULL REFERENCES checkout_attempts(id),
    idempotency_key TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    is_duplicate BOOLEAN NOT NULL DEFAULT false,
    is_late BOOLEAN NOT NULL DEFAULT false,  -- Callback arrived after checkout reached terminal state
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_callback_logs_checkout_id ON callback_logs(checkout_id);
CREATE INDEX idx_callback_logs_idempotency_key ON callback_logs(idempotency_key);
CREATE INDEX idx_callback_logs_is_duplicate ON callback_logs(is_duplicate);

-- ============================================
-- VELOCITY EVENTS (rate limiting)
-- ============================================
CREATE TABLE velocity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    event_type TEXT NOT NULL DEFAULT 'eligibility_check',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_velocity_events_user_created ON velocity_events(user_id, created_at DESC);

-- ============================================
-- HELPER: updated_at trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_checkout_attempts_updated_at
    BEFORE UPDATE ON checkout_attempts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS Policies (permissive for prototype)
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE eligibility_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE callback_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE velocity_events ENABLE ROW LEVEL SECURITY;

-- Allow all access for prototype (use service role key)
CREATE POLICY "Allow all for service role" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON merchants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON deals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON eligibility_decisions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON checkout_attempts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON callback_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON velocity_events FOR ALL USING (true) WITH CHECK (true);
