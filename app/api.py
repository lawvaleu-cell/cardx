import time
from flask import Blueprint, request, jsonify, g, url_for
from . import db as dbmod
from .utils import require_api_key, can_create_card, log_event, slugify_username, fire_webhook
from .templates_data import TEMPLATES_BY_SLUG
from .qr import render_png

bp = Blueprint("api", __name__, url_prefix="/api/v1")


def _unique_username(base):
    base = slugify_username(base)
    candidate = base
    i = 1
    while dbmod.query("SELECT id FROM cards WHERE username=?", (candidate,), one=True):
        i += 1
        candidate = f"{base}{i}"
    return candidate


def _card_to_json(card):
    return {
        "id": card["uid"],
        "username": card["username"],
        "url": url_for("cards.public_card", username=card["username"], _external=True),
        "qr_code": url_for("cards.card_qr", username=card["username"], _external=True),
        "template": card["template"],
        "name": f"{card['first_name']} {card['last_name']}".strip(),
        "job_title": card["job_title"],
        "company": card["company"],
        "phone": card["phone"],
        "email": card["email"],
        "website": card["website"],
        "status": "active" if card["is_published"] else "draft",
        "created_at": card["created_at"],
        "updated_at": card["updated_at"],
    }


@bp.route("/cards", methods=["POST"])
@require_api_key
def create_card():
    if not can_create_card(g.api_user):
        return jsonify({"error": "plan_limit_reached"}), 402
    data = request.get_json(force=True, silent=True) or {}
    name = data.get("name", "").strip()
    parts = name.split(" ", 1)
    first_name, last_name = (parts[0], parts[1] if len(parts) > 1 else "")
    template = data.get("template", "minimal")
    if template not in TEMPLATES_BY_SLUG:
        template = "minimal"
    tpl = TEMPLATES_BY_SLUG[template]
    username = _unique_username(data.get("username") or name or "card")
    now = int(time.time())
    card_id = dbmod.execute(
        """INSERT INTO cards (uid,user_id,username,template,first_name,last_name,job_title,company,
           phone,email,website,primary_color,accent_color,text_color,avatar_shape,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (dbmod.new_uid("card"), g.api_user["id"], username, template, first_name, last_name,
         data.get("title", ""), data.get("company", ""), data.get("phone", ""), data.get("email", ""),
         data.get("website", ""), tpl["primary_color"], tpl["accent_color"], tpl["text_color"],
         tpl["avatar_shape"], now, now),
    )
    card = dbmod.query("SELECT * FROM cards WHERE id=?", (card_id,), one=True)
    fire_webhook(g.api_user["id"], "card.created", {"card_id": card_id, "username": username})
    return jsonify(_card_to_json(card)), 201


@bp.route("/cards", methods=["GET"])
@require_api_key
def list_cards():
    cards = dbmod.query("SELECT * FROM cards WHERE user_id=? ORDER BY created_at DESC", (g.api_user["id"],))
    return jsonify({"data": [_card_to_json(c) for c in cards], "count": len(cards)})


def _get_api_card(uid):
    card = dbmod.query("SELECT * FROM cards WHERE uid=? AND user_id=?", (uid, g.api_user["id"]), one=True)
    return card


@bp.route("/cards/<card_uid>", methods=["GET"])
@require_api_key
def get_card(card_uid):
    card = _get_api_card(card_uid)
    if not card:
        return jsonify({"error": "not_found"}), 404
    return jsonify(_card_to_json(card))


@bp.route("/cards/<card_uid>", methods=["PUT"])
@require_api_key
def update_card_api(card_uid):
    card = _get_api_card(card_uid)
    if not card:
        return jsonify({"error": "not_found"}), 404
    data = request.get_json(force=True, silent=True) or {}
    allowed = {
        "job_title": "job_title", "title": "job_title", "company": "company",
        "phone": "phone", "email": "email", "website": "website",
    }
    updates, values = [], []
    for key, col in allowed.items():
        if key in data:
            updates.append(f"{col}=?")
            values.append(data[key])
    if "name" in data:
        parts = data["name"].split(" ", 1)
        updates += ["first_name=?", "last_name=?"]
        values += [parts[0], parts[1] if len(parts) > 1 else ""]
    if not updates:
        return jsonify({"error": "no_fields_to_update"}), 400
    updates.append("updated_at=?")
    values.append(int(time.time()))
    values.append(card["id"])
    dbmod.execute(f"UPDATE cards SET {', '.join(updates)} WHERE id=?", values)
    card = dbmod.query("SELECT * FROM cards WHERE id=?", (card["id"],), one=True)
    fire_webhook(g.api_user["id"], "card.updated", {"card_id": card["id"]})
    return jsonify(_card_to_json(card))


@bp.route("/cards/<card_uid>", methods=["DELETE"])
@require_api_key
def delete_card_api(card_uid):
    card = _get_api_card(card_uid)
    if not card:
        return jsonify({"error": "not_found"}), 404
    dbmod.execute("DELETE FROM cards WHERE id=?", (card["id"],))
    return jsonify({"deleted": True})


@bp.route("/cards/<card_uid>/analytics", methods=["GET"])
@require_api_key
def card_analytics_api(card_uid):
    card = _get_api_card(card_uid)
    if not card:
        return jsonify({"error": "not_found"}), 404
    out = {}
    for ev in ("view", "qr_scan", "click", "contact_saved"):
        out[ev] = dbmod.query(
            "SELECT COUNT(*) c FROM analytics_events WHERE card_id=? AND event_type=?",
            (card["id"], ev), one=True,
        )["c"]
    return jsonify({"card_id": card_uid, "stats": out})


@bp.route("/cards/<card_uid>/qr", methods=["POST", "GET"])
@require_api_key
def card_qr_api(card_uid):
    card = _get_api_card(card_uid)
    if not card:
        return jsonify({"error": "not_found"}), 404
    return jsonify({
        "qr_url": url_for("cards.card_qr", username=card["username"], _external=True),
        "card_url": url_for("cards.public_card", username=card["username"], _external=True),
    })


@bp.route("/cards/<card_uid>/contact", methods=["POST"])
@require_api_key
def card_contact_api(card_uid):
    card = _get_api_card(card_uid)
    if not card:
        return jsonify({"error": "not_found"}), 404
    return jsonify({
        "vcard_url": url_for("cards.card_vcard", username=card["username"], _external=True),
    })
