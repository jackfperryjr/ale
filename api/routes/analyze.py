from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import Analysis
from ..detection.hive import detect

router = APIRouter()


class AnalyzeRequest(BaseModel):
    url: str
    video_id: str | None = None
    session_id: str | None = None


@router.post("/analyze")
async def analyze(req: AnalyzeRequest, db: Session = Depends(get_db)):
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

    result = await detect(req.url)

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
    }


@router.get("/analyze/{analysis_id}")
def get_analysis(analysis_id: str, db: Session = Depends(get_db)):
    record = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return record
