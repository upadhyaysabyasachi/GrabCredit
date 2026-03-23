"""FastAPI application entry point for GrabCredit."""

import asyncio
import logging
import os
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.eligibility import router as eligibility_router
from api.checkout import router as checkout_router
from api.webhook import router as webhook_router
from api.dashboard import router as dashboard_router
from api.simulator import router as simulator_router
from checkout.orchestrator import run_timeout_job

# Structured logging
logging.basicConfig(
    level=logging.INFO,
    format='{"timestamp":"%(asctime)s","level":"%(levelname)s","service":"%(name)s","message":"%(message)s"}',
)
logger = logging.getLogger("grabcredit")

app = FastAPI(
    title="GrabCredit",
    description="BNPL Eligibility & Checkout System",
    version="1.0.0",
)

# CORS — allow frontend origins (env-driven for deployment)
_default_origins = "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001"
_cors_env = os.getenv("CORS_ORIGINS", _default_origins)
CORS_ORIGINS = [o.strip() for o in _cors_env.split(",") if o.strip()]
logger.info(f"CORS allowed origins: {CORS_ORIGINS}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"https://grabcredit.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add a unique request ID to every request for tracing."""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# Routers
app.include_router(eligibility_router, prefix="/api/eligibility", tags=["Eligibility"])
app.include_router(checkout_router, prefix="/api/checkout", tags=["Checkout"])
app.include_router(webhook_router, prefix="/api/webhook", tags=["Webhook"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(simulator_router, prefix="/api/simulator", tags=["Simulator"])


# Background timeout job
timeout_task: asyncio.Task | None = None


@app.on_event("startup")
async def startup():
    global timeout_task
    logger.info("Starting GrabCredit backend")
    timeout_task = asyncio.create_task(run_timeout_job())


@app.on_event("shutdown")
async def shutdown():
    global timeout_task
    if timeout_task:
        timeout_task.cancel()
    logger.info("Shutting down GrabCredit backend")


@app.get("/")
async def root():
    return {"service": "GrabCredit", "status": "running", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
