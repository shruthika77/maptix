# Deploying MapSys (Maptix 3D) with Zoho Catalyst Authentication

## Architecture Overview

```
┌─────────────────────┐     HTTPS      ┌──────────────────────────────┐
│  Next.js Frontend   │ ─────────────▶ │  Catalyst AppSail (Flask)    │
│  (Static / Vercel / │                │  catalyst-backend/appsail/   │
│   Catalyst Hosting) │                │                              │
└─────────────────────┘                │  ┌──────────────────────┐   │
                                       │  │ Catalyst Auth        │   │
    User logs in via                   │  │ (built-in, managed)  │   │
    Catalyst Auth ──────────────────▶  │  │ ► signup/login       │   │
                                       │  │ ► token validation   │   │
    Token sent in                      │  │ ► password reset     │   │
    Authorization header               │  └──────────────────────┘   │
                                       │                              │
                                       │  ┌──────────────────────┐   │
                                       │  │ Catalyst Data Store  │   │
                                       │  │ (managed SQL tables) │   │
                                       │  │ ► Users, Projects    │   │
                                       │  │ ► Files, Jobs, Models│   │
                                       │  └──────────────────────┘   │
                                       │                              │
                                       │  ┌──────────────────────┐   │
                                       │  │ Catalyst File Store  │   │
                                       │  │ (cloud file storage) │   │
                                       │  │ ► floor plan images  │   │
                                       │  │ ► 3D model exports   │   │
                                       │  └──────────────────────┘   │
                                       │                              │
                                       │  ┌──────────────────────┐   │
                                       │  │ Cloudflare Workers AI│   │
                                       │  │ (Meta Llama 3)       │   │
                                       │  │ ► floor plan gen     │   │
                                       │  └──────────────────────┘   │
                                       └──────────────────────────────┘
```

## What Catalyst Authentication Replaces

| Before (JWT)                     | After (Catalyst Auth)                          |
|----------------------------------|------------------------------------------------|
| Hardcoded JWT_SECRET             | Catalyst manages token signing                 |
| Manual password hashing (bcrypt) | Catalyst handles password storage               |
| Custom `/auth/register` endpoint | Catalyst's user management API                  |
| Custom `/auth/login` endpoint    | Catalyst's sign-in API                          |
| Token expiration management      | Catalyst auto-manages token lifecycle           |
| Password reset — not implemented | Catalyst provides built-in password reset        |
| Email verification — not built   | Catalyst can enforce email verification          |

## Prerequisites

1. **Zoho Account** — [accounts.zoho.com](https://accounts.zoho.com)
2. **Catalyst Project** — [console.catalyst.zoho.com](https://console.catalyst.zoho.com)
3. **Catalyst CLI** — `npm install -g zcatalyst-cli`
4. **Cloudflare Account** — for Workers AI (Meta Llama 3) API

## Step-by-Step Deployment

### 1. Install & Authenticate CLI

```bash
npm install -g zcatalyst-cli
catalyst login
```

### 2. Link the Project

```bash
cd /path/to/MapSys/catalyst-backend
catalyst init
# Select your existing project "maptix-3d"
```

### 3. Create Data Store Tables

In **Catalyst Console → Data Store**, create these tables:

#### Users
| Column           | Type | Mandatory | Unique | Default |
|------------------|------|-----------|--------|---------|
| email            | text | ✅        | ✅     |         |
| hashed_password  | text | ✅        |        |         |
| name             | text | ✅        |        |         |
| is_active        | text |           |        | "true"  |
| created_at       | text |           |        |         |
| updated_at       | text |           |        |         |

#### Projects
| Column        | Type | Mandatory | Default      |
|---------------|------|-----------|--------------|
| owner_id      | text | ✅        |              |
| name          | text | ✅        |              |
| description   | text |           |              |
| building_type | text |           | "residential"|
| status        | text |           | "draft"      |
| created_at    | text |           |              |
| updated_at    | text |           |              |

#### ProjectFiles
| Column            | Type | Mandatory | Default    |
|-------------------|------|-----------|------------|
| project_id        | text | ✅        |            |
| original_filename | text | ✅        |            |
| stored_filename   | text |           |            |
| mime_type         | text |           |            |
| size_bytes        | text |           |            |
| file_id           | text |           |            |
| status            | text |           | "uploaded" |
| uploaded_at       | text |           |            |

#### ProcessingJobs
| Column        | Type | Mandatory | Default  |
|---------------|------|-----------|----------|
| project_id    | text | ✅        |          |
| status        | text |           | "queued" |
| progress      | text |           | "0"      |
| current_stage | text |           |          |
| stages_json   | text |           |          |
| error         | text |           |          |
| created_at    | text |           |          |
| started_at    | text |           |          |
| completed_at  | text |           |          |

#### SpatialModels
| Column             | Type | Mandatory | Unique | Default |
|--------------------|------|-----------|--------|---------|
| project_id         | text | ✅        | ✅     |         |
| version            | text |           |        | "1"     |
| model_data_json    | text |           |        |         |
| wall_count         | text |           |        | "0"     |
| room_count         | text |           |        | "0"     |
| door_count         | text |           |        | "0"     |
| window_count       | text |           |        | "0"     |
| total_area_sqm     | text |           |        | "0"     |
| floor_count        | text |           |        | "1"     |
| average_confidence | text |           |        | "0"     |
| model_3d_path      | text |           |        |         |
| created_at         | text |           |        |         |
| updated_at         | text |           |        |         |

### 4. Create File Store Folders

In **Catalyst Console → File Store**:
- `maptix-uploads` — uploaded floor plan images
- `models` — generated 3D models and exports

### 5. Enable Authentication

In **Catalyst Console → Authentication → Settings**:
1. Toggle authentication **ON**
2. Set **Sign-up URL** → your frontend URL
3. Set **Login URL** → your frontend URL
4. Add allowed redirect origins

### 6. Set Environment Variables

In **Catalyst Console → AppSail → Environment Variables**:

```env
CF_ACCOUNT_ID=<your-cloudflare-account-id>
CF_API_TOKEN=<your-cloudflare-api-token>
FRONTEND_ORIGIN=https://your-app.catalyst.zoho.com
```

### 7. Deploy

```bash
cd /path/to/MapSys/catalyst-backend
catalyst deploy
```

### 8. Configure Frontend

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=https://maptix-3d-XXXXX.catalyst.zoho.com
NEXT_PUBLIC_AUTH_MODE=catalyst
NEXT_PUBLIC_CATALYST_PROJECT_ID=36873000000031001
```

Build and deploy the frontend:

```bash
cd frontend
npm run build
# Deploy to Vercel, Catalyst Hosting, or any static host
```

## Auth Flow Diagram

```
┌──────────┐   1. Open app        ┌──────────────┐
│  Browser  │ ──────────────────▶ │   Frontend    │
│           │                     │   (Next.js)   │
│           │   2. Click "Login"  │               │
│           │ ◀────────────────── │               │
│           │                     └──────────────┘
│           │
│           │   3. Redirect to Catalyst login page
│           │ ──────────────────▶ ┌──────────────┐
│           │                     │  Catalyst     │
│           │   4. Enter email    │  Auth Page    │
│           │      + password     │  (hosted by   │
│           │                     │   Zoho)       │
│           │   5. Catalyst       │               │
│           │      validates &    └──────────────┘
│           │      issues token          │
│           │                            │
│           │   6. Redirect back         │
│           │      with token cookie ◀───┘
│           │
│           │   7. Frontend stores token
│           │      in auth store
│           │
│           │   8. API calls include
│           │      Authorization: Bearer <token>
│           │ ──────────────────▶ ┌──────────────┐
│           │                     │  AppSail     │
│           │   9. Backend calls  │  (Flask)     │
│           │      catalyst_app   │              │
│           │      .authentication│              │
│           │      .get_current_  │              │
│           │      user()         │              │
│           │                     │              │
│           │  10. Returns user   │              │
│           │      data           │              │
│           │ ◀────────────────── │              │
└──────────┘                     └──────────────┘
```

## Local Development (JWT Fallback)

For local development without Catalyst infrastructure:

```bash
# Backend — runs with JWT auth (default)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend — proxies to localhost:8000
cd frontend
npm run dev
```

The backend defaults to `AUTH_PROVIDER=jwt` and auto-generates a random JWT secret. No Catalyst setup needed for local work.

## Switching Between Auth Modes

| Setting                        | JWT (Local Dev)        | Catalyst (Production)              |
|-------------------------------|------------------------|------------------------------------|
| `AUTH_PROVIDER`               | `jwt`                  | `catalyst`                         |
| `CATALYST_PROJECT_ID`         | (not needed)           | `36873000000031001`                |
| `JWT_SECRET`                  | auto-generated         | (not needed)                       |
| `NEXT_PUBLIC_AUTH_MODE`       | `jwt`                  | `catalyst`                         |
| Backend                       | `backend/` (FastAPI)   | `catalyst-backend/appsail/` (Flask)|

## Troubleshooting

| Issue | Solution |
|-------|---------|
| `zcatalyst_sdk` import error | Run `pip install zcatalyst-sdk` or deploy on Catalyst where it's pre-installed |
| "Catalyst token validation failed" | Ensure Authentication is enabled in Catalyst Console |
| CORS errors | Add your frontend origin to Catalyst Console → Authentication → Settings |
| "Data Store table not found" | Create the tables manually in Catalyst Console → Data Store |
| Token expired after redirect | Catalyst tokens have configurable TTL; check Authentication settings |
| Local dev can't reach Catalyst | Use `AUTH_PROVIDER=jwt` for local development |
