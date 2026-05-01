from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()  # reads .env from repo root before any os.getenv calls
from fastapi.middleware.cors import CORSMiddleware

from .db.database import init_db
from .routes import admin, analyze, queue


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="ALE API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to extension origin in prod
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(queue.router)
app.include_router(admin.router)


@app.get("/")
def root():
    return {"name": "ALE API", "status": "pouring"}
