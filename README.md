# ALE API

FastAPI backend for the Authenticity Logic Engine — runs deepfake and AI-generation detection via [Hive AI](https://thehive.ai/) and manages the human notarization queue.

---

## How It Works

**POST /analyze** — accepts a video URL, calls the Hive AI detection model, persists the result, and returns a reality score with a signal breakdown (AI-generated, deepfake visual, AI-generated audio) and a label from *Pure ALE* to *Skunked*.

**POST /queue** — escalates a scan to human review, adding it to the brewmaster queue.

**PATCH /queue/{id}** — updates the status and notes on a queued item as a reviewer works through it.

---

## Reality Score

```
reality_score = (1 - max(ai_generated, deepfake)) × 100
```

| Score   | Label       | Meaning                                   |
|---------|-------------|-------------------------------------------|
| ≥ 85    | Pure ALE    | Strong indicators of genuine content      |
| 60–84   | Mixed Pour  | Inconclusive — may warrant closer review  |
| 30–59   | Flat        | Likely synthetic or manipulated           |
| < 30    | Skunked     | High confidence of AI generation/deepfake |

---

## Project Structure

```
ale-api/
├── main.py                # App entry point, CORS, route mounting
├── requirements.txt
├── db/
│   ├── models.py          # SQLAlchemy: Analysis, BrewmasterQueue
│   └── database.py        # Engine + session factory
├── routes/
│   ├── analyze.py         # POST /analyze, GET /analyze/{id}
│   └── queue.py           # POST /queue, GET /queue, PATCH /queue/{id}
└── detection/
    └── hive.py            # Hive API client + mock fallback
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- A PostgreSQL database (Neon recommended)
- A [Hive AI](https://thehive.ai/) API key

### Setup

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create `.env`:

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

## Environment Variables

| Variable          | Required | Description                                  |
|-------------------|----------|----------------------------------------------|
| `DATABASE_URL`    | Yes      | PostgreSQL connection string                 |
| `HIVE_SECRET_KEY` | No       | Hive AI Bearer token. Omit to use mock mode. |

---

## Data Models

### `analyses`

Stores every AI scan result.

| Column         | Type     | Description                             |
|----------------|----------|-----------------------------------------|
| `id`           | UUID     | Primary key                             |
| `url`          | string   | The scanned URL                         |
| `video_id`     | string?  | Platform-extracted video identifier     |
| `reality_score`| float?   | 0–100 composite score                   |
| `label`        | string?  | Pure ALE / Mixed Pour / Flat / Skunked  |
| `raw_result`   | JSON     | Full Hive response                      |
| `session_id`   | string   | Anonymous extension session UUID        |
| `created_at`   | datetime | UTC timestamp                           |

### `human_queue`

Tracks items submitted for human review.

| Column        | Type     | Description                                      |
|---------------|----------|--------------------------------------------------|
| `id`          | UUID     | Primary key                                      |
| `url`         | string   | The flagged URL                                  |
| `analysis_id` | UUID?    | FK to `analyses`                                 |
| `status`      | string   | `pending` → `reviewing` → `verified`/`rejected`  |
| `notes`       | text?    | Reviewer-written observations                    |
| `session_id`  | string   | Anonymous extension session UUID                 |
| `created_at`  | datetime | UTC timestamp                                    |
| `updated_at`  | datetime | Last status change                               |

---

## Tech Stack

| Layer     | Technology                   |
|-----------|------------------------------|
| API       | FastAPI, SQLAlchemy, Uvicorn |
| Detection | Hive AI v3 API               |
| Database  | PostgreSQL (Neon)            |

---

## License

MIT
