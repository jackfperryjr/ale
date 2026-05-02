from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import require_api_key
from ..db.database import get_db
from ..db.models import Analysis, BrewmasterQueue
from ..db.users import ANALYZE_COST, can_spend, deduct, get_or_create_user
from ..detection.hive import detect

router = APIRouter()


class AnalyzeRequest(BaseModel):
    url: str
    video_id: str | None = None
    session_id: str | None = None


@router.post("/analyze")
async def analyze(req: AnalyzeRequest, db: Session = Depends(get_db)):
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

    # Check credits before calling Hive
    user = get_or_create_user(req.session_id, db) if req.session_id else None
    if user and not can_spend(user, ANALYZE_COST):
        raise HTTPException(status_code=402, detail="Insufficient credits")

    result = await detect(req.url)

    # Deduct only after a successful Hive call
    if user:
        deduct(user, ANALYZE_COST)

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
