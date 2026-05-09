import re

import httpx
from fastapi import APIRouter, Depends, HTTPException
from httpx import HTTPStatusError as HiveHTTPError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import require_api_key
from ..db.database import get_db
from ..db.models import Analysis, BrewmasterQueue
from ..db.users import IMAGE_COST, VIDEO_COST, can_spend, deduct, get_or_create_user, get_or_create_user_by_email
from ..detection.hive import detect

_MAX_VIDEO_SECONDS = 900  # 15 minutes

router = APIRouter()

_YOUTUBE_HOSTS = {"www.youtube.com", "youtube.com", "youtu.be", "m.youtube.com"}
_FACEBOOK_PAGE_HOSTS = {"www.facebook.com", "facebook.com", "fb.com", "fb.watch"}
_X_HOSTS = {"x.com", "www.x.com", "twitter.com", "www.twitter.com"}


def _analyze_cost(video_id: str | None) -> int:
    return VIDEO_COST if video_id else IMAGE_COST


async def _resolve_media_url(url: str, video_id: str | None) -> str:
    try:
        host = url.split("/")[2]
    except IndexError:
        return url

    if host in _YOUTUBE_HOSTS and video_id:
        return f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"

    # X.com / Twitter — fetch the tweet page as Twitterbot to get the video thumbnail
    # from og:image. Falls through silently for login-gated or unavailable tweets.
    if host in _X_HOSTS and video_id:
        try:
            tweet_url = f"https://x.com/i/status/{video_id}"
            async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
                r = await client.get(
                    tweet_url,
                    headers={"User-Agent": "Twitterbot/1.0"},
                )
            m = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', r.text)
            if not m:
                m = re.search(r'<meta[^>]+content="([^"]+)"[^>]+property="og:image"', r.text)
            if m:
                og_image = m.group(1).replace("&amp;", "&")
                if og_image.startswith("http") and "pbs.twimg.com" in og_image:
                    return og_image
        except Exception:
            pass

    # Facebook page URLs (reels, posts) — try to extract og:image from the page.
    # Works for public content; fails silently for login-gated content.
    if host in _FACEBOOK_PAGE_HOSTS:
        try:
            async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
                r = await client.get(
                    url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"},
                )
            m = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', r.text)
            if not m:
                m = re.search(r'<meta[^>]+content="([^"]+)"[^>]+property="og:image"', r.text)
            if m:
                og_image = m.group(1).replace("&amp;", "&")
                if og_image.startswith("http"):
                    return og_image
        except Exception:
            pass

    return url


class AnalyzeRequest(BaseModel):
    url: str
    video_id: str | None = None
    session_id: str | None = None
    portal_email: str | None = None
    video_duration_seconds: int | None = None
    content_type: str | None = None   # "image" | "video"
    trigger: str | None = None        # "cap_click" | "image_hover" | "manual_url"


class DisagreeRequest(BaseModel):
    session_id: str | None = None


@router.get("/me")
def get_me(session_id: str | None = None, email: str | None = None, db: Session = Depends(get_db)):
    if email:
        user = get_or_create_user_by_email(email, db)
    elif session_id:
        user = get_or_create_user(session_id, db)
    else:
        raise HTTPException(status_code=400, detail="session_id or email required")
    return {"daily_credits": user.daily_credits, "credits": user.credits}


@router.post("/analyze")
async def analyze(req: AnalyzeRequest, db: Session = Depends(get_db)):
    if req.video_duration_seconds and req.video_duration_seconds > _MAX_VIDEO_SECONDS:
        raise HTTPException(status_code=413, detail="Video is too long. Max 15 minutes per pour.")

    # Cached results are free — no Hive call made
    cached = (
        db.query(Analysis)
        .filter(Analysis.url == req.url, Analysis.status == "complete")
        .first()
    )
    if cached:
        return {
            "id": cached.id,
            "reality_score": cached.reality_score,
            "label": cached.label,
            "details": cached.raw_result.get("details") if cached.raw_result else {},
            "cached": True,
        }

    cost = _analyze_cost(req.video_id)

    # Check credits before calling Hive
    if req.portal_email:
        user = get_or_create_user_by_email(req.portal_email, db)
    elif req.session_id:
        user = get_or_create_user(req.session_id, db)
    else:
        user = None
    if user and not can_spend(user, cost):
        raise HTTPException(status_code=402, detail="Insufficient credits")

    hive_url = await _resolve_media_url(req.url, req.video_id)
    try:
        result = await detect(hive_url)
    except HiveHTTPError as e:
        status = e.response.status_code
        if status == 400:
            raise HTTPException(
                status_code=422,
                detail="Media could not be processed. Make sure the URL points to a supported image or video.",
            )
        if status == 429:
            raise HTTPException(status_code=429, detail="Too many requests to the analysis service. Try again in a moment.")
        raise HTTPException(status_code=502, detail=f"Media analysis service error ({status}).")

    # Deduct only after a successful Hive call
    if user:
        deduct(user, cost)

    record = Analysis(
        url=req.url,
        video_id=req.video_id,
        session_id=req.session_id,
        reality_score=result["reality_score"],
        label=result["label"],
        raw_result={"details": result.get("details"), "raw": result.get("raw")},
        status="complete",
        content_type=req.content_type,
        trigger=req.trigger,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "reality_score": record.reality_score,
        "label": record.label,
        "details": result.get("details", {}),
        "cached": False,
        "daily_credits": user.daily_credits if user else None,
        "credits": user.credits if user else None,
    }


@router.get("/analyses", dependencies=[Depends(require_api_key)])
def list_analyses(limit: int = 100, db: Session = Depends(get_db)):
    analyses = (
        db.query(Analysis)
        .order_by(Analysis.created_at.desc())
        .limit(limit)
        .all()
    )
    analysis_ids = [a.id for a in analyses]
    reviews: dict = {}
    if analysis_ids:
        queue_items = (
            db.query(BrewmasterQueue)
            .filter(
                BrewmasterQueue.analysis_id.in_(analysis_ids),
                BrewmasterQueue.status.in_(["verified", "rejected"]),
            )
            .order_by(BrewmasterQueue.updated_at.desc())
            .all()
        )
        for item in queue_items:
            if item.analysis_id not in reviews:
                reviews[item.analysis_id] = item

    result = []
    for a in analyses:
        review = reviews.get(a.id)
        result.append({
            "id": a.id,
            "url": a.url,
            "video_id": a.video_id,
            "reality_score": a.reality_score,
            "label": a.label,
            "raw_result": a.raw_result,
            "status": a.status,
            "session_id": a.session_id,
            "content_type": a.content_type,
            "trigger": a.trigger,
            "user_disagreed": a.user_disagreed,
            "created_at": a.created_at,
            "review": {
                "status": review.status,
                "notes": review.notes,
                "updated_at": review.updated_at,
            } if review else None,
        })
    return result


@router.get("/analyze/{analysis_id}", dependencies=[Depends(require_api_key)])
def get_analysis(analysis_id: str, db: Session = Depends(get_db)):
    record = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return record


@router.patch("/analyze/{analysis_id}/disagree")
def mark_disagreement(analysis_id: str, req: DisagreeRequest, db: Session = Depends(get_db)):
    record = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Analysis not found")
    record.user_disagreed = True
    db.commit()
    return {"ok": True}
