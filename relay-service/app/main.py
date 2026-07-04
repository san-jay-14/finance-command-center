from fastapi import FastAPI

app = FastAPI(title="Finagent Relay Service")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
