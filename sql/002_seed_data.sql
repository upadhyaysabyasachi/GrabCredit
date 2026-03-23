-- GrabCredit Seed Data
-- Run this AFTER 001_create_tables.sql

-- ============================================
-- TEST USERS
-- ============================================
INSERT INTO users (id, name, email, kyc_status, credit_tier, max_bnpl_limit) VALUES
    ('a1000000-0000-0000-0000-000000000001', 'Priya Sharma', 'priya@example.com', 'completed', 'GOLD', 20000.00),
    ('a1000000-0000-0000-0000-000000000002', 'Rahul Verma', 'rahul@example.com', 'completed', 'SILVER', 10000.00),
    ('a1000000-0000-0000-0000-000000000003', 'Anita Desai', 'anita@example.com', 'incomplete', 'GOLD', 15000.00),
    ('a1000000-0000-0000-0000-000000000004', 'Vikram Singh', 'vikram@example.com', 'completed', 'BRONZE', 5000.00),
    ('a1000000-0000-0000-0000-000000000005', 'Meera Patel', 'meera@example.com', 'completed', 'PLATINUM', 50000.00);

-- ============================================
-- TEST MERCHANTS
-- ============================================
INSERT INTO merchants (id, name, category, bnpl_enabled, max_cart_value) VALUES
    ('b2000000-0000-0000-0000-000000000001', 'Flipkart Electronics', 'Electronics', true, 200000.00),
    ('b2000000-0000-0000-0000-000000000002', 'Amazon Fashion', 'Fashion', true, 100000.00),
    ('b2000000-0000-0000-0000-000000000003', 'Local Store', 'Retail', false, 50000.00),
    ('b2000000-0000-0000-0000-000000000004', 'Myntra', 'Fashion', true, 150000.00);

-- ============================================
-- TEST DEALS
-- ============================================
INSERT INTO deals (id, merchant_id, title, description, min_order_value, discount_text) VALUES
    ('c3000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '50% off Electronics', 'Up to ₹5,000 off on electronics. Min order ₹8,000.', 8000.00, 'Up to ₹5,000 off'),
    ('c3000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'Flat ₹2,000 off Fashion', 'Flat ₹2,000 off on orders above ₹5,000.', 5000.00, '₹2,000 off'),
    ('c3000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000003', '30% off Everything', '30% off on all items. Min order ₹3,000.', 3000.00, 'Up to ₹1,500 off'),
    ('c3000000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-000000000004', 'Buy 2 Get 1 Free', 'Buy 2 items get 1 free. Min order ₹4,000.', 4000.00, 'Buy 2 Get 1'),
    ('c3000000-0000-0000-0000-000000000005', 'b2000000-0000-0000-0000-000000000001', 'Mega Electronics Sale', 'Huge discounts on premium electronics. Min order ₹15,000.', 15000.00, 'Up to ₹10,000 off');
