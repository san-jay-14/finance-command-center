"""
Standalone diagnostic script: subscribes to the "price-ticks" Supabase
Realtime broadcast channel and prints every tick that arrives, to confirm
the relay's live price feed is actually reaching Supabase.

Run from relay-service/, with the venv active:
    venv/Scripts/python.exe scripts/listen_ticks.py     (Windows)
    venv/bin/python scripts/listen_ticks.py              (macOS/Linux)

Uses SUPABASE_SERVICE_KEY from .env for simplicity since this is a
local-only diagnostic tool, not something shipped to a browser — a real
frontend client would subscribe with the public anon/publishable key
instead.
"""

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from realtime import AsyncRealtimeClient

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
TOPIC = "price-ticks"


async def main():
    client = AsyncRealtimeClient(f"{SUPABASE_URL}/realtime/v1", SUPABASE_KEY)
    await client.connect()

    channel = client.channel(TOPIC)
    channel.on_broadcast("tick", lambda payload: print(payload))
    await channel.subscribe()

    print(f"Listening for ticks on '{TOPIC}'... Ctrl+C to stop.")
    await asyncio.Event().wait()  # connect() already started the background listen task; just stay alive


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
