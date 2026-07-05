from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class Session:
    """Broker-agnostic session state. `extra` holds whatever internal detail a
    given adapter needs to rebuild an authenticated client (e.g. Angel One's
    api_key) without leaking broker-specific fields into the shared shape.
    """

    client_code: str
    auth_token: str
    refresh_token: str
    feed_token: str
    expires_at: datetime
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class Holding:
    symbol: str
    exchange: str
    isin: str | None
    quantity: float
    average_buy_price: float
    last_traded_price: float
    previous_close: float | None
    pnl: float | None
    pnl_percent: float | None


@dataclass
class OrderRequest:
    symbol: str
    exchange: str
    transaction_type: str  # 'buy' | 'sell'
    quantity: int
    order_type: str  # 'market' | 'limit'
    price: float | None = None
    product_type: str = "DELIVERY"


@dataclass
class OrderResult:
    order_id: str
    status: str
    raw: dict[str, Any]


@dataclass
class OrderStatus:
    order_id: str
    status: str
    raw: dict[str, Any]


@dataclass
class Candle:
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float
