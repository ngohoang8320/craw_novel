from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.routers import capture_ingest, captures, toc
from app.schemas import HealthResponse

app = FastAPI(title="Bilinovel Crawler API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(toc.router)
app.include_router(captures.router)
app.include_router(capture_ingest.router)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")
