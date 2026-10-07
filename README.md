# Signal Clone

A functional clone of the Signal messaging app (Scaler SDE Fullstack assignment). Encryption is mocked.
The full README (architecture, schema, API, test logins) comes in Phase 7. `CLAUDE.md` is the project spec.

## Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind, deployed on Vercel
- **Backend:** Python 3.12, FastAPI, deployed on Render (SQLAlchemy + SQLite from Phase 1)

## Run locally

Backend (http://localhost:8000):

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
pytest -q                     # tests
```

Frontend (http://localhost:3000):

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000/status for the connectivity check (REST health + WebSocket echo).

## Test logins

The backend seeds demo users, chats and groups on boot when the database is empty
(delete `backend/signal.db` locally to reseed). OTP is mocked: the code is always **123456**.

| User | Phone |
|---|---|
| Priya Sharma (main demo user, group admin) | +91 98765 43210 |
| Rahul Verma | +91 98123 45678 |
| Ananya Iyer | +91 98989 89898 |

Open two browsers (or a normal and a private window) and log in as different users.
