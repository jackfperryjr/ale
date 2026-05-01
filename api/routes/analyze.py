from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import Analysis
from ..db.users import ANALYZE_COST, get_or_create_user
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
    if user and user.credits < ANALYZE_COST:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    result = await detect(req.url)

    # Deduct only after a successful Hive call
    if user:
        user.credits -= ANALYZE_COST

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
        "credits": user.credits if user else None,
    }


@router.get("/analyze/{analysis_id}")
def get_analysis(analysis_id: str, db: Session = Depends(get_db)):
    record = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return record
