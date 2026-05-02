from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()  # reads .env from repo root before any os.getenv calls
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html

from .auth import require_api_key
from .db.database import init_db
from .routes import admin, analyze, auth, queue


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="ALE API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to extension origin in prod
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(analyze.router)
app.include_router(queue.router)
app.include_router(admin.router, dependencies=[Depends(require_api_key)])


def _require_localhost(request: Request):
    if request.client and request.client.host not in ("127.0.0.1", "::1"):
        raise HTTPException(status_code=404)


@app.get("/docs", include_in_schema=False)
def docs(request: Request):
    _require_localhost(request)
    return get_swagger_ui_html(openapi_url="/openapi.json", title="ALE API")


@app.get("/redoc", include_in_schema=False)
def redoc(request: Request):
    _require_localhost(request)
    return get_redoc_html(openapi_url="/openapi.json", title="ALE API")


@app.get("/openapi.json", include_in_schema=False)
def openapi(request: Request):
    _require_localhost(request)
    return app.openapi()


@app.get("/")
def root():
    return {"name": "ALE API", "status": "pouring"}
