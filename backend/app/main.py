import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from fastapi.staticfiles import StaticFiles

# 📦 ROUTES
from app.routes import batch_routes
from app.routes import voice_routes   # ✅ ADD THIS

# 🔐 Security (for Swagger Authorize button)
security = HTTPBearer()

app = FastAPI(
    title="AyurTrust Backend",
    description="AI + Blockchain Based Ayurvedic Traceability System",
    version="1.0.0"
)

# 🌐 Allow frontend app origins (Vite dev ports + localhost variants)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://localhost:8081",
        "http://localhost:8082",
        "http://localhost:8083",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:8081",
        "http://127.0.0.1:8082",
        "http://127.0.0.1:8083",
        "https://ayur-trust.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔗 REGISTER ROUTES
app.include_router(batch_routes.router)
app.include_router(batch_routes.public_router)
app.include_router(voice_routes.router)   # ✅ ADD THIS

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploaded_photos"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="api-uploads")
QR_DIR = Path(__file__).resolve().parents[1] / "qr_codes"
QR_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/qr_codes", StaticFiles(directory=str(QR_DIR)), name="qr-codes")
app.mount("/api/qr_codes", StaticFiles(directory=str(QR_DIR)), name="api-qr-codes")


@app.on_event("startup")
def _warn_mongo_on_render():
    if not os.environ.get("RENDER"):
        return
    uri = (os.environ.get("MONGODB_URI") or os.environ.get("DATABASE_URL") or "").strip()
    if not uri or "localhost" in uri or "127.0.0.1" in uri:
        logging.warning(
            "MONGODB_URI is missing or still points to localhost. "
            "Set MONGODB_URI in Render → Environment to your MongoDB Atlas URI, then redeploy."
        )


# 🟢 HOME ROUTE
@app.get("/")
def home():
    return {
        "message": "AyurTrust Backend Running Successfully 🚀",
        "features": [
            "Firebase Authentication",
            "Role-Based Access",
            "AI Quality Analysis",
            "Geo Validation",
            "Fraud Detection",
            "Blockchain Storage",
            "QR Verification",
            "Voice Input (Kannada → English)"
        ]
    }