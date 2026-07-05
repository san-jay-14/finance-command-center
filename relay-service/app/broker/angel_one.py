import asyncio
import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Callable
from zoneinfo import ZoneInfo

import httpx
import pyotp
from SmartApi.smartConnect import SmartConnect
from SmartApi.smartExceptions import SmartAPIException
from SmartApi.smartWebSocketV2 import SmartWebSocketV2

from app.broker.base import BrokerAdapter
from app.broker.errors import BrokerAPIError, BrokerAuthError
from app.broker.types import Candle, Holding, OrderRequest, OrderResult, OrderStatus, Session

IST = ZoneInfo("Asia/Kolkata")

logger = logging.getLogger(__name__)

# Angel One's holdings API returns exchange as a string ("NSE"); the WebSocket
# feed wants SmartWebSocketV2's integer exchangeType codes for the same venue.
_EXCHANGE_TYPE_MAP = {
    "NSE": SmartWebSocketV2.NSE_CM,
    "NFO": SmartWebSocketV2.NSE_FO,
    "BSE": SmartWebSocketV2.BSE_CM,
    "BFO": SmartWebSocketV2.BSE_FO,
    "MCX": SmartWebSocketV2.MCX_FO,
    "NCX": SmartWebSocketV2.NCX_FO,
    "CDS": SmartWebSocketV2.CDE_FO,
}
_REVERSE_EXCHANGE_TYPE_MAP = {v: k for k, v in _EXCHANGE_TYPE_MAP.items()}

# Angel One's public instrument master — the standard way to resolve a
# symbol's token for symbols that aren't currently held (get_holdings() only
# populates tokens for what's actually in the portfolio). Corporate
# actions/listings change this rarely, not intraday, so one fetch per relay
# process lifetime is enough — no need to refetch per historical-data call.
_INSTRUMENT_MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
_instrument_master: list[dict] | None = None
_instrument_master_lock = asyncio.Lock()


async def _load_instrument_master() -> list[dict]:
    global _instrument_master
    if _instrument_master is not None:
        return _instrument_master
    async with _instrument_master_lock:
        if _instrument_master is not None:
            return _instrument_master
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(_INSTRUMENT_MASTER_URL)
            response.raise_for_status()
            _instrument_master = response.json()
        return _instrument_master


def _next_midnight_ist() -> datetime:
    # Angel One sessions expire at midnight IST regardless of activity
    # (PROJECT_BRIEF.md section 3), independent of when the login happened.
    now = datetime.now(IST)
    return (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)


class _PriceFeed(SmartWebSocketV2):
    """Thin subclass just to get `self`-bound callback hooks; all state below
    is specific to one subscribe_live_prices() call.
    """

    def __init__(
        self,
        *,
        auth_token: str,
        api_key: str,
        client_code: str,
        feed_token: str,
        on_tick: Callable,
        token_symbol_map: dict[tuple[int, str], str],
        correlation_id: str,
        on_connected: Callable[[], None],
    ):
        super().__init__(
            auth_token=auth_token,
            api_key=api_key,
            client_code=client_code,
            feed_token=feed_token,
            max_retry_attempt=0,  # we own reconnect/backoff ourselves, see _stream_with_backoff
        )
        self._on_tick = on_tick
        self._token_symbol_map = token_symbol_map
        self._correlation_id = correlation_id
        self._on_connected = on_connected
        self.token_list: list[dict] = []

    def on_open(self, wsapp):
        logger.info("Angel One price feed connected; subscribing to %d symbol(s)", len(self._token_symbol_map))
        self._on_connected()
        self.subscribe(self._correlation_id, self.LTP_MODE, self.token_list)

    def on_data(self, wsapp, data):
        symbol = self._token_symbol_map.get((data.get("exchange_type"), data.get("token")))
        if symbol is None:
            return
        raw_ltp = data.get("last_traded_price")
        if raw_ltp is None:
            return
        ts_ms = data.get("exchange_timestamp")
        timestamp = (
            datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()
            if ts_ms
            else datetime.now(timezone.utc).isoformat()
        )
        # Angel One's binary feed encodes price * 100 (paise) as an integer.
        tick = {"symbol": symbol, "ltp": raw_ltp / 100, "timestamp": timestamp}
        try:
            self._on_tick(tick)
        except Exception:
            logger.exception("on_tick callback raised for %s", symbol)

    def on_error(self, error_type, message):
        logger.warning("Angel One price feed error: %s: %s", error_type, message)

    def on_close(self, wsapp):
        logger.info("Angel One price feed connection closed")


class AngelOneAdapter(BrokerAdapter):
    def __init__(self):
        # symbol -> (exchangeType, instrument token), populated by get_holdings()
        # so subscribe_live_prices() can map the human-readable symbols the ABC
        # takes into what the WebSocket feed actually wants.
        self._instrument_cache: dict[str, tuple[int, str]] = {}

    async def login(self, credentials: dict) -> Session:
        api_key = credentials["api_key"]
        client_code = credentials["client_code"]
        pin = credentials["pin"]
        totp_secret = credentials["totp_secret"]

        try:
            totp = pyotp.TOTP(totp_secret).now()
        except Exception as exc:
            raise BrokerAuthError(f"Could not generate TOTP from ANGEL_ONE_TOTP_SECRET: {exc}") from exc

        client = SmartConnect(api_key=api_key)
        try:
            response = await asyncio.to_thread(client.generateSession, client_code, pin, totp)
        except SmartAPIException as exc:
            raise BrokerAuthError(f"Angel One login failed: {exc}") from exc
        except Exception as exc:
            raise BrokerAuthError(f"Angel One login request failed: {exc}") from exc

        if not response.get("status"):
            message = response.get("message", "Unknown error")
            error_code = response.get("errorcode", "")
            raise BrokerAuthError(f"Angel One login rejected: {message} (code: {error_code})")

        data = response["data"]
        return Session(
            client_code=data["clientcode"],
            auth_token=data["jwtToken"].removeprefix("Bearer "),
            refresh_token=data["refreshToken"],
            feed_token=data["feedToken"],
            expires_at=_next_midnight_ist(),
            extra={"api_key": api_key},
        )

    async def refresh_session(self, session: Session) -> Session:
        client = self._client_from_session(session)
        try:
            token_set = await asyncio.to_thread(client.renewAccessToken)
        except SmartAPIException as exc:
            raise BrokerAuthError(f"Angel One session refresh failed: {exc}") from exc
        except Exception as exc:
            raise BrokerAuthError(f"Angel One session refresh request failed: {exc}") from exc

        return Session(
            client_code=session.client_code,
            auth_token=token_set["jwtToken"],
            refresh_token=token_set["refreshToken"],
            feed_token=session.feed_token,
            expires_at=_next_midnight_ist(),
            extra=session.extra,
        )

    async def get_holdings(self, session: Session) -> list[Holding]:
        client = self._client_from_session(session)
        try:
            response = await asyncio.to_thread(client.holding)
        except SmartAPIException as exc:
            raise BrokerAPIError(f"Angel One get_holdings failed: {exc}") from exc
        except Exception as exc:
            raise BrokerAPIError(f"Angel One get_holdings request failed: {exc}") from exc

        if not response.get("status"):
            raise BrokerAPIError(f"Angel One get_holdings rejected: {response.get('message', 'Unknown error')}")

        raw_holdings = response.get("data") or []
        holdings = [self._normalize_holding(raw) for raw in raw_holdings]
        for raw in raw_holdings:
            self._cache_instrument_token(raw)
        return holdings

    async def place_order(self, session: Session, order: OrderRequest) -> OrderResult:
        raise NotImplementedError("place_order is not implemented yet — deferred by explicit product decision")

    async def get_order_status(self, session: Session, order_id: str) -> OrderStatus:
        raise NotImplementedError("get_order_status is not implemented yet — deferred by explicit product decision")

    async def get_historical_data(
        self, session: Session, symbol: str, interval: str, from_date: str, to_date: str
    ) -> list[Candle]:
        exchange, symboltoken = await self._resolve_symbol_token(symbol)
        client = self._client_from_session(session)
        params = {
            "exchange": exchange,
            "symboltoken": symboltoken,
            "interval": interval,
            "fromdate": from_date,
            "todate": to_date,
        }
        try:
            response = await asyncio.to_thread(client.getCandleData, params)
        except SmartAPIException as exc:
            raise BrokerAPIError(f"Angel One get_historical_data failed: {exc}") from exc
        except Exception as exc:
            raise BrokerAPIError(f"Angel One get_historical_data request failed: {exc}") from exc

        if not response.get("status"):
            raise BrokerAPIError(f"Angel One get_historical_data rejected: {response.get('message', 'Unknown error')}")

        raw_candles = response.get("data") or []
        return [
            Candle(
                date=str(row[0]),
                open=float(row[1]),
                high=float(row[2]),
                low=float(row[3]),
                close=float(row[4]),
                volume=float(row[5]),
            )
            for row in raw_candles
        ]

    async def _resolve_symbol_token(self, symbol: str) -> tuple[str, str]:
        # Reuse the holdings-derived cache when this symbol is already held —
        # avoids the instrument-master fetch entirely for the common case.
        cached = self._instrument_cache.get(symbol)
        if cached is not None:
            exchange_type, token = cached
            exchange = _REVERSE_EXCHANGE_TYPE_MAP.get(exchange_type)
            if exchange:
                return exchange, token

        # Fall back to Angel One's public instrument master for symbols never
        # held (e.g. a hypothetical backtest on a stock the user doesn't own).
        # Angel One only lists NSE/BSE instruments — a US-listed symbol like
        # TSLA or NVDA simply won't be found here, which is expected, not a bug.
        tradingsymbol = symbol if symbol.upper().endswith("-EQ") else f"{symbol.upper()}-EQ"
        master = await _load_instrument_master()
        for row in master:
            if row.get("exch_seg") == "NSE" and row.get("symbol") == tradingsymbol:
                return "NSE", str(row["token"])
        raise BrokerAPIError(
            f"Could not resolve '{symbol}' to an NSE/BSE instrument token — "
            "Angel One only covers NSE/BSE-listed symbols, not international exchanges."
        )

    def subscribe_live_prices(self, session: Session, symbols: list[str], on_tick: Callable) -> None:
        token_list, token_symbol_map = self._build_subscription(symbols)
        if not token_list:
            logger.warning(
                "subscribe_live_prices: no cached instrument tokens for %s; call get_holdings() first", symbols
            )
            return

        thread = threading.Thread(
            target=self._stream_with_backoff,
            args=(session, token_list, token_symbol_map, on_tick),
            name="angel-one-price-feed",
            daemon=True,
        )
        thread.start()

    def _client_from_session(self, session: Session) -> SmartConnect:
        return SmartConnect(
            api_key=session.extra.get("api_key"),
            access_token=session.auth_token,
            refresh_token=session.refresh_token,
            feed_token=session.feed_token,
        )

    def _normalize_holding(self, raw: dict) -> Holding:
        return Holding(
            symbol=raw["tradingsymbol"],
            exchange=raw["exchange"],
            isin=raw.get("isin") or None,
            quantity=float(raw.get("quantity") or 0),
            average_buy_price=float(raw.get("averageprice") or 0),
            last_traded_price=float(raw.get("ltp") or 0),
            previous_close=float(raw["close"]) if raw.get("close") is not None else None,
            pnl=float(raw["profitandloss"]) if raw.get("profitandloss") is not None else None,
            pnl_percent=float(raw["pnlpercentage"]) if raw.get("pnlpercentage") is not None else None,
        )

    def _cache_instrument_token(self, raw: dict) -> None:
        exchange_type = _EXCHANGE_TYPE_MAP.get(raw.get("exchange"))
        token = raw.get("symboltoken")
        if exchange_type is None or not token:
            logger.warning(
                "No WebSocket exchangeType mapping for exchange %r on symbol %r; live prices won't stream for it",
                raw.get("exchange"),
                raw.get("tradingsymbol"),
            )
            return
        self._instrument_cache[raw["tradingsymbol"]] = (exchange_type, str(token))

    def _build_subscription(
        self, symbols: list[str]
    ) -> tuple[list[dict], dict[tuple[int, str], str]]:
        grouped: dict[int, list[str]] = {}
        token_symbol_map: dict[tuple[int, str], str] = {}
        for symbol in symbols:
            entry = self._instrument_cache.get(symbol)
            if entry is None:
                logger.warning("No cached instrument token for symbol %r; skipping live price subscription", symbol)
                continue
            exchange_type, token = entry
            grouped.setdefault(exchange_type, []).append(token)
            token_symbol_map[(exchange_type, token)] = symbol
        token_list = [{"exchangeType": exchange_type, "tokens": tokens} for exchange_type, tokens in grouped.items()]
        return token_list, token_symbol_map

    def _stream_with_backoff(
        self,
        session: Session,
        token_list: list[dict],
        token_symbol_map: dict[tuple[int, str], str],
        on_tick: Callable,
    ) -> None:
        backoff = {"seconds": 1.0}
        max_backoff = 60.0

        def on_connected():
            backoff["seconds"] = 1.0

        while True:
            try:
                feed = _PriceFeed(
                    auth_token=f"Bearer {session.auth_token}",
                    api_key=session.extra.get("api_key"),
                    client_code=session.client_code,
                    feed_token=session.feed_token,
                    on_tick=on_tick,
                    token_symbol_map=token_symbol_map,
                    correlation_id="finagent",
                    on_connected=on_connected,
                )
                feed.token_list = token_list
                feed.connect()  # blocks (run_forever) until the connection closes
            except Exception:
                logger.exception("Angel One price feed crashed")
            wait = backoff["seconds"]
            logger.warning("Angel One price feed disconnected; retrying in %.0fs", wait)
            time.sleep(wait)
            backoff["seconds"] = min(wait * 2, max_backoff)
