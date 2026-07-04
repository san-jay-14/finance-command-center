import logging
from datetime import date, datetime, timezone

from supabase import Client

from app.broker.types import Holding
from app.latest_prices import upsert_latest_price
from app.supabase_client import get_client

logger = logging.getLogger(__name__)


def _get_or_create_user(client: Client) -> str:
    existing = client.table("users").select("id").limit(1).execute()
    if existing.data:
        return existing.data[0]["id"]
    created = client.table("users").insert({}).execute()
    return created.data[0]["id"]


def _get_or_create_broker_connection(client: Client, user_id: str, client_code: str) -> str:
    existing = (
        client.table("broker_connections")
        .select("id")
        .eq("user_id", user_id)
        .eq("broker_name", "angel_one")
        .eq("client_code", client_code)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]["id"]
    created = (
        client.table("broker_connections")
        .insert({"user_id": user_id, "broker_name": "angel_one", "client_code": client_code})
        .execute()
    )
    return created.data[0]["id"]


def _sync_one_holding(client: Client, user_id: str, broker_connection_id: str, holding: Holding) -> None:
    asset = (
        client.table("assets")
        .upsert(
            {
                "user_id": user_id,
                "broker_connection_id": broker_connection_id,
                "symbol": holding.symbol,
                # Angel One's holdings API doesn't give a separate display name,
                # only the trading symbol.
                "name": holding.symbol,
                "asset_class": "stock",
            },
            on_conflict="user_id,symbol,asset_class",
        )
        .execute()
    )
    asset_id = asset.data[0]["id"]

    # One lot per asset using the aggregate quantity/average price Angel One's
    # holdings API returns — it doesn't expose individual purchase lots. This
    # is a simplification to revisit when the tax engine (build-order step 8)
    # needs true per-purchase FIFO lots; buy_date below is only ever set once
    # (on first sync) since we have no real purchase date to update it to.
    existing_lot = client.table("lots").select("id").eq("asset_id", asset_id).limit(1).execute()
    if existing_lot.data:
        client.table("lots").update(
            {"quantity": holding.quantity, "buy_price": holding.average_buy_price}
        ).eq("asset_id", asset_id).execute()
    else:
        client.table("lots").insert(
            {
                "asset_id": asset_id,
                "quantity": holding.quantity,
                "buy_price": holding.average_buy_price,
                "buy_date": date.today().isoformat(),
            }
        ).execute()

    # Seed/refresh latest_prices from the REST holdings call's last_traded_price
    # so there's a usable price even outside market hours, before any
    # WebSocket ticks arrive. Live ticks overwrite this with fresher data.
    upsert_latest_price(
        {
            "symbol": holding.symbol,
            "ltp": holding.last_traded_price,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )


def sync_holdings(client_code: str, holdings: list[Holding]) -> int:
    """Upsert Angel One holdings into `assets` + `lots`. Idempotent: relies on
    the assets(user_id,symbol,asset_class) and lots(asset_id) unique
    constraints added in the holdings_sync_and_prices migration.
    """
    client = get_client()
    user_id = _get_or_create_user(client)
    broker_connection_id = _get_or_create_broker_connection(client, user_id, client_code)

    synced = 0
    for holding in holdings:
        try:
            _sync_one_holding(client, user_id, broker_connection_id, holding)
            synced += 1
        except Exception:
            logger.exception("Failed to sync holding %s", holding.symbol)

    logger.info("Synced %d/%d holding(s) into assets/lots", synced, len(holdings))
    return synced
