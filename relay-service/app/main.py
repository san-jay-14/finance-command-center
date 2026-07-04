import asyncio
import logging
import os
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

from app.broker.angel_one import AngelOneAdapter
from app.broker.errors import BrokerAPIError, BrokerAuthError
from app.broker.types import Session
from app.holdings_sync import sync_holdings
from app.latest_prices import upsert_latest_price
from app.realtime_broadcast import broadcast as broadcast_realtime

# Resolved relative to this file rather than plain load_dotenv()'s frame-stack
# search, which doesn't reliably find .env under uvicorn's --reload subprocess.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

adapter = AngelOneAdapter()

IST = ZoneInfo("Asia/Kolkata")

_REQUIRED_ENV_VARS = (
    "ANGEL_ONE_API_KEY",
    "ANGEL_ONE_CLIENT_CODE",
    "ANGEL_ONE_PIN",
    "ANGEL_ONE_TOTP_SECRET",
)

PRICE_TICKS_TOPIC = "price-ticks"

# Cached in-process between requests so manual testing doesn't burn a fresh
# login (and its rate limit budget) on every hit to /holdings.
_session: Session | None = None
_session_lock = asyncio.Lock()


def _credentials_from_env() -> dict[str, str]:
    values = {name: os.environ.get(name) for name in _REQUIRED_ENV_VARS}
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise BrokerAuthError(f"Missing required environment variables: {', '.join(missing)}")
    return {
        "api_key": values["ANGEL_ONE_API_KEY"],
        "client_code": values["ANGEL_ONE_CLIENT_CODE"],
        "pin": values["ANGEL_ONE_PIN"],
        "totp_secret": values["ANGEL_ONE_TOTP_SECRET"],
    }


async def _get_session() -> Session:
    global _session
    async with _session_lock:
        if _session is not None and _session.expires_at > datetime.now(IST):
            return _session
        credentials = _credentials_from_env()
        _session = await adapter.login(credentials)
        return _session


def _make_on_tick():
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")

    def on_tick(tick: dict) -> None:
        if not supabase_url or not service_key:
            logger.warning("SUPABASE_URL/SUPABASE_SERVICE_KEY not set; dropping tick for %s", tick.get("symbol"))
            return
        try:
            broadcast_realtime(supabase_url, service_key, PRICE_TICKS_TOPIC, "tick", tick)
        except Exception:
            logger.exception("Failed to broadcast tick for %s", tick.get("symbol"))
        try:
            upsert_latest_price(tick)
        except Exception:
            logger.exception("Failed to persist latest price for %s", tick.get("symbol"))

    return on_tick


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        session = await _get_session()
        holdings = await adapter.get_holdings(session)

        try:
            await asyncio.to_thread(sync_holdings, session.client_code, holdings)
        except Exception:
            logger.exception("Startup holdings sync into Supabase failed")

        symbols = [h.symbol for h in holdings]
        if symbols:
            logger.info("Starting live price feed for holdings: %s", symbols)
            adapter.subscribe_live_prices(session, symbols, _make_on_tick())
        else:
            logger.info("No holdings found at startup; skipping live price subscription")
    except Exception:
        logger.exception("Startup login/holdings fetch failed; endpoints can still be tested manually")
    yield


app = FastAPI(title="Finagent Relay Service", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/holdings")
async def get_holdings():
    try:
        session = await _get_session()
        holdings = await adapter.get_holdings(session)
    except BrokerAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except BrokerAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return [asdict(h) for h in holdings]


@app.post("/sync-holdings")
async def sync_holdings_endpoint():
    try:
        session = await _get_session()
        holdings = await adapter.get_holdings(session)
    except BrokerAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except BrokerAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        synced = await asyncio.to_thread(sync_holdings, session.client_code, holdings)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to sync holdings into Supabase: {exc}") from exc

    return {"synced": synced, "total": len(holdings)}
