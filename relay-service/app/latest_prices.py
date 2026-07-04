from app.supabase_client import get_client


def upsert_latest_price(tick: dict) -> None:
    client = get_client()
    client.table("latest_prices").upsert(
        {"symbol": tick["symbol"], "ltp": tick["ltp"], "ticked_at": tick["timestamp"]},
        on_conflict="symbol",
    ).execute()
