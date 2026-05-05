import math

from fastapi import APIRouter, Depends, HTTPException
from httpx import HTTPStatusError as HiveHTTPError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import require_api_key
from ..db.database import get_db
from ..db.models import Analysis, BrewmasterQueue
from ..db.users import ANALYZE_COST, can_spend, deduct, get_or_create_user
from ..detection.hive import detect

router = APIRouter()

MAX_VIDEO_SECONDS = 600  # 10 minutes

_YOUTUBE_HOSTS = {"www.youtube.com", "youtube.com", "youtu.be", "m.youtube.com"}


def _video_cost(duration_seconds: int | None) -> int:
    if not duration_seconds:
        return ANALYZE_COST
    return math.ceil(duration_seconds / 180)  # 1 credit per 3 minutes


def _resolve_media_url(url: str, video_id: str | None) -> str:
    """Convert social video page URLs to a direct media URL Hive can process."""
    try:
        host = url.split("/")[2]
    except IndexError:
        return url
    if host in _YOUTUBE_HOSTS and video_id:
        return f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
    return url


class AnalyzeRequest(BaseModel):
    url: str
    video_id: str | None = None
    session_id: str | None = None
    video_duration_seconds: int | None = None


@router.post("/analyze")
async def analyze(req: AnalyzeRequest, db: Session = Depends(get_db)):
    if req.video_duration_seconds and req.video_duration_seconds > MAX_VIDEO_SECONDS:
        mins = req.video_duration_seconds // 60
        secs = req.video_duration_seconds % 60
        raise HTTPException(
            status_code=413,
            detail=f"Video is too long ({mins}:{secs:02d}). Maximum is 10 minutes per analysis.",
        )

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

    cost = _video_cost(req.video_duration_seconds)

    # Check credits before calling Hive
    user = get_or_create_user(req.session_id, db) if req.session_id else None
    if user and not can_spend(user, cost):
        raise HTTPException(status_code=402, detail="Insufficient credits")

    hive_url = _resolve_media_url(req.url, req.video_id)
    try:
        result = await detect(hive_url)
    except HiveHTTPError as e:
        if e.response.status_code == 400:
            raise HTTPException(
                status_code=422,
                detail="Media could not be processed. Make sure the URL points to a supported image or video.",
            )
        raise

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
