import time
import json
import hashlib
import secrets
import functools
import urllib.request
import urllib.error
from flask import g, session, redirect, url_for, request, abort
from . import db as dbmod


def login_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if g.get("user") is None:
            return redirect(url_for("auth.login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


def admin_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if g.get("user") is None or not g.user["is_admin"]:
            abort(403)
        return view(*args, **kwargs)
    return wrapped


def get_plan(plan_id):
    return dbmod.query("SELECT * FROM plans WHERE id=?", (plan_id,), one=True)


def user_card_count(user_id):
    row = dbmod.query("SELECT COUNT(*) c FROM cards WHERE user_id=?", (user_id,), one=True)
    return row["c"]


def can_create_card(user):
    plan = get_plan(user["plan_id"])
    if plan is None:
        return True
    return user_card_count(user["id"]) < plan["max_cards"]


def log_event(card_id, event_type, meta=""):
    ua = request.headers.get("User-Agent", "")
    device = "mobile" if any(k in ua for k in ("Mobi", "Android", "iPhone")) else "desktop"
    browser = "other"
    for name in ("Chrome", "Safari", "Firefox", "Edge"):
        if name.lower() in ua.lower():
            browser = name
            break
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "")
    ip_hash = hashlib.sha256(ip.encode()).hexdigest()[:16]
    dbmod.execute(
        """INSERT INTO analytics_events (card_id,event_type,meta,ip_hash,device,browser,country,created_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (card_id, event_type, meta, ip_hash, device, browser, "", int(time.time())),
    )
    fire_webhook_for_card_owner(card_id, {
        "view": "card.viewed", "qr_scan": "qr.scanned",
        "click": "link.clicked", "contact_saved": "contact.saved",
    }.get(event_type), {"card_id": card_id, "event": event_type, "meta": meta})


def generate_api_key():
    raw = secrets.token_urlsafe(32)
    full_key = f"cx_live_{raw}"
    prefix = full_key[:14]
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    return full_key, prefix, key_hash


def hash_key(full_key):
    return hashlib.sha256(full_key.encode()).hexdigest()


def fire_webhook(user_id, event_type, payload):
    hooks = dbmod.query(
        "SELECT * FROM webhooks WHERE user_id=? AND event_type=? AND is_active=1",
        (user_id, event_type),
    )
    for hook in hooks:
        body = json.dumps({"event": event_type, "data": payload, "ts": int(time.time())}).encode()
        sig = hashlib.sha256(hook["secret"].encode() + body).hexdigest()
        req = urllib.request.Request(
            hook["url"], data=body,
            headers={"Content-Type": "application/json", "X-CardX-Signature": sig},
            method="POST",
        )
        status = 0
        try:
            with urllib.request.urlopen(req, timeout=4) as resp:
                status = resp.status
        except urllib.error.URLError:
            status = 0
        except Exception:
            status = 0
        dbmod.execute(
            "UPDATE webhooks SET last_status=? WHERE id=?", (str(status), hook["id"])
        )
        dbmod.execute(
            """INSERT INTO webhook_logs (webhook_id,event_type,status_code,payload,created_at)
               VALUES (?,?,?,?,?)""",
            (hook["id"], event_type, status, body.decode(), int(time.time())),
        )


def fire_webhook_for_card_owner(card_id, event_type, payload):
    if not event_type:
        return
    card = dbmod.query("SELECT user_id FROM cards WHERE id=?", (card_id,), one=True)
    if card:
        fire_webhook(card["user_id"], event_type, payload)


def require_api_key(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        key = auth.replace("Bearer ", "").strip() if auth.startswith("Bearer ") else request.args.get("api_key", "")
        if not key:
            return {"error": "missing_api_key", "message": "Provide Authorization: Bearer <key>"}, 401
        kh = hash_key(key)
        row = dbmod.query("SELECT * FROM api_keys WHERE key_hash=? AND is_active=1", (kh,), one=True)
        if not row:
            return {"error": "invalid_api_key"}, 401
        user = dbmod.query("SELECT * FROM users WHERE id=?", (row["user_id"],), one=True)
        if not user or user["suspended"]:
            return {"error": "account_suspended"}, 403
        plan = get_plan(user["plan_id"])
        today = time.strftime("%Y-%m-%d")
        requests_today = row["requests_today"] if row["day_stamp"] == today else 0
        if plan and requests_today >= plan["max_api_requests_day"]:
            return {"error": "rate_limit_exceeded", "limit": plan["max_api_requests_day"]}, 429
        dbmod.execute(
            "UPDATE api_keys SET requests_today=?, day_stamp=?, total_requests=total_requests+1, last_used_at=? WHERE id=?",
            (requests_today + 1, today, int(time.time()), row["id"]),
        )
        g.api_user = user
        g.api_key_row = row
        return view(*args, **kwargs)
    return wrapped


def slugify_username(name, fallback="user"):
    import re
    s = re.sub(r"[^a-zA-Z0-9]+", "", name.lower())
    return s or fallback
