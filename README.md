# AyurTrust Chain

AI + Blockchain based Ayurvedic herb traceability platform.

This repository contains:
- `frontend/` - React + Vite farmer/manufacturer/consumer web app
- `backend/` - FastAPI backend with Firebase auth, MongoDB, AI validation, blockchain anchoring, and QR verification

---

## Features

- Firebase authentication and role-based access
- Herb batch upload with photo validation
- Plant/non-plant filtering (rejects non-botanical photos)
- Herb classification (local ML model if available)
- Optional image quality scoring model
- Voice input: Kannada -> English translation + structured extraction
- Geo validation and fraud checks
- Trust score + trust grade generation
- Blockchain hash anchoring (Polygon Amoy style transaction flow)
- QR generation and public batch verification page
- Manufacturer stage tracking and medicine creation from herb batches

---

## Project Structure

```text
Patrixx/
├─ backend/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ database.py
│  │  ├─ dependencies/
│  │  ├─ routes/
│  │  │  ├─ batch_routes.py
│  │  │  └─ voice_routes.py
│  │  ├─ services/
│  │  │  ├─ ai_service.py
│  │  │  ├─ plant_classifier_service.py
│  │  │  ├─ herb_model_service.py
│  │  │  ├─ herb_quality_model_service.py
│  │  │  ├─ blockchain_service.py
│  │  │  └─ ...
│  │  ├─ ml/
│  │  │  ├─ herb_model/
│  │  │  └─ herb_quality_model/
│  ├─ requirements.txt
│  └─ .env.example
├─ frontend/
│  ├─ src/
│  ├─ vite.config.ts
│  └─ package.json
└─ README.md
```

---

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind + shadcn/radix ecosystem
- Firebase JS SDK
- Recharts

### Backend
- FastAPI
- PyMongo
- Firebase Admin SDK
- TensorFlow/Keras (local model inference)
- Google Generative AI (plant validation fallback path)
- Deep Translator (Kannada -> English support)
- Web3.py
- qrcode + Pillow

---

## Backend Setup (Local)

### 1) Prerequisites
- Python 3.10 or 3.11 recommended
- MongoDB Atlas connection string

### 2) Create venv and install dependencies

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

### 3) Create `backend/.env`

Use `backend/.env.example` as reference.

Example:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/ayurtrust?retryWrites=true&w=majority
GEMINI_API_KEY=your_gemini_key
PUBLIC_BASE_URL=http://127.0.0.1:8000

# Optional (if blockchain writes enabled)
RPC_URL=
PRIVATE_KEY=
WALLET_ADDRESS=

# Optional Firebase method if you don't use JSON env
FIREBASE_CREDENTIALS_PATH=app/firebase/serviceAccountKey.json
```

### 4) Run backend

```powershell
uvicorn app.main:app --reload --port 8000
```

Backend should open at:
- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/docs`

---

## Frontend Setup (Local)

### 1) Install packages

```powershell
cd frontend
npm install
```

### 2) Frontend env

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### 3) Run frontend

```powershell
npm run dev
```

Default UI:
- `http://localhost:8080`

---

## ML Models

### Herb classifier model
Path:
- `backend/app/ml/herb_model/herb_model.h5`

Used for:
- herb label prediction (Aloevera/Betel/Brahmi/Neem/Tulsi/Mint based on model classes)

### Image quality model
Path:
- `backend/app/ml/herb_quality_model/herb_quality_model.h5`

Used for:
- classify image quality as `good` or `bad`

Notes:
- Model usage is fail-safe where possible
- If model unavailable, backend falls back to non-model logic

---

## Core Flow (High Level)

1. User logs in (Firebase token)
2. Farmer uploads photos + herb details
3. Backend validates image as plant/herb
4. Backend runs herb model (if available)
5. Trust signals computed:
   - AI quality
   - geo validation
   - fraud score
6. Trust score + grade generated
7. Hash generated and blockchain tx attempted
8. Batch saved in MongoDB
9. QR code generated for public verification
10. Manufacturer updates stage / requests herbs / creates medicine

---

## Important API Areas

### Batch routes
File: `backend/app/routes/batch_routes.py`

- `POST /batch/upload`
- `GET /batch/`
- `GET /batch/{batch_id}`
- `GET /batch/public/{batch_id}`
- `POST /batch/update-stage/{batch_id}`
- `POST /create-medicine` (public router path in current codebase)
- request management endpoints and side-effect reporting

### Voice routes
File: `backend/app/routes/voice_routes.py`

- `POST /voice/translate`
- `POST /voice/voice-input`
- `POST /voice/auto-batch`

---

## Deployment Guide

## Backend on Render

1. Create a new **Web Service** from GitHub repo
2. Configure:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Add environment variables:
   - `MONGODB_URI`
   - `GEMINI_API_KEY`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (preferred on Render)
   - `PYTHON_VERSION=3.10.11` (recommended for TensorFlow compatibility)
   - Optional blockchain vars (`RPC_URL`, `PRIVATE_KEY`, `WALLET_ADDRESS`)
4. Ensure Atlas Network Access allows Render traffic

## Frontend on Vercel

1. Import repository
2. Set Root Directory to `frontend`
3. Add environment variable:
   - `VITE_API_BASE_URL=https://hack-dominators.onrender.com`
4. Deploy

---

## MongoDB Atlas Notes

- App reads env in this order:
  1. `MONGODB_URI`
  2. `MONGO_URI`
  3. `DATABASE_URL`
- Current backend DB name in code:
  - `ayurtrust` (from `client["ayurtrust"]`)
- Prefer only one DB env var (`MONGODB_URI`) to avoid confusion

---

## Firebase Notes

Auth verification is done in backend dependency.

Supported setup:
- `FIREBASE_SERVICE_ACCOUNT_JSON` env (recommended for deploy)
- OR local file path via `FIREBASE_CREDENTIALS_PATH`

---

## Troubleshooting

### Render build fails on TensorFlow
- Set `PYTHON_VERSION=3.10.11` in Render env

### Mongo auth error (`bad auth`, code 8000)
- Verify Atlas DB user/password
- URL-encode password special chars
- Check `MONGODB_URI` spelling
- Ensure Atlas Network Access allows host IPs

### Voice translation not filling form
- Confirm backend `/voice/translate` works in `/docs`
- Ensure `deep-translator` installed
- Check frontend `VITE_API_BASE_URL` points to live backend

### Stage update 500
- Ensure latest backend code is deployed (shared stage update handler fix)
- Verify user role includes manufacturer

### Upload rejects valid herb photos
- Check plant classifier fallback / Gemini key
- Confirm model files are present and compatible

---

## Security Recommendations

- Do not commit `.env` or service account files with secrets
- Rotate leaked DB/API keys immediately
- Use least-privilege roles for DB users
- Restrict CORS origins in production to your deployed frontend domains

---

## Useful Commands

### Backend
```powershell
cd backend
.\venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

### Frontend
```powershell
cd frontend
npm install
npm run dev
```

### Quick Mongo ping (local backend env)
```powershell
cd backend
.\venv\Scripts\python.exe -c "from app.database import client; client.admin.command('ping'); print('Mongo ping OK')"
```

---

## Current Live Backend

- Render: https://hack-dominators.onrender.com

