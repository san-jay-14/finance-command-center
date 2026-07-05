from app.supabase_client import get_client


def upsert_latest_price(tick: dict) -> None:
    client = get_client()
    row = {"symbol": tick["symbol"], "ltp": tick["ltp"], "ticked_at": tick["timestamp"]}
    # Only the daily holdings sync knows prev_close (from Angel One's REST
    # holdings response); live WebSocket ticks omit it and must not clear it.
    if tick.get("prev_close") is not None:
        row["prev_close"] = tick["prev_close"]
    client.table("latest_prices").upsert(row, on_conflict="symbol").execute()
