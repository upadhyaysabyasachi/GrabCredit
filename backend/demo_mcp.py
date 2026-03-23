"""
GrabCredit MCP Server Demo
===========================

This script demonstrates the MCP server by acting as an MCP client.
It connects to the GrabCredit MCP server via SSE, discovers available tools,
and runs through key BNPL scenarios — the same way an AI assistant
(e.g., Claude Desktop) would interact with GrabCredit.

Prerequisites:
  1. Backend running:  uvicorn main:app --port 8000
  2. MCP server running:  python -m mcp_server.server  (SSE on port 8001)

Usage:
  python demo_mcp.py
"""

import asyncio
import json
import sys
import httpx
from mcp import ClientSession
from mcp.client.sse import sse_client

MCP_URL = "http://localhost:8001/sse"
BACKEND_URL = "http://localhost:8000"

# ANSI colors for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def header(text: str):
    print(f"\n{BOLD}{CYAN}{'=' * 60}")
    print(f"  {text}")
    print(f"{'=' * 60}{RESET}\n")


def result(label: str, value: str, color: str = GREEN):
    print(f"  {label}: {color}{value}{RESET}")


async def poll_checkout(checkout_id: str, max_wait: int = 15) -> dict:
    """Poll checkout status via the REST API until terminal."""
    terminal = {"SUCCESS", "DECLINED", "FAILED", "TIMED_OUT"}
    async with httpx.AsyncClient() as client:
        for _ in range(max_wait):
            resp = await client.get(f"{BACKEND_URL}/api/checkout/{checkout_id}/status")
            data = resp.json()
            if data["status"] in terminal:
                return data
            await asyncio.sleep(2)
    return data


async def run_demo():
    # Reset velocity for demo users
    async with httpx.AsyncClient() as client:
        for i in range(1, 6):
            await client.post(f"{BACKEND_URL}/api/simulator/reset-velocity/a1000000-0000-0000-0000-00000000000{i}")

    print(f"\n{BOLD}GrabCredit MCP Server Demo{RESET}")
    print(f"Connecting to MCP server at {MCP_URL}...\n")

    async with sse_client(MCP_URL) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # ─── Discover Tools ───
            header("Tool Discovery")
            tools = await session.list_tools()
            print(f"  Found {BOLD}{len(tools.tools)} tools{RESET}:\n")
            for tool in tools.tools:
                print(f"  {BOLD}{tool.name}{RESET}")
                print(f"    {tool.description[:100]}...")
                print()

            # ─── Scenario 1: Happy Path ───
            header("Scenario 1: Happy Path")
            print("  Priya Sharma (GOLD, KYC complete, ₹20K limit)")
            print("  + Flipkart Electronics + ₹8,000\n")

            eligibility = await session.call_tool("check_bnpl_eligibility", {
                "user_id": "a1000000-0000-0000-0000-000000000001",
                "merchant_id": "b2000000-0000-0000-0000-000000000001",
                "cart_value": 8000.0,
            })
            data = json.loads(eligibility.content[0].text)
            result("Decision", data["decision"])
            result("Reason Codes", str(data["reason_codes"]))
            result("EMI Options", f"{len(data['emi_terms']['options'])} tenures")
            for opt in data["emi_terms"]["options"]:
                print(f"    {opt['tenure_months']}mo: ₹{opt['monthly_emi']}/mo → total ₹{opt['total_amount']}")
            result("Decision ID", data["decision_id"])

            print(f"\n  {YELLOW}→ Initiating checkout via MCP...{RESET}")
            checkout = await session.call_tool("initiate_bnpl_checkout", {
                "decision_id": data["decision_id"],
                "emi_tenure_months": 3,
                "partner_behavior": "success",
                "amount": 8000.0,
            })
            co_data = json.loads(checkout.content[0].text)
            result("Checkout ID", co_data["checkout_id"])
            result("Idempotency Key", co_data["idempotency_key"])
            result("Status", co_data["status"])

            print(f"\n  {YELLOW}→ Polling for partner callback...{RESET}")
            final = await poll_checkout(co_data["checkout_id"])
            color = GREEN if final["status"] == "SUCCESS" else RED
            result("Final Status", final["status"], color)
            result("Partner Ref", str(final.get("partner_ref", "—")))
            print(f"\n  {GREEN}✓ Happy path complete: APPROVED → INITIATED → SUCCESS{RESET}")

            # ─── Scenario 2: KYC Decline ───
            header("Scenario 2: KYC Incomplete")
            print("  Anita Desai (KYC incomplete) + Flipkart + ₹5,000\n")

            eligibility = await session.call_tool("check_bnpl_eligibility", {
                "user_id": "a1000000-0000-0000-0000-000000000003",
                "merchant_id": "b2000000-0000-0000-0000-000000000001",
                "cart_value": 5000.0,
            })
            data = json.loads(eligibility.content[0].text)
            result("Decision", data["decision"], RED)
            result("Reason Codes", str(data["reason_codes"]), RED)
            if data.get("recovery_options"):
                for ro in data["recovery_options"]:
                    result("Recovery", f"{ro['type']} — {ro['message']}", YELLOW)
            print(f"\n  {GREEN}✓ Decline with recovery: KYC_INCOMPLETE + INLINE_KYC{RESET}")

            # ─── Scenario 3: Partial BNPL ───
            header("Scenario 3: Cart Exceeds Limit → Partial BNPL")
            print("  Rahul Verma (SILVER, ₹10K limit) + Flipkart + ₹15,000\n")

            eligibility = await session.call_tool("check_bnpl_eligibility", {
                "user_id": "a1000000-0000-0000-0000-000000000002",
                "merchant_id": "b2000000-0000-0000-0000-000000000001",
                "cart_value": 15000.0,
            })
            data = json.loads(eligibility.content[0].text)
            result("Decision", data["decision"], RED)
            result("Reason Codes", str(data["reason_codes"]), RED)
            ro = data["recovery_options"][0]
            result("Recovery Type", ro["type"], YELLOW)
            result("Upfront", f"₹{ro['upfront_amount']:,.0f}", YELLOW)
            result("BNPL Amount", f"₹{ro['bnpl_amount']:,.0f}", YELLOW)

            print(f"\n  {YELLOW}→ Accepting partial BNPL (₹10K checkout)...{RESET}")
            checkout = await session.call_tool("initiate_bnpl_checkout", {
                "decision_id": data["decision_id"],
                "emi_tenure_months": 6,
                "partner_behavior": "success",
                "is_partial_bnpl": True,
                "amount": ro["bnpl_amount"],
            })
            co_data = json.loads(checkout.content[0].text)
            result("Checkout Amount", f"₹{co_data['amount']:,.0f}")

            print(f"  {YELLOW}→ Polling...{RESET}")
            final = await poll_checkout(co_data["checkout_id"])
            result("Final Status", final["status"], GREEN)
            print(f"\n  {GREEN}✓ Partial BNPL: DECLINED → split accepted → ₹10K checkout → SUCCESS{RESET}")

            # ─── Scenario 4: Partner Decline ───
            header("Scenario 4: Partner Decline")
            print("  Priya + Flipkart + ₹8,000 + partner declines\n")

            eligibility = await session.call_tool("check_bnpl_eligibility", {
                "user_id": "a1000000-0000-0000-0000-000000000001",
                "merchant_id": "b2000000-0000-0000-0000-000000000001",
                "cart_value": 8000.0,
            })
            data = json.loads(eligibility.content[0].text)
            result("Decision", data["decision"])

            checkout = await session.call_tool("initiate_bnpl_checkout", {
                "decision_id": data["decision_id"],
                "emi_tenure_months": 3,
                "partner_behavior": "decline",
                "amount": 8000.0,
            })
            co_data = json.loads(checkout.content[0].text)

            print(f"  {YELLOW}→ Polling...{RESET}")
            final = await poll_checkout(co_data["checkout_id"])
            result("Final Status", final["status"], RED)
            result("Error Detail", str(final.get("error_detail", "—")), RED)
            print(f"\n  {GREEN}✓ Partner decline: APPROVED → INITIATED → DECLINED{RESET}")

            # ─── Scenario 5: Transient Failure + Retry ───
            header("Scenario 5: Transient Failure → Retry → Success")
            print("  Priya + Flipkart + ₹8,000 + partner returns 5xx then succeeds\n")

            eligibility = await session.call_tool("check_bnpl_eligibility", {
                "user_id": "a1000000-0000-0000-0000-000000000001",
                "merchant_id": "b2000000-0000-0000-0000-000000000001",
                "cart_value": 8000.0,
            })
            data = json.loads(eligibility.content[0].text)
            result("Decision", data["decision"])

            checkout = await session.call_tool("initiate_bnpl_checkout", {
                "decision_id": data["decision_id"],
                "emi_tenure_months": 3,
                "partner_behavior": "transient_failure",
                "amount": 8000.0,
            })
            co_data = json.loads(checkout.content[0].text)

            print(f"  {YELLOW}→ Waiting for retries + callback (12s)...{RESET}")
            final = await poll_checkout(co_data["checkout_id"], max_wait=20)
            result("Final Status", final["status"], GREEN)
            result("Retry Count", str(final.get("retry_count", 0)), YELLOW)
            print(f"\n  {GREEN}✓ Transient failure: retries with backoff → SUCCESS{RESET}")

            # ─── Summary ───
            header("Demo Complete")
            print(f"  All 5 scenarios executed via MCP tools.")
            print(f"  The same tools are available to any MCP client")
            print(f"  (Claude Desktop, AI agents, custom integrations).\n")
            print(f"  MCP Server:  {MCP_URL}")
            print(f"  Tools:       check_bnpl_eligibility, initiate_bnpl_checkout")
            print(f"  Transport:   SSE (Server-Sent Events)")
            print()


if __name__ == "__main__":
    # Check servers are running
    try:
        httpx.get(f"{BACKEND_URL}/")
    except httpx.ConnectError:
        print(f"{RED}Error: Backend not running at {BACKEND_URL}{RESET}")
        print("Start it with: cd backend && source .venv/bin/activate && uvicorn main:app --port 8000")
        sys.exit(1)

    try:
        # SSE endpoint streams, so a ReadTimeout is expected — it means it's running
        with httpx.stream("GET", "http://localhost:8001/sse", timeout=2) as r:
            pass
    except httpx.ReadTimeout:
        pass  # Expected — SSE is a streaming endpoint
    except httpx.ConnectError:
        print(f"{RED}Error: MCP server not running at {MCP_URL}{RESET}")
        print("Start it with: cd backend && source .venv/bin/activate && python -m mcp_server.server")
        sys.exit(1)

    asyncio.run(run_demo())
