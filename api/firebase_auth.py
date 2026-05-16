"""Firebase Auth integration for PetriDish FastAPI.

Initializes firebase-admin from a base64-encoded service account JSON in env
(FIREBASE_SERVICE_ACCOUNT_B64), and exposes a `verify_user` FastAPI dependency
that validates a Bearer ID token and returns the decoded claims.

If Firebase isn't configured (env var missing), `verify_user` raises 503 so the
caller knows to skip auth-gated paths during local dev.
"""

from __future__ import annotations

import base64
import json
import os
from typing import Optional

from fastapi import Header, HTTPException

_app: Optional[object] = None
_firestore_client: Optional[object] = None
_init_attempted: bool = False
_init_error: Optional[str] = None


def _init() -> None:
    global _app, _init_attempted, _init_error
    if _init_attempted:
        return
    _init_attempted = True

    b64 = os.getenv("FIREBASE_SERVICE_ACCOUNT_B64", "").strip()
    if not b64:
        _init_error = "FIREBASE_SERVICE_ACCOUNT_B64 not set"
        return

    try:
        import firebase_admin
        from firebase_admin import credentials

        sa_json = json.loads(base64.b64decode(b64).decode("utf-8"))
        cred = credentials.Certificate(sa_json)
        _app = firebase_admin.initialize_app(cred)
    except Exception as e:  # pragma: no cover
        _init_error = f"firebase-admin init failed: {e}"


def is_configured() -> bool:
    _init()
    return _app is not None


def firestore_db():
    """Lazy Firestore client. Returns None if Firebase isn't configured."""
    global _firestore_client
    if not is_configured():
        return None
    if _firestore_client is None:
        from firebase_admin import firestore
        _firestore_client = firestore.client()
    return _firestore_client


def log_event(user: dict, event_type: str, payload: dict | None = None) -> None:
    """Best-effort audit write. Never raises — audit logging must not break the API.

    Writes:
      users/{uid}              — upserted profile (email, name, last_seen, plan)
      audit/{uid}/events/{id}  — one doc per protected action
    """
    try:
        db = firestore_db()
        if db is None or not user.get("uid"):
            return
        from firebase_admin import firestore as _fs
        uid = user["uid"]

        db.collection("users").document(uid).set(
            {
                "uid": uid,
                "email": user.get("email", ""),
                "name": user.get("name", ""),
                "picture": user.get("picture", ""),
                "provider": user.get("provider", ""),
                "plan": "free",
                "last_seen": _fs.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        db.collection("audit").document(uid).collection("events").add(
            {
                "type": event_type,
                "payload": payload or {},
                "email": user.get("email", ""),
                "ts": _fs.SERVER_TIMESTAMP,
            }
        )
    except Exception:
        # Swallow — audit is non-critical
        pass


def get_user_events(uid: str, limit: int = 50) -> list[dict]:
    """Return the most recent audit events for a user."""
    db = firestore_db()
    if db is None or not uid:
        return []
    try:
        from firebase_admin import firestore as _fs
        q = (
            db.collection("audit").document(uid).collection("events")
            .order_by("ts", direction=_fs.Query.DESCENDING)
            .limit(limit)
        )
        out = []
        for doc in q.stream():
            d = doc.to_dict()
            ts = d.get("ts")
            out.append({
                "id": doc.id,
                "type": d.get("type", ""),
                "payload": d.get("payload", {}),
                "ts": ts.isoformat() if hasattr(ts, "isoformat") else None,
            })
        return out
    except Exception:
        return []


def get_user_summary(uid: str) -> dict:
    """Aggregate counts by event type for a user."""
    events = get_user_events(uid, limit=500)
    by_type: dict[str, int] = {}
    for e in events:
        by_type[e["type"]] = by_type.get(e["type"], 0) + 1
    return {
        "total_events": len(events),
        "by_type": by_type,
        "latest": events[0]["ts"] if events else None,
    }


async def verify_user(authorization: str = Header(default="")) -> dict:
    """FastAPI dependency: validate Bearer ID token, return user claims.

    Returns dict with at least: uid, email, name, picture.
    Raises 401 on invalid/missing token, 503 if Firebase isn't configured.
    """
    if not is_configured():
        raise HTTPException(status_code=503, detail=f"Auth not configured: {_init_error}")

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty Bearer token")

    try:
        from firebase_admin import auth as fb_auth
        decoded = fb_auth.verify_id_token(token, check_revoked=False)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    return {
        "uid": decoded.get("uid", ""),
        "email": decoded.get("email", ""),
        "name": decoded.get("name", ""),
        "picture": decoded.get("picture", ""),
        "email_verified": decoded.get("email_verified", False),
        "provider": decoded.get("firebase", {}).get("sign_in_provider", "unknown"),
    }


async def optional_user(authorization: str = Header(default="")) -> Optional[dict]:
    """Soft variant: returns user dict if a valid token is present, else None.

    Used for endpoints that work without auth but record user identity when available.
    """
    if not authorization or not is_configured():
        return None
    try:
        return await verify_user(authorization)
    except HTTPException:
        return None
