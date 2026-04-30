import os
import random

import httpx

# The playground calls this YOUR_SECRET_KEY — it goes in the Bearer header
HIVE_SECRET_KEY = os.getenv("HIVE_SECRET_KEY", "")

HIVE_ENDPOINT = (
    "https://api.thehive.ai/api/v3/hive/ai-generated-and-deepfake-content-detection"
)


async def detect(url: str) -> dict:
    if HIVE_SECRET_KEY:
        return await _hive(url)
    return _mock(url)


async def _hive(url: str) -> dict:
    headers = {
        "Authorization": f"Bearer {HIVE_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "media_metadata": True,
        "input": [{"media_url": url}],
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(HIVE_ENDPOINT, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    score = _parse_score(data)
    details = _parse_details(data)
    return {"reality_score": score, "label": _label(score), "details": details, "raw": data}


def _parse_score(data: dict) -> float:
    try:
        classes = {c["class"]: c["value"] for c in data["output"][0]["classes"]}
        # Use the worst signal: general AI generation vs. deepfake visual
        ai_prob = max(
            classes.get("ai_generated", 0.0),
            classes.get("deepfake", 0.0),
        )
        return round((1 - ai_prob) * 100, 1)
    except (KeyError, IndexError):
        return 50.0


def _parse_details(data: dict) -> dict:
    """Pull out the signals we care about for the Brewery forensics view."""
    try:
        classes = {c["class"]: c["value"] for c in data["output"][0]["classes"]}
        return {
            "ai_generated": classes.get("ai_generated", None),
            "deepfake": classes.get("deepfake", None),
            "ai_generated_audio": classes.get("ai_generated_audio", None),
            "not_ai_generated": classes.get("not_ai_generated", None),
        }
    except (KeyError, IndexError):
        return {}


def _mock(url: str) -> dict:
    random.seed(sum(ord(c) for c in url))
    score = round(max(0.0, min(100.0, random.gauss(75, 18))), 1)
    ai_prob = round((100 - score) / 100, 3)
    return {
        "reality_score": score,
        "label": _label(score),
        "details": {
            "not_ai_generated": round(score / 100, 3),
            "ai_generated": round(ai_prob * 0.7, 3),
            "deepfake": round(ai_prob * 0.3, 3),
            "ai_generated_audio": None,
        },
        "raw": {"mock": True},
    }


def _label(score: float) -> str:
    if score >= 85:
        return "Pure ALE"
    if score >= 60:
        return "Mixed Pour"
    if score >= 30:
        return "Flat"
    return "Skunked"
