"""Partner API client.

In the prototype, this delegates to the mock partner.
In production, this would make real HTTP calls to PayU/LazyPay.
"""

import logging

from partner.mock_partner import handle_partner_request

logger = logging.getLogger("grabcredit.partner_client")


async def send_checkout_to_partner(request: dict) -> dict:
    """Send a checkout request to the partner (mock).

    Returns a dict with status_code and body.
    """
    return await handle_partner_request(request)
