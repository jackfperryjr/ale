import hashlib
import hmac
import json
import os
import time

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from ..auth import require_api_key
from ..db.database import get_db
from ..db.models import Donation

router = APIRouter()

_STRIPE_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")


def _verify_stripe(body: bytes, signature: str | None) -> bool:
    if not _STRIPE_SECRET:
        return True
    if not signature:
        return False
    parts = dict(kv.split("=", 1) for kv in signature.split(",") if "=" in kv)
    timestamp = parts.get("t", "")
    v1 = parts.get("v1", "")
    if not timestamp or not v1:
        return False
    try:
        if abs(time.time() - int(timestamp)) > 300:
            return False
    except ValueError:
        return False
    signed = f"{timestamp}.{body.decode()}"
    expected = hmac.new(_STRIPE_SECRET.encode(), signed.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)


def _dedup(external_id: str | None, db: Session) -> bool:
    if not external_id:
        return False
    return db.query(Donation).filter(Donation.external_id == external_id).first() is not None


@router.post("/webhooks/stripe", status_code=200)
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(None),
    db: Session = Depends(get_db),
):
    body = await request.body()
    if not _verify_stripe(body, stripe_signature):
        raise HTTPException(status_code=400, detail="Invalid signature")

    payload = json.loads(body)
    if payload.get("type") != "checkout.session.completed":
        return {"ok": True}

    session = payload.get("data", {}).get("object", {})
    external_id = session.get("id")

    if _dedup(external_id, db):
        return {"ok": True}

    customer = session.get("customer_details", {})
    db.add(Donation(
        source="stripe",
        event_type="checkout.session.completed",
        amount_cents=session.get("amount_total"),
        currency=session.get("currency", "usd"),
        donor_name=customer.get("name"),
        donor_email=customer.get("email"),
        external_id=external_id,
        raw_payload=payload,
    ))
    db.commit()
    return {"ok": True}


@router.get("/sponsorships", dependencies=[Depends(require_api_key)])
def list_sponsorships(db: Session = Depends(get_db)):
    donations = db.query(Donation).order_by(Donation.created_at.desc()).all()

    def _dollars(cents: int | None) -> float | None:
        return round(cents / 100, 2) if cents is not None else None

    by_source: dict[str, int] = {}
    total_cents = 0
    for d in donations:
        if d.amount_cents is not None:
            total_cents += d.amount_cents
            by_source[d.source] = by_source.get(d.source, 0) + d.amount_cents

    return {
        "total_dollars": _dollars(total_cents),
        "by_source": {src: _dollars(c) for src, c in by_source.items()},
        "count": len(donations),
        "donations": [
            {
                "id": d.id,
                "source": d.source,
                "event_type": d.event_type,
                "amount_dollars": _dollars(d.amount_cents),
                "currency": d.currency,
                "donor_name": d.donor_name,
                "donor_email": d.donor_email,
                "external_id": d.external_id,
                "created_at": d.created_at,
            }
            for d in donations
        ],
    }
