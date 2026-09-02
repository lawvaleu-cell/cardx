import time
import json
from flask import Blueprint, render_template, request, redirect, url_for, g, flash, session
from werkzeug.security import generate_password_hash, check_password_hash
from . import db as dbmod
from .utils import login_required, get_plan, generate_api_key, user_card_count
from .templates_data import TEMPLATES
from . import charts

bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")


@bp.route("/")
@login_required
def home():
    uid = g.user["id"]
    cards = dbmod.query("SELECT id FROM cards WHERE user_id=?", (uid,))
    card_ids = [c["id"] for c in cards] or [0]
    placeholders = ",".join("?" * len(card_ids))

    total_views = dbmod.query(
        f"SELECT COUNT(*) c FROM analytics_events WHERE card_id IN ({placeholders}) AND event_type='view'",
        card_ids, one=True,
    )["c"]
    qr_scans = dbmod.query(
        f"SELECT COUNT(*) c FROM analytics_events WHERE card_id IN ({placeholders}) AND event_type='qr_scan'",
        card_ids, one=True,
    )["c"]
    link_clicks = dbmod.query(
        f"SELECT COUNT(*) c FROM analytics_events WHERE card_id IN ({placeholders}) AND event_type='click'",
        card_ids, one=True,
    )["c"]
    contacts_saved = dbmod.query(
        f"SELECT COUNT(*) c FROM analytics_events WHERE card_id IN ({placeholders}) AND event_type='contact_saved'",
        card_ids, one=True,
    )["c"]

    week_ago = int(time.time()) - 7 * 86400
    daily = dbmod.query(
        f"""SELECT date(created_at, 'unixepoch') d, COUNT(*) c FROM analytics_events
            WHERE card_id IN ({placeholders}) AND created_at >= ? AND event_type='view'
            GROUP BY d ORDER BY d""",
        card_ids + [week_ago],
    )
    top_links = dbmod.query(
        f"""SELECT meta, COUNT(*) c FROM analytics_events
            WHERE card_id IN ({placeholders}) AND event_type='click' AND meta != ''
            GROUP BY meta ORDER BY c DESC LIMIT 6""",
        card_ids,
    )
    sources = dbmod.query(
        f"""SELECT device, COUNT(*) c FROM analytics_events
            WHERE card_id IN ({placeholders}) GROUP BY device""",
        card_ids,
    )

    recent_cards = dbmod.query(
        "SELECT * FROM cards WHERE user_id=? ORDER BY updated_at DESC LIMIT 5", (uid,)
    )
    plan = get_plan(g.user["plan_id"])
    day_map = {d["d"]: d["c"] for d in daily}
    import datetime
    labels, series = [], []
    for i in range(6, -1, -1):
        day = (datetime.date.today() - datetime.timedelta(days=i))
        labels.append(day.strftime("%a"))
        series.append(day_map.get(day.isoformat(), 0))
    views_svg = charts.line_chart(labels, series)
    sources_svg = charts.donut_chart([(s["device"] or "unknown", s["c"]) for s in sources]) if sources else ""
    return render_template(
        "dashboard/home.html",
        total_cards=len(cards), total_views=total_views, qr_scans=qr_scans,
        link_clicks=link_clicks, contacts_saved=contacts_saved,
        views_svg=views_svg, sources_svg=sources_svg,
        top_links=top_links, sources=sources, recent_cards=recent_cards, plan=plan,
    )


@bp.route("/cards")
@login_required
def my_cards():
    cards = dbmod.query("SELECT * FROM cards WHERE user_id=? ORDER BY updated_at DESC", (g.user["id"],))
    plan = get_plan(g.user["plan_id"])
    return render_template("dashboard/my_cards.html", cards=cards, plan=plan, used=len(cards))


@bp.route("/templates")
@login_required
def templates_page():
    return render_template("dashboard/templates_page.html", templates=TEMPLATES)


@bp.route("/analytics")
@login_required
def analytics():
    card_filter = request.args.get("card_id", type=int)
    cards = dbmod.query("SELECT * FROM cards WHERE user_id=? ORDER BY created_at DESC", (g.user["id"],))
    card_ids = [c["id"] for c in cards if not card_filter or c["id"] == card_filter] or [0]
    placeholders = ",".join("?" * len(card_ids))

    events = {}
    for ev in ("view", "qr_scan", "click", "contact_saved"):
        events[ev] = dbmod.query(
            f"SELECT COUNT(*) c FROM analytics_events WHERE card_id IN ({placeholders}) AND event_type=?",
            card_ids + [ev], one=True,
        )["c"]

    week_ago = int(time.time()) - 7 * 86400
    daily = dbmod.query(
        f"""SELECT date(created_at,'unixepoch') d, COUNT(*) c FROM analytics_events
            WHERE card_id IN ({placeholders}) AND created_at >= ? AND event_type='view'
            GROUP BY d ORDER BY d""",
        card_ids + [week_ago],
    )
    devices = dbmod.query(
        f"SELECT device, COUNT(*) c FROM analytics_events WHERE card_id IN ({placeholders}) GROUP BY device",
        card_ids,
    )
    browsers = dbmod.query(
        f"SELECT browser, COUNT(*) c FROM analytics_events WHERE card_id IN ({placeholders}) GROUP BY browser",
        card_ids,
    )
    top_links = dbmod.query(
        f"""SELECT meta, COUNT(*) c FROM analytics_events
            WHERE card_id IN ({placeholders}) AND event_type='click' AND meta != ''
            GROUP BY meta ORDER BY c DESC LIMIT 8""",
        card_ids,
    )
    day_map = {d["d"]: d["c"] for d in daily}
    import datetime
    labels, series = [], []
    for i in range(6, -1, -1):
        day = (datetime.date.today() - datetime.timedelta(days=i))
        labels.append(day.strftime("%a"))
        series.append(day_map.get(day.isoformat(), 0))
    views_svg = charts.line_chart(labels, series)
    devices_svg = charts.donut_chart([(d["device"] or "unknown", d["c"]) for d in devices]) if devices else ""
    browsers_svg = charts.bar_chart([b["browser"] or "other" for b in browsers], [b["c"] for b in browsers]) if browsers else ""
    return render_template(
        "dashboard/analytics.html", cards=cards, card_filter=card_filter, events=events,
        views_svg=views_svg, devices_svg=devices_svg, browsers_svg=browsers_svg,
        devices=devices, browsers=browsers, top_links=top_links,
    )


@bp.route("/contacts")
@login_required
def contacts():
    cards = dbmod.query("SELECT id, username, first_name, last_name FROM cards WHERE user_id=?", (g.user["id"],))
    card_ids = [c["id"] for c in cards] or [0]
    placeholders = ",".join("?" * len(card_ids))
    events = dbmod.query(
        f"""SELECT * FROM analytics_events WHERE card_id IN ({placeholders}) AND event_type='contact_saved'
            ORDER BY created_at DESC LIMIT 100""",
        card_ids,
    )
    card_map = {c["id"]: c for c in cards}
    return render_template("dashboard/contacts.html", events=events, card_map=card_map)


@bp.route("/team", methods=["GET", "POST"])
@login_required
def team():
    if request.method == "POST":
        action = request.form.get("action")
        if action == "create_team":
            name = request.form.get("name", "").strip()
            if name:
                team_id = dbmod.execute(
                    "INSERT INTO teams (name,owner_id,created_at) VALUES (?,?,?)",
                    (name, g.user["id"], int(time.time())),
                )
                dbmod.execute("UPDATE users SET team_id=? WHERE id=?", (team_id, g.user["id"]))
                flash("تم إنشاء الفريق." if g.locale == "ar" else "Team created.", "success")
        elif action == "invite":
            email = request.form.get("email", "").strip().lower()
            member = dbmod.query("SELECT * FROM users WHERE email=?", (email,), one=True)
            if member and g.user["team_id"]:
                dbmod.execute("UPDATE users SET team_id=? WHERE id=?", (g.user["team_id"], member["id"]))
                flash("تمت إضافة العضو." if g.locale == "ar" else "Member added.", "success")
            else:
                flash("المستخدم غير موجود." if g.locale == "ar" else "User not found.", "error")
        return redirect(url_for("dashboard.team"))

    my_team = None
    members = []
    stats = {"cards": 0, "views": 0}
    if g.user["team_id"]:
        my_team = dbmod.query("SELECT * FROM teams WHERE id=?", (g.user["team_id"],), one=True)
        members = dbmod.query("SELECT * FROM users WHERE team_id=?", (g.user["team_id"],))
        member_ids = [m["id"] for m in members] or [0]
        placeholders = ",".join("?" * len(member_ids))
        cards = dbmod.query(f"SELECT id FROM cards WHERE user_id IN ({placeholders})", member_ids)
        card_ids = [c["id"] for c in cards] or [0]
        cp = ",".join("?" * len(card_ids))
        stats["cards"] = len(cards)
        stats["views"] = dbmod.query(
            f"SELECT COUNT(*) c FROM analytics_events WHERE card_id IN ({cp}) AND event_type='view'",
            card_ids, one=True,
        )["c"]
    return render_template("dashboard/team.html", team=my_team, members=members, stats=stats)


@bp.route("/branding", methods=["GET", "POST"])
@login_required
def branding():
    plan = get_plan(g.user["plan_id"])
    my_team = dbmod.query("SELECT * FROM teams WHERE id=?", (g.user["team_id"],), one=True) if g.user["team_id"] else None
    if request.method == "POST" and my_team:
        white_label = 1 if request.form.get("white_label") == "on" else 0
        dbmod.execute("UPDATE teams SET white_label=? WHERE id=?", (white_label, my_team["id"]))
        flash("تم تحديث إعدادات العلامة التجارية." if g.locale == "ar" else "Branding settings updated.", "success")
        return redirect(url_for("dashboard.branding"))
    return render_template("dashboard/branding.html", plan=plan, team=my_team)


@bp.route("/api-keys", methods=["GET", "POST"])
@login_required
def api_keys():
    new_key_value = None
    if request.method == "POST":
        action = request.form.get("action")
        if action == "create":
            name = request.form.get("name", "New Key").strip() or "New Key"
            full_key, prefix, key_hash = generate_api_key()
            dbmod.execute(
                """INSERT INTO api_keys (user_id,name,key_prefix,key_hash,day_stamp,created_at)
                   VALUES (?,?,?,?,?,?)""",
                (g.user["id"], name, prefix, key_hash, "", int(time.time())),
            )
            new_key_value = full_key
        elif action == "revoke":
            key_id = request.form.get("key_id", type=int)
            dbmod.execute(
                "UPDATE api_keys SET is_active=0 WHERE id=? AND user_id=?", (key_id, g.user["id"])
            )
            flash("تم إلغاء المفتاح." if g.locale == "ar" else "Key revoked.", "success")

    keys = dbmod.query("SELECT * FROM api_keys WHERE user_id=? ORDER BY created_at DESC", (g.user["id"],))
    plan = get_plan(g.user["plan_id"])
    return render_template("dashboard/api_keys.html", keys=keys, new_key_value=new_key_value, plan=plan)


@bp.route("/webhooks", methods=["GET", "POST"])
@login_required
def webhooks():
    import secrets as _secrets
    if request.method == "POST":
        action = request.form.get("action")
        if action == "create":
            url = request.form.get("url", "").strip()
            event_type = request.form.get("event_type", "")
            if url and event_type:
                dbmod.execute(
                    """INSERT INTO webhooks (user_id,url,event_type,secret,created_at)
                       VALUES (?,?,?,?,?)""",
                    (g.user["id"], url, event_type, _secrets.token_hex(16), int(time.time())),
                )
                flash("تم إضافة Webhook." if g.locale == "ar" else "Webhook added.", "success")
        elif action == "delete":
            wid = request.form.get("webhook_id", type=int)
            dbmod.execute("DELETE FROM webhooks WHERE id=? AND user_id=?", (wid, g.user["id"]))
        return redirect(url_for("dashboard.webhooks"))
    hooks = dbmod.query("SELECT * FROM webhooks WHERE user_id=? ORDER BY created_at DESC", (g.user["id"],))
    events = ["card.created", "card.updated", "card.viewed", "qr.scanned", "contact.saved", "link.clicked"]
    return render_template("dashboard/webhooks.html", hooks=hooks, events=events)


@bp.route("/billing", methods=["GET", "POST"])
@login_required
def billing():
    plans = dbmod.query("SELECT * FROM plans ORDER BY sort_order")
    if request.method == "POST":
        plan_id = request.form.get("plan_id", type=int)
        plan = get_plan(plan_id)
        if plan:
            dbmod.execute("UPDATE users SET plan_id=? WHERE id=?", (plan_id, g.user["id"]))
            dbmod.execute(
                "INSERT INTO subscriptions (user_id,plan_id,status,started_at) VALUES (?,?,?,?)",
                (g.user["id"], plan_id, "active", int(time.time())),
            )
            dbmod.execute(
                "INSERT INTO payments (user_id,plan_id,amount,status,method,created_at) VALUES (?,?,?,?,?,?)",
                (g.user["id"], plan_id, plan["price_month"], "paid", "manual", int(time.time())),
            )
            flash(
                "تم تحديث خطتك (محاكاة داخلية للفوترة — بدون بوابة دفع خارجية حقيقية)."
                if g.locale == "ar" else
                "Your plan was updated (internal billing simulation — no real external payment gateway).",
                "success",
            )
        return redirect(url_for("dashboard.billing"))
    payments = dbmod.query("SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC LIMIT 20", (g.user["id"],))
    current_plan = get_plan(g.user["plan_id"])
    return render_template("dashboard/billing.html", plans=plans, payments=payments, current_plan=current_plan)


@bp.route("/settings", methods=["GET", "POST"])
@login_required
def settings():
    if request.method == "POST":
        action = request.form.get("action")
        if action == "profile":
            full_name = request.form.get("full_name", "").strip()
            locale = request.form.get("locale", "ar")
            dbmod.execute("UPDATE users SET full_name=?, locale=? WHERE id=?", (full_name, locale, g.user["id"]))
            session["locale"] = locale
            flash("تم حفظ الإعدادات." if g.locale == "ar" else "Settings saved.", "success")
        elif action == "password":
            current = request.form.get("current_password", "")
            new = request.form.get("new_password", "")
            if not check_password_hash(g.user["password_hash"], current):
                flash("كلمة المرور الحالية غير صحيحة." if g.locale == "ar" else "Current password incorrect.", "error")
            elif len(new) < 6:
                flash("كلمة المرور الجديدة قصيرة جدًا." if g.locale == "ar" else "New password too short.", "error")
            else:
                dbmod.execute(
                    "UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(new), g.user["id"])
                )
                flash("تم تغيير كلمة المرور." if g.locale == "ar" else "Password changed.", "success")
        return redirect(url_for("dashboard.settings"))
    return render_template("dashboard/settings.html")
