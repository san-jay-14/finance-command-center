from datetime import datetime, timedelta

from app.supabase_client import get_client


def get_cached_range(symbol: str, interval: str, from_date: str, to_date: str) -> list[dict]:
    client = get_client()
    response = (
        client.table("historical_candles")
        .select("*")
        .eq("symbol", symbol)
        .eq("interval", interval)
        .gte("candle_date", from_date)
        .lte("candle_date", to_date)
        .order("candle_date")
        .execute()
    )
    return response.data or []


# Trading holidays/weekends mean we can't know the exact expected candle count
# without a market calendar — a few days' slack on each edge is enough to
# tell "fully cached" apart from "partially cached" without one.
_EDGE_SLACK_DAYS = 4


def covers_range(cached_rows: list[dict], from_date: str, to_date: str) -> bool:
    if not cached_rows:
        return False
    dates = sorted(row["candle_date"] for row in cached_rows)
    earliest = datetime.strptime(dates[0], "%Y-%m-%d").date()
    latest = datetime.strptime(dates[-1], "%Y-%m-%d").date()
    requested_from = datetime.strptime(from_date, "%Y-%m-%d").date()
    requested_to = datetime.strptime(to_date, "%Y-%m-%d").date()
    return (
        earliest <= requested_from + timedelta(days=_EDGE_SLACK_DAYS)
        and latest >= requested_to - timedelta(days=_EDGE_SLACK_DAYS)
    )


def upsert_candles(symbol: str, interval: str, candles: list) -> None:
    if not candles:
        return
    client = get_client()
    rows = [
        {
            "symbol": symbol,
            "interval": interval,
            "candle_date": c.date[:10],
            "open": c.open,
            "high": c.high,
            "low": c.low,
            "close": c.close,
            "volume": c.volume,
        }
        for c in candles
    ]
    client.table("historical_candles").upsert(rows, on_conflict="symbol,interval,candle_date").execute()
