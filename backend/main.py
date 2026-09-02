from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os

load_dotenv()

from routers import upload, profile, loan_chat, risk_and_comparison
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "*")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(upload.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(loan_chat.router, prefix="/api")
app.include_router(risk_and_comparison.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
