"""
CardX Database Layer
Pure sqlite3 (stdlib) — no ORM dependency, zero extra installs required.
Creates and migrates the schema automatically on first run.
"""
import sqlite3
import os
import time
import secrets
from flask import g, current_app

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    is_verified INTEGER DEFAULT 0,
    verify_token TEXT,
    reset_token TEXT,
    reset_expires INTEGER,
    plan_id INTEGER DEFAULT 1,
    team_id INTEGER,
    dark_mode INTEGER DEFAULT 0,
    locale TEXT DEFAULT 'ar',
    suspended INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    white_label INTEGER DEFAULT 0,
    logo_url TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    price_month REAL NOT NULL,
    max_cards INTEGER NOT NULL,
    max_api_requests_day INTEGER NOT NULL,
    custom_domain INTEGER DEFAULT 0,
    white_label INTEGER DEFAULT 0,
    team_members INTEGER DEFAULT 1,
    advanced_analytics INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT UNIQUE NOT NULL,
    template TEXT NOT NULL DEFAULT 'minimal',
    first_name TEXT DEFAULT '',
    last_name TEXT DEFAULT '',
    job_title TEXT DEFAULT '',
    company TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    whatsapp TEXT DEFAULT '',
    email TEXT DEFAULT '',
    website TEXT DEFAULT '',
    address TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    cover_url TEXT DEFAULT '',
    primary_color TEXT DEFAULT '#4F3FF0',
    accent_color TEXT DEFAULT '#FF6A45',
    bg_color TEXT DEFAULT '#FFFFFF',
    text_color TEXT DEFAULT '#12121A',
    button_style TEXT DEFAULT 'filled',
    radius TEXT DEFAULT 'xl',
    shadow TEXT DEFAULT 'soft',
    avatar_shape TEXT DEFAULT 'circle',
    sections_order TEXT DEFAULT 'about,services,social,gallery,contact,location',
    sections_visible TEXT DEFAULT 'about,services,social,gallery,contact,location',
    is_published INTEGER DEFAULT 1,
    seo_index INTEGER DEFAULT 1,
    seo_title TEXT DEFAULT '',
    seo_description TEXT DEFAULT '',
    custom_domain TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS social_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS card_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    section TEXT NOT NULL,
    title TEXT DEFAULT '',
    body TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    meta TEXT DEFAULT '',
    ip_hash TEXT DEFAULT '',
    device TEXT DEFAULT '',
    browser TEXT DEFAULT '',
    country TEXT DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts_saved (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    visitor_name TEXT DEFAULT '',
    visitor_email TEXT DEFAULT '',
    visitor_phone TEXT DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    requests_today INTEGER DEFAULT 0,
    day_stamp TEXT DEFAULT '',
    total_requests INTEGER DEFAULT 0,
    last_used_at INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    event_type TEXT NOT NULL,
    secret TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_status TEXT DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    status_code INTEGER,
    payload TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    started_at INTEGER NOT NULL,
    renews_at INTEGER
);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'paid',
    method TEXT DEFAULT 'manual',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    domain TEXT UNIQUE NOT NULL,
    verified INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    action TEXT NOT NULL,
    meta TEXT DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
"""

DEFAULT_PLANS = [
    ("free", "Free", 0, 1, 100, 0, 0, 1, 0, 1),
    ("pro", "Pro", 5, 15, 2000, 0, 0, 1, 1, 2),
    ("business", "Business", 19, 100, 20000, 1, 1, 10, 1, 3),
    ("enterprise", "Enterprise", 0, 100000, 1000000, 1, 1, 1000, 1, 4),
]


def get_db():
    if "db" not in g:
        db_path = current_app.config["DATABASE"]
        g.db = sqlite3.connect(db_path, detect_types=sqlite3.PARSE_DECLTYPES)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db(app):
    """Create schema + seed default data. Safe to call every startup."""
    os.makedirs(os.path.dirname(app.config["DATABASE"]), exist_ok=True)
    conn = sqlite3.connect(app.config["DATABASE"])
    conn.executescript(SCHEMA)
    conn.commit()

    conn.row_factory = sqlite3.Row
    count = conn.execute("SELECT COUNT(*) AS c FROM plans").fetchone()["c"]
    if count == 0:
        conn.executemany(
            """INSERT INTO plans
               (slug,name,price_month,max_cards,max_api_requests_day,custom_domain,white_label,team_members,advanced_analytics,sort_order)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            DEFAULT_PLANS,
        )
        conn.commit()

    # seed an admin account on very first run
    admin = conn.execute("SELECT id FROM users WHERE is_admin = 1 LIMIT 1").fetchone()
    if admin is None:
        from werkzeug.security import generate_password_hash
        conn.execute(
            """INSERT INTO users (email,password_hash,full_name,is_admin,is_verified,plan_id,created_at)
               VALUES (?,?,?,1,1,4,?)""",
            ("admin@cardx.local", generate_password_hash("admin123"), "CardX Admin", int(time.time())),
        )
        conn.commit()

    conn.close()


def query(sql, args=(), one=False):
    cur = get_db().execute(sql, args)
    rv = cur.fetchall()
    cur.close()
    return (rv[0] if rv else None) if one else rv


def execute(sql, args=()):
    db = get_db()
    cur = db.execute(sql, args)
    db.commit()
    return cur.lastrowid


def new_uid(prefix="card"):
    return f"{prefix}_{secrets.token_hex(8)}"
