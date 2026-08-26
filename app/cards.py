import time
import os
import json
from flask import (
    Blueprint, render_template, request, redirect, url_for, g, flash,
    send_file, abort, jsonify, current_app
)
from PIL import Image
from . import db as dbmod
from .utils import login_required, can_create_card, log_event, slugify_username, fire_webhook
from .templates_data import TEMPLATES, TEMPLATES_BY_SLUG, SECTION_LABELS, SOCIAL_PLATFORMS
from .qr import render_png
from .vcard import build_vcard

bp = Blueprint("cards", __name__)


def _unique_username(base):
    base = slugify_username(base)
    candidate = base
    i = 1
    while dbmod.query("SELECT id FROM cards WHERE username=?", (candidate,), one=True):
        i += 1
        candidate = f"{base}{i}"
    return candidate


@bp.route("/cards/new", methods=["GET", "POST"])
@login_required
def new_card():
    if not can_create_card(g.user):
        flash(
            "لقد وصلت للحد الأقصى من البطاقات في خطتك الحالية. قم بترقية خطتك."
            if g.locale == "ar" else
            "You've reached your plan's card limit. Please upgrade.",
            "error",
        )
        return redirect(url_for("dashboard.billing"))

    if request.method == "POST":
        first_name = request.form.get("first_name", "").strip()
        last_name = request.form.get("last_name", "").strip()
        template = request.form.get("template", "minimal")
        if template not in TEMPLATES_BY_SLUG:
            template = "minimal"
        tpl = TEMPLATES_BY_SLUG[template]
        username = _unique_username(request.form.get("username") or f"{first_name}{last_name}" or "card")
        now = int(time.time())
        card_id = dbmod.execute(
            """INSERT INTO cards (uid,user_id,username,template,first_name,last_name,job_title,company,
               primary_color,accent_color,bg_color,text_color,avatar_shape,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (dbmod.new_uid("card"), g.user["id"], username, template, first_name, last_name,
             request.form.get("job_title", "").strip(), request.form.get("company", "").strip(),
             tpl["primary_color"], tpl["accent_color"],
             tpl["bg_color"] if not tpl["bg_color"].startswith("gradient") else "#FFFFFF",
             tpl["text_color"], tpl["avatar_shape"], now, now),
        )
        fire_webhook(g.user["id"], "card.created", {"card_id": card_id, "username": username})
        return redirect(url_for("cards.builder", card_id=card_id))

    return render_template("dashboard/new_card.html", templates=TEMPLATES)


def _get_owned_card(card_id):
    card = dbmod.query("SELECT * FROM cards WHERE id=?", (card_id,), one=True)
    if not card or (card["user_id"] != g.user["id"] and not g.user["is_admin"]):
        abort(404)
    return card


@bp.route("/cards/<int:card_id>/builder")
@login_required
def builder(card_id):
    card = _get_owned_card(card_id)
    links = dbmod.query("SELECT * FROM social_links WHERE card_id=? ORDER BY sort_order", (card_id,))
    content = dbmod.query("SELECT * FROM card_content WHERE card_id=? ORDER BY sort_order", (card_id,))
    tpl = TEMPLATES_BY_SLUG.get(card["template"], TEMPLATES_BY_SLUG["minimal"])
    return render_template(
        "dashboard/builder.html", card=card, links=links, content={c["section"]: c for c in content},
        templates=TEMPLATES, section_labels=SECTION_LABELS, social_platforms=SOCIAL_PLATFORMS,
        tpl_layout=tpl["layout"],
    )


@bp.route("/cards/<int:card_id>/update", methods=["POST"])
@login_required
def update_card(card_id):
    card = _get_owned_card(card_id)
    f = request.form
    fields = [
        "first_name", "last_name", "job_title", "company", "bio", "phone", "whatsapp",
        "email", "website", "address", "template", "primary_color", "accent_color",
        "bg_color", "text_color", "button_style", "radius", "shadow", "avatar_shape",
        "seo_title", "seo_description",
    ]
    updates, values = [], []
    for field in fields:
        if field in f:
            updates.append(f"{field}=?")
            values.append(f.get(field, "").strip())
    updates.append("is_published=?")
    values.append(1 if f.get("is_published") == "on" else 0)
    updates.append("seo_index=?")
    values.append(1 if f.get("seo_index") == "on" else 0)
    updates.append("updated_at=?")
    values.append(int(time.time()))
    values.append(card_id)
    dbmod.execute(f"UPDATE cards SET {', '.join(updates)} WHERE id=?", values)
    fire_webhook(g.user["id"], "card.updated", {"card_id": card_id})
    flash("تم حفظ التغييرات." if g.locale == "ar" else "Changes saved.", "success")
    return redirect(url_for("cards.builder", card_id=card_id))


@bp.route("/cards/<int:card_id>/sections", methods=["POST"])
@login_required
def update_sections(card_id):
    card = _get_owned_card(card_id)
    data = request.get_json(force=True)
    order = ",".join(data.get("order", []))
    visible = ",".join(data.get("visible", []))
    dbmod.execute(
        "UPDATE cards SET sections_order=?, sections_visible=?, updated_at=? WHERE id=?",
        (order, visible, int(time.time()), card_id),
    )
    return jsonify({"ok": True})


@bp.route("/cards/<int:card_id>/social", methods=["POST"])
@login_required
def update_social(card_id):
    card = _get_owned_card(card_id)
    dbmod.execute("DELETE FROM social_links WHERE card_id=?", (card_id,))
    platforms = request.form.getlist("platform[]")
    urls = request.form.getlist("url[]")
    for i, (p, u) in enumerate(zip(platforms, urls)):
        if u.strip():
            dbmod.execute(
                "INSERT INTO social_links (card_id,platform,url,sort_order) VALUES (?,?,?,?)",
                (card_id, p, u.strip(), i),
            )
    flash("تم تحديث روابط التواصل." if g.locale == "ar" else "Social links updated.", "success")
    return redirect(url_for("cards.builder", card_id=card_id) + "#social")


@bp.route("/cards/<int:card_id>/content", methods=["POST"])
@login_required
def update_content(card_id):
    card = _get_owned_card(card_id)
    section = request.form.get("section")
    title = request.form.get("title", "").strip()
    body = request.form.get("body", "").strip()
    existing = dbmod.query(
        "SELECT id FROM card_content WHERE card_id=? AND section=?", (card_id, section), one=True
    )
    if existing:
        dbmod.execute(
            "UPDATE card_content SET title=?, body=? WHERE id=?", (title, body, existing["id"])
        )
    else:
        dbmod.execute(
            "INSERT INTO card_content (card_id,section,title,body,sort_order) VALUES (?,?,?,?,0)",
            (card_id, section, title, body),
        )
    flash("تم الحفظ." if g.locale == "ar" else "Saved.", "success")
    return redirect(url_for("cards.builder", card_id=card_id) + f"#{section}")


@bp.route("/cards/<int:card_id>/upload", methods=["POST"])
@login_required
def upload_image(card_id):
    card = _get_owned_card(card_id)
    kind = request.form.get("kind", "avatar")
    file = request.files.get("image")
    if not file or file.filename == "":
        flash("لم يتم اختيار صورة." if g.locale == "ar" else "No image selected.", "error")
        return redirect(url_for("cards.builder", card_id=card_id))

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp"):
        flash("صيغة الصورة غير مدعومة." if g.locale == "ar" else "Unsupported image format.", "error")
        return redirect(url_for("cards.builder", card_id=card_id))

    try:
        img = Image.open(file.stream)
        img.verify()
        file.stream.seek(0)
        img = Image.open(file.stream).convert("RGB")
    except Exception:
        flash("الصورة تالفة أو غير صالحة." if g.locale == "ar" else "Invalid or corrupted image.", "error")
        return redirect(url_for("cards.builder", card_id=card_id))

    max_dim = 800 if kind == "avatar" else 1600
    img.thumbnail((max_dim, max_dim))
    filename = f"{card['uid']}_{kind}_{int(time.time())}.jpg"
    path = os.path.join(current_app.config["UPLOAD_DIR"], filename)
    img.save(path, "JPEG", quality=87)

    url_path = f"/media/{filename}"
    field = "avatar_url" if kind == "avatar" else "cover_url"
    dbmod.execute(f"UPDATE cards SET {field}=?, updated_at=? WHERE id=?", (url_path, int(time.time()), card_id))
    flash("تم رفع الصورة." if g.locale == "ar" else "Image uploaded.", "success")
    return redirect(url_for("cards.builder", card_id=card_id))


@bp.route("/media/<path:filename>")
def media(filename):
    path = os.path.join(current_app.config["UPLOAD_DIR"], filename)
    if not os.path.isfile(path):
        abort(404)
    return send_file(path)


@bp.route("/cards/<int:card_id>/delete", methods=["POST"])
@login_required
def delete_card(card_id):
    card = _get_owned_card(card_id)
    dbmod.execute("DELETE FROM cards WHERE id=?", (card_id,))
    dbmod.execute("DELETE FROM social_links WHERE card_id=?", (card_id,))
    dbmod.execute("DELETE FROM card_content WHERE card_id=?", (card_id,))
    flash("تم حذف البطاقة." if g.locale == "ar" else "Card deleted.", "success")
    return redirect(url_for("dashboard.my_cards"))


# ---------------------------------------------------------------------------
# Public card page + QR + vCard
# ---------------------------------------------------------------------------

@bp.route("/c/<username>")
def public_card(username):
    card = dbmod.query("SELECT * FROM cards WHERE username=?", (username,), one=True)
    if not card or not card["is_published"]:
        abort(404)
    tpl = TEMPLATES_BY_SLUG.get(card["template"], TEMPLATES_BY_SLUG["minimal"])
    links = dbmod.query("SELECT * FROM social_links WHERE card_id=? ORDER BY sort_order", (card["id"],))
    content_rows = dbmod.query("SELECT * FROM card_content WHERE card_id=?", (card["id"],))
    content = {c["section"]: c for c in content_rows}
    order = [s for s in card["sections_order"].split(",") if s]
    visible = set(card["sections_visible"].split(","))
    log_event(card["id"], "view")
    return render_template(
        "public_card.html", card=card, tpl=tpl, links=links, content=content,
        order=order, visible=visible, section_labels=SECTION_LABELS,
        base_url=request.url_root.rstrip("/"),
    )


@bp.route("/c/<username>/click/<channel>")
def track_click(username, channel):
    card = dbmod.query("SELECT * FROM cards WHERE username=?", (username,), one=True)
    if not card:
        abort(404)
    log_event(card["id"], "click", meta=channel)
    dest_map = {
        "call": f"tel:{card['phone']}",
        "whatsapp": f"https://wa.me/{(card['whatsapp'] or card['phone']).replace('+', '').replace(' ', '')}",
        "email": f"mailto:{card['email']}",
        "website": card["website"] if card["website"].startswith("http") else f"https://{card['website']}",
    }
    dest = dest_map.get(channel)
    if not dest:
        link = dbmod.query(
            "SELECT * FROM social_links WHERE card_id=? AND platform=?", (card["id"], channel), one=True
        )
        dest = link["url"] if link else url_for("cards.public_card", username=username)
    return redirect(dest)


@bp.route("/c/<username>/qr.png")
def card_qr(username):
    card = dbmod.query("SELECT * FROM cards WHERE username=?", (username,), one=True)
    if not card:
        abort(404)
    log_event(card["id"], "qr_scan")
    url = url_for("cards.public_card", username=username, _external=True)
    buf = render_png(url, box_size=10, fg=card["primary_color"] or "#0F0F14")
    return send_file(buf, mimetype="image/png", download_name=f"cardx-{username}-qr.png")


@bp.route("/c/<username>/vcard.vcf")
def card_vcard(username):
    card = dbmod.query("SELECT * FROM cards WHERE username=?", (username,), one=True)
    if not card:
        abort(404)
    links = dbmod.query("SELECT * FROM social_links WHERE card_id=?", (card["id"],))
    log_event(card["id"], "contact_saved")
    vcf = build_vcard(card, links)
    from io import BytesIO
    buf = BytesIO(vcf.encode("utf-8"))
    return send_file(
        buf, mimetype="text/vcard",
        download_name=f"{card['first_name']}_{card['last_name']}.vcf".strip("_"), as_attachment=True,
    )
