# ALE — Actual Life Extension

A browser extension and web portal for detecting synthetic and AI-generated video content, combining automated machine-learning analysis with a human notarization layer.

---

## How It Works

ALE operates in two tiers:

**AI-ALE** — When you visit a video page on a supported platform, the extension injects a bottle cap icon onto the video player. Clicking it sends the URL to the ALE API, which runs the content through [Hive AI's](https://thehive.ai/) deepfake and AI-generation detection model. Results return within seconds: a reality score, signal breakdown (AI-generated, deepfake visual, AI-generated audio), and a label from *Pure ALE* to *Skunked*.

**Pro-ALE (The Brewery)** — Any scan can be escalated to a human notary for manual review. Flagged items enter a queue visible in The Brewery dashboard, where a reviewer can inspect the AI signals, add written notes, and either certify the content as genuine or reject it as synthetic. Certified items are tracked against the original scan record.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│               Chrome Extension (MV3)            │
│                                                 │
│  content.js   ─── injects bottle cap onto      │
│                   video player                  │
│                                                 │
│  service_worker.js ─── holds session UUID,     │
│                        proxies API calls        │
│                                                 │
│  popup.js     ─── manual analyze UI,           │
│                   result cache                  │
└───────────────────────┬─────────────────────────┘
                        │ HTTP (REST)
                        ▼
┌─────────────────────────────────────────────────┐
│               FastAPI Backend                   │
│                                                 │
│  POST /analyze  ─── calls Hive, caches result  │
│  POST /queue    ─── adds item to notary queue  │
│  PATCH /queue/{id} ── update status/notes      │
└──────────┬─────────────────────────────────────┘
           │ PostgreSQL (Neon)
           ▼
┌─────────────────────────────────────────────────┐
│               Next.js Portal                    │
│               "The Brewery"                     │
│                                                 │
│  /brewery      ─── queue + scan history         │
│  /brewery/review/[id] ─── per-item review UI   │
│                                                 │
│  Auth: Google OAuth (NextAuth v4)               │
└─────────────────────────────────────────────────┘
```

---

## Reality Score

The reality score is calculated from Hive's detection signals:

```
reality_score = (1 - max(ai_generated, deepfake)) × 100
```

| Score   | Label       | Meaning                                   |
|---------|-------------|-------------------------------------------|
| ≥ 85    | Pure ALE    | Strong indicators of authentic content    |
| 60–84   | Mixed Pour  | Inconclusive — may warrant closer review  |
| 30–59   | Flat        | Likely synthetic or manipulated           |
| < 30    | Skunked     | High confidence of AI generation/deepfake |

---

## Supported Platforms

The extension injects on:

- YouTube
- X (Twitter)
- TikTok
- Vimeo
- Instagram
- Facebook
- Reddit

Any other site with a `<video>` element will also receive the bottle cap via a generic fallback.

---

## Project Structure

```
ale/
├── extension/                 # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background/
│   │   └── service_worker.js  # Session ID management, API proxy
│   ├── content/
│   │   ├── content.js         # Bottle cap injection, SPA nav detection
│   │   └── content.css        # Glow states (real / skunked)
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js           # Manual analyze UI, result cache
│   │   └── popup.css
│   └── icons/
│
├── api/                       # FastAPI backend
│   ├── main.py                # App entry point, CORS, route mounting
│   ├── requirements.txt
│   ├── db/
│   │   ├── models.py          # SQLAlchemy: Analysis, NotaryQueue
│   │   └── database.py        # Engine + session factory
│   ├── routes/
│   │   ├── analyze.py         # POST /analyze, GET /analyze/{id}
│   │   └── queue.py           # POST /queue, GET /queue, PATCH /queue/{id}
│   └── detection/
│       └── hive.py            # Hive API client + mock fallback
│
└── portal/                    # Next.js admin portal ("The Brewery")
    ├── app/
    │   ├── brewery/
    │   │   ├── page.tsx        # Queue + scan history dashboard
    │   │   ├── actions.ts      # Server actions (updateQueueStatus)
    │   │   ├── SignOutButton.tsx
    │   │   └── review/[id]/
    │   │       ├── page.tsx       # Per-item review page
    │   │       └── ReviewActions.tsx
    │   └── login/
    ├── lib/
    │   ├── auth.ts            # NextAuth config, allowed emails
    │   └── db.ts              # Prisma client singleton
    ├── prisma/
    │   └── schema.prisma      # Mirrors SQLAlchemy models
    └── middleware.ts          # Auth guard for /brewery routes
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- A PostgreSQL database (Neon recommended)
- A [Hive AI](https://thehive.ai/) API key
- A Google OAuth app (for The Brewery)

---

### 1. API

```bash
cd api
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create `api/.env`:

```env
DATABASE_URL=postgresql://user:password@host/dbname
HIVE_SECRET_KEY=your_hive_key
```

Start the server:

```bash
uvicorn main:app --reload --port 8000
```

> If `HIVE_SECRET_KEY` is omitted, the API runs in mock mode: scores are deterministically generated from the URL string. Useful for local development without spending API credits.

---

### 2. Portal

```bash
cd portal
npm install
```

Create `portal/.env`:

```env
DATABASE_URL=postgresql://user:password@host/dbname

NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Comma-separated list of emails allowed to access The Brewery
BREWERY_ALLOWED_EMAILS=you@example.com

# Set to "true" to skip auth entirely (local dev only)
SKIP_AUTH=false
```

Sync the Prisma schema:

```bash
npm run db:push
```

Start the portal:

```bash
npm run dev
```

The Brewery will be available at `http://localhost:3000/brewery`.

---

### 3. Extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` directory

The extension icon will appear in your toolbar. Navigate to any supported video platform and click the bottle cap that appears on the video player to run an analysis.

By default the extension points to `https://ale-api.example.com` — update the API base URL in `extension/background/service_worker.js` and `extension/popup/popup.js` to match your local or deployed API.

---

## Environment Variables Reference

### API (`api/.env`)

| Variable          | Required | Description                                        |
|-------------------|----------|----------------------------------------------------|
| `DATABASE_URL`    | Yes      | PostgreSQL connection string                       |
| `HIVE_SECRET_KEY` | No       | Hive AI Bearer token. Omit to use mock mode.       |

### Portal (`portal/.env`)

| Variable                | Required | Description                                             |
|-------------------------|----------|---------------------------------------------------------|
| `DATABASE_URL`          | Yes      | Same PostgreSQL connection string as the API            |
| `NEXTAUTH_URL`          | Yes      | Public base URL of the portal                           |
| `NEXTAUTH_SECRET`       | Yes      | Random secret for session signing                       |
| `GOOGLE_CLIENT_ID`      | Yes      | Google OAuth app client ID                              |
| `GOOGLE_CLIENT_SECRET`  | Yes      | Google OAuth app client secret                          |
| `BREWERY_ALLOWED_EMAILS`| Yes      | Comma-separated list of emails permitted to sign in     |
| `SKIP_AUTH`             | No       | Set to `true` to bypass auth (development only)         |

---

## Data Models

### `analyses`

Stores every AI scan result.

| Column         | Type    | Description                             |
|----------------|---------|-----------------------------------------|
| `id`           | UUID    | Primary key                             |
| `url`          | string  | The scanned URL                         |
| `video_id`     | string? | Platform-extracted video identifier     |
| `reality_score`| float?  | 0–100 composite score                   |
| `label`        | string? | Pure ALE / Mixed Pour / Flat / Skunked  |
| `raw_result`   | JSON    | Full Hive response                      |
| `session_id`   | string  | Anonymous extension session UUID        |
| `created_at`   | datetime| UTC timestamp                           |

### `notary_queue`

Tracks items submitted for human review.

| Column        | Type    | Description                                      |
|---------------|---------|--------------------------------------------------|
| `id`          | UUID    | Primary key                                      |
| `url`         | string  | The flagged URL                                  |
| `analysis_id` | UUID?   | FK to `analyses`                                 |
| `status`      | string  | `pending` → `reviewing` → `certified`/`rejected` |
| `notes`       | text?   | Notary's written observations                    |
| `session_id`  | string  | Anonymous extension session UUID                 |
| `created_at`  | datetime| UTC timestamp                                    |
| `updated_at`  | datetime| Last status change                               |

---

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Extension  | Chrome Manifest V3, vanilla JS      |
| API        | FastAPI, SQLAlchemy, Uvicorn        |
| Detection  | Hive AI v3 API                      |
| Database   | PostgreSQL (Neon), Prisma ORM       |
| Portal     | Next.js 14, NextAuth v4, Tailwind   |

---

## License

MIT
