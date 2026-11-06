# Job Tracker

A modern job application portal built with React 18 + FastAPI.

## Tech Stack

### Frontend
- React 18 + TypeScript + Vite
- Tailwind CSS with indigo/violet/teal/rose color scheme
- Zustand for state management
- Axios for API calls

### Backend
- FastAPI with async SQLAlchemy
- HTTP-only cookies for auth
- SQLite (dev) / PostgreSQL (prod)
- JWT + TOTP authentication

## Project Structure

```
job_production/
├── backend/
│   ├── __init__.py       # FastAPI app with routes, middleware
│   ├── main.py           # Entry point (uvicorn)
│   ├── database.py       # Async SQLAlchemy configuration
│   ├── models.py         # SQLAlchemy models
│   ├── schemas.py        # Pydantic schemas
│   ├── auth.py           # JWT + TOTP authentication
│   ├── requirements.txt  # Python dependencies
│   ├── .env              # Environment configuration
│   └── app/
│       ├── __init__.py
│       ├── crud.py       # Database operations
│       └── api/v1/
│           ├── __init__.py
│           ├── auth.py   # Auth endpoints
│           ├── jobs.py   # Job CRUD endpoints
│           └── applications.py  # Application endpoints
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts    # Vite config with proxy to port 8886
    ├── tailwind.config.ts # Colors: indigo/violet/teal/rose
    ├── tsconfig.json
    ├── tailwind.css
    ├── main.tsx          # React entry
    ├── App.tsx           # Router with protected routes
    ├── src/
    │   ├── api/
    │   │   └── client.ts # Axios client with interceptors
    │   ├── components/
    │   │   ├── Layout.tsx
    │   │   ├── ProtectedRoute.tsx
    │   │   └── AdminRoute.tsx
    │   ├── pages/
    │   │   ├── Dashboard.tsx
    │   │   ├── JobsPage.tsx
    │   │   ├── JobDetailPage.tsx
    │   │   ├── ApplicationsPage.tsx
    │   │   ├── SettingsPage.tsx
    │   │   ├── LoginPage.tsx
    │   │   ├── SignupPage.tsx
    │   │   └── AdminDashboard.tsx
    │   ├── stores/
    │   │   └── authStore.ts  # Zustand auth store
    │   └── types/index.ts    # TypeScript interfaces
```

## Development

### Backend
```bash
cd job_production/backend
pip install -r requirements.txt
python main.py
# or: uvicorn __init__:app --reload --port 8886
```

### Frontend
```bash
cd job_production/frontend
npm install
npm run dev
```

## Deployment

The app is configured for Vercel deployment with the backend API running on port 8886.