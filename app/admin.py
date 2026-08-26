import time
from flask import Blueprint, render_template, request, redirect, url_for, g, flash
from . import db as dbmod
from .utils import admin_required

bp = Blueprint("admin", __name__, url_prefix="/admin")


@bp.route("/")
@admin_required
def home():
    stats = {
        "users": dbmod.query("SELECT COUNT(*) c FROM users", one=True)["c"],
        "cards": dbmod.query("SELECT COUNT(*) c FROM cards", one=True)["c"],
        "views": dbmod.query("SELECT COUNT(*) c FROM analytics_events WHERE event_type='view'", one=True)["c"],
        "revenue": dbmod.query("SELECT COALESCE(SUM(amount),0) s FROM payments", one=True)["s"],
    }
    recent_users = dbmod.query("SELECT * FROM users ORDER BY created_at DESC LIMIT 8")
    return render_template("admin/home.html", stats=stats, recent_users=recent_users)


@bp.route("/users", methods=["GET", "POST"])
@admin_required
def users():
    if request.method == "POST":
        uid = request.form.get("user_id", type=int)
        action = request.form.get("action")
        if action == "suspend":
            dbmod.execute("UPDATE users SET suspended=1 WHERE id=?", (uid,))
        elif action == "unsuspend":
            dbmod.execute("UPDATE users SET suspended=0 WHERE id=?", (uid,))
        elif action == "delete":
            dbmod.execute("DELETE FROM users WHERE id=?", (uid,))
        elif action == "change_plan":
            plan_id = request.form.get("plan_id", type=int)
            dbmod.execute("UPDATE users SET plan_id=? WHERE id=?", (plan_id, uid))
        dbmod.execute(
            "INSERT INTO audit_logs (actor_id,action,meta,created_at) VALUES (?,?,?,?)",
            (g.user["id"], f"admin.users.{action}", str(uid), int(time.time())),
        )
        return redirect(url_for("admin.users"))
    all_users = dbmod.query("SELECT * FROM users ORDER BY created_at DESC")
    plans = dbmod.query("SELECT * FROM plans ORDER BY sort_order")
    return render_template("admin/users.html", users=all_users, plans=plans)


@bp.route("/cards")
@admin_required
def cards():
    all_cards = dbmod.query(
        """SELECT cards.*, users.email AS owner_email FROM cards
           JOIN users ON users.id = cards.user_id ORDER BY cards.created_at DESC"""
    )
    return render_template("admin/cards.html", cards=all_cards)


@bp.route("/cards/<int:card_id>/delete", methods=["POST"])
@admin_required
def delete_card(card_id):
    dbmod.execute("DELETE FROM cards WHERE id=?", (card_id,))
    return redirect(url_for("admin.cards"))


@bp.route("/plans", methods=["GET", "POST"])
@admin_required
def plans():
    if request.method == "POST":
        plan_id = request.form.get("plan_id", type=int)
        dbmod.execute(
            """UPDATE plans SET name=?, price_month=?, max_cards=?, max_api_requests_day=?,
               custom_domain=?, white_label=?, team_members=?, advanced_analytics=? WHERE id=?""",
            (
                request.form.get("name"), float(request.form.get("price_month", 0)),
                int(request.form.get("max_cards", 1)), int(request.form.get("max_api_requests_day", 100)),
                1 if request.form.get("custom_domain") == "on" else 0,
                1 if request.form.get("white_label") == "on" else 0,
                int(request.form.get("team_members", 1)),
                1 if request.form.get("advanced_analytics") == "on" else 0,
                plan_id,
            ),
        )
        flash("تم تحديث الخطة." if g.locale == "ar" else "Plan updated.", "success")
        return redirect(url_for("admin.plans"))
    all_plans = dbmod.query("SELECT * FROM plans ORDER BY sort_order")
    return render_template("admin/plans.html", plans=all_plans)


@bp.route("/api-usage")
@admin_required
def api_usage():
    keys = dbmod.query(
        """SELECT api_keys.*, users.email FROM api_keys
           JOIN users ON users.id = api_keys.user_id ORDER BY total_requests DESC"""
    )
    return render_template("admin/api_usage.html", keys=keys)


@bp.route("/templates")
@admin_required
def templates_admin():
    from .templates_data import TEMPLATES
    usage = dbmod.query("SELECT template, COUNT(*) c FROM cards GROUP BY template")
    usage_map = {u["template"]: u["c"] for u in usage}
    return render_template("admin/templates.html", templates=TEMPLATES, usage_map=usage_map)
