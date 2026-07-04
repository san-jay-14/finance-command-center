import logging

import httpx

logger = logging.getLogger(__name__)


def broadcast(supabase_url: str, service_key: str, topic: str, event: str, payload: dict) -> None:
    """Send a Realtime broadcast message via Supabase's server-side REST
    endpoint (POST /realtime/v1/api/broadcast), rather than supabase-py's
    Client.channel(): the installed supabase-py/realtime version's
    synchronous channel (SyncRealtimeClient/SyncRealtimeChannel) has no
    connect()/subscribe()/send() implemented yet, only the async client does.
    This REST endpoint delivers to the same channel/topic either way.
    """
    url = f"{supabase_url}/realtime/v1/api/broadcast"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    body = {"messages": [{"topic": topic, "event": event, "payload": payload}]}
    response = httpx.post(url, headers=headers, json=body, timeout=5.0)
    response.raise_for_status()
