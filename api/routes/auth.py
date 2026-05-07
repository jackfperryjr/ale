import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.users import get_or_create_user_by_google

router = APIRouter()


class GoogleAuthRequest(BaseModel):
    access_token: str


class GoogleMobileAuthRequest(BaseModel):
    code: str
    redirect_uri: str
    code_verifier: str


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
        "credits": user.credits,
    }


@router.post("/auth/google/mobile")
async def auth_google_mobile(req: GoogleMobileAuthRequest, db: Session = Depends(get_db)):
    client_id = os.getenv("GOOGLE_MOBILE_CLIENT_ID", "")
    if not client_id:
        raise HTTPException(status_code=500, detail="Mobile OAuth not configured")

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code":          req.code,
                "client_id":     client_id,
                "redirect_uri":  req.redirect_uri,
                "grant_type":    "authorization_code",
                "code_verifier": req.code_verifier,
            },
        )
    if token_resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Token exchange with Google failed")

    access_token = token_resp.json().get("access_token")
    if not access_token:
        raise HTTPException(status_code=401, detail="No access token returned")

    async with httpx.AsyncClient() as client:
        info_resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if info_resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Failed to fetch Google user info")

    info = info_resp.json()
    google_id = info.get("sub")
    email     = info.get("email")
    if not google_id or not email:
        raise HTTPException(status_code=401, detail="Missing claims in Google token")

    user = get_or_create_user_by_google(google_id, email, db)
    return {
        "session_id":    user.session_id,
        "email":         email,
        "daily_credits": user.daily_credits,
        "credits":       user.credits,
    }
