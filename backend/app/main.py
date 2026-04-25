from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer

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
app.include_router(voice_routes.router)   # ✅ ADD THIS


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