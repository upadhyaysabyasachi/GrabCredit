"""Application configuration and Supabase client."""

import os
from functools import lru_cache

from dotenv import load_dotenv
from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions

load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")

    BACKEND_HOST: str = os.getenv("BACKEND_HOST", "0.0.0.0")
    BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000")

    # Feature flags / thresholds
    VELOCITY_LIMIT_PER_HOUR: int = int(os.getenv("VELOCITY_LIMIT_PER_HOUR", "5"))
    DECISION_EXPIRY_MINUTES: int = int(os.getenv("DECISION_EXPIRY_MINUTES", "15"))
    CHECKOUT_TIMEOUT_MINUTES: int = int(os.getenv("CHECKOUT_TIMEOUT_MINUTES", "5"))
    MAX_PARTNER_RETRIES: int = int(os.getenv("MAX_PARTNER_RETRIES", "3"))

    # Mock partner
    MOCK_PARTNER_CALLBACK_DELAY_MS: int = int(
        os.getenv("MOCK_PARTNER_CALLBACK_DELAY_MS", "2000")
    )

    # EMI
    EMI_MONTHLY_RATE: float = 0.015  # 1.5% monthly
    EMI_TENURE_OPTIONS: list[int] = [3, 6, 9, 12]

    # Minimum upfront for partial BNPL
    MIN_PARTIAL_UPFRONT: float = 100.0


@lru_cache()
def get_settings() -> Settings:
    return Settings()


def get_supabase() -> Client:
    """Create and return a Supabase client using service role key.

    Configured to use the 'grabcredit' schema instead of 'public'.
    """
    settings = get_settings()
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY,
        options=SyncClientOptions(schema="grabcredit"),
    )
