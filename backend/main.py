from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os

load_dotenv()

from routers import upload, profile, loan_chat, risk_and_comparison, financial
from db.database import engine, Base
from services.embedder import get_model
from services.reranker import get_reranker

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_model()
    get_reranker()
    yield


app = FastAPI(title="LoanLens API", lifespan=lifespan)

allowed_origins_env = os.getenv("FRONTEND_URL", "http://localhost:3000,http://localhost:3001")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
for origin in ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]:
    if origin not in allowed_origins:
        allowed_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(upload.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(loan_chat.router, prefix="/api")
app.include_router(risk_and_comparison.router, prefix="/api")
app.include_router(financial.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
