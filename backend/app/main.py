import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request

from app.core.config import settings
from app.core.database import Base, engine, init_extensions
from app.services.storage import UPLOAD_DIR
from app.models import *  # noqa: F401,F403  (register models)

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_extensions()
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Family ID Platform", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

from app.routers import auth, families  # noqa: E402

app.include_router(auth.router, prefix="/api")
app.include_router(families.router, prefix="/api")

for _name in ("documents", "verification", "life_events", "schemes", "applications", "benefits",
              "grievances", "notifications", "dashboard", "admin"):
    try:
        _mod = __import__(f"app.routers.{_name}", fromlist=["router"])
        app.include_router(_mod.router, prefix="/api")
        for extra in getattr(_mod, "extra_routers", []):
            app.include_router(extra, prefix="/api")
    except ModuleNotFoundError as exc:  # router not written yet
        logging.getLogger("familyid").warning("Router %s not loaded: %s", _name, exc)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Ensure exception details (which may contain dates, UUIDs, Decimals from service code) are always JSON-safe."""
    return JSONResponse(status_code=exc.status_code, content={"detail": jsonable_encoder(exc.detail)}, headers=exc.headers)


@app.get("/api/health")
def health():
    return {"status": "ok", "cloudinary": settings.cloudinary_enabled, "smtp": settings.smtp_enabled, "dev_mode": settings.DEV_MODE}
