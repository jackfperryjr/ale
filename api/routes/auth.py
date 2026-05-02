import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.users import get_or_create_user_by_google

router = APIRouter()


class GoogleAuthRequest(BaseModel):
    access_token: str


@router.post("/auth/google")
async def auth_google(req: GoogleAuthRequest, db: Session = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {req.access_token}"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    info = resp.json()
    google_id = info.get("sub")
    email = info.get("email")
    if not google_id or not email:
        raise HTTPException(status_code=401, detail="Missing claims in Google token")

    user = get_or_create_user_by_google(google_id, email, db)
    return {
        "session_id": user.session_id,
        "email": email,
        "daily_credits": user.daily_credits,
    }
