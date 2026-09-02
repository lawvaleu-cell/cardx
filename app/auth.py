import time
import secrets
from flask import Blueprint, render_template, request, redirect, url_for, session, flash, g
from werkzeug.security import generate_password_hash, check_password_hash
from . import db as dbmod

bp = Blueprint("auth", __name__, url_prefix="/auth")


@bp.route("/register", methods=["GET", "POST"])
def register():
    if g.get("user"):
        return redirect(url_for("dashboard.home"))
    if request.method == "POST":
        full_name = request.form.get("full_name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        error = None
        if not full_name or not email or not password:
            error = "الرجاء تعبئة جميع الحقول." if g.locale == "ar" else "Please fill in all fields."
        elif len(password) < 6:
            error = "كلمة المرور يجب ألا تقل عن 6 أحرف." if g.locale == "ar" else "Password must be at least 6 characters."
        elif dbmod.query("SELECT id FROM users WHERE email=?", (email,), one=True):
            error = "هذا البريد الإلكتروني مسجل بالفعل." if g.locale == "ar" else "Email already registered."

        if error:
            flash(error, "error")
            return render_template("auth/register.html")

        verify_token = secrets.token_urlsafe(24)
        user_id = dbmod.execute(
            """INSERT INTO users (email,password_hash,full_name,is_verified,verify_token,plan_id,locale,created_at)
               VALUES (?,?,?,0,?,1,?,?)""",
            (email, generate_password_hash(password), full_name, verify_token, g.locale, int(time.time())),
        )
        dbmod.execute(
            "INSERT INTO subscriptions (user_id,plan_id,status,started_at) VALUES (?,?,?,?)",
            (user_id, 1, "active", int(time.time())),
        )
        session["user_id"] = user_id
        session["pending_verify_token"] = verify_token
        flash(
            "تم إنشاء الحساب! فعّل بريدك الإلكتروني من الرابط أدناه (تجريبي: لا يوجد بريد فعلي مُرسل)."
            if g.locale == "ar" else
            "Account created! Verify your email using the link below (demo: no real email is sent).",
            "success",
        )
        return redirect(url_for("dashboard.home"))
    return render_template("auth/register.html")


@bp.route("/verify/<token>")
def verify_email(token):
    user = dbmod.query("SELECT * FROM users WHERE verify_token=?", (token,), one=True)
    if user:
        dbmod.execute("UPDATE users SET is_verified=1, verify_token=NULL WHERE id=?", (user["id"],))
        flash("تم تفعيل بريدك الإلكتروني بنجاح." if g.locale == "ar" else "Email verified successfully.", "success")
    else:
        flash("رابط التفعيل غير صالح." if g.locale == "ar" else "Invalid verification link.", "error")
    return redirect(url_for("dashboard.home") if g.get("user") else url_for("auth.login"))


@bp.route("/login", methods=["GET", "POST"])
def login():
    if g.get("user"):
        return redirect(url_for("dashboard.home"))
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        user = dbmod.query("SELECT * FROM users WHERE email=?", (email,), one=True)
        if user and check_password_hash(user["password_hash"], password):
            if user["suspended"]:
                flash("تم إيقاف هذا الحساب." if g.locale == "ar" else "This account has been suspended.", "error")
                return render_template("auth/login.html")
            session["user_id"] = user["id"]
            session["locale"] = user["locale"]
            dbmod.execute(
                "INSERT INTO sessions_meta (user_id,created_at) VALUES (?,?)",
                (user["id"], int(time.time())),
            )
            nxt = request.args.get("next")
            return redirect(nxt or url_for("dashboard.home"))
        flash("البريد الإلكتروني أو كلمة المرور غير صحيحة." if g.locale == "ar" else "Invalid email or password.", "error")
    return render_template("auth/login.html")


@bp.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("site.landing"))


@bp.route("/forgot", methods=["GET", "POST"])
def forgot():
    reset_link = None
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        user = dbmod.query("SELECT * FROM users WHERE email=?", (email,), one=True)
        if user:
            token = secrets.token_urlsafe(24)
            dbmod.execute(
                "UPDATE users SET reset_token=?, reset_expires=? WHERE id=?",
                (token, int(time.time()) + 3600, user["id"]),
            )
            reset_link = url_for("auth.reset_password", token=token, _external=True)
        flash(
            "إذا كان البريد الإلكتروني مسجلاً، سيظهر رابط إعادة التعيين أدناه (تجريبي: لا يوجد بريد فعلي)."
            if g.locale == "ar" else
            "If that email is registered, a reset link appears below (demo: no real email is sent).",
            "success",
        )
    return render_template("auth/forgot.html", reset_link=reset_link)


@bp.route("/reset/<token>", methods=["GET", "POST"])
def reset_password(token):
    user = dbmod.query(
        "SELECT * FROM users WHERE reset_token=? AND reset_expires > ?", (token, int(time.time())), one=True
    )
    if not user:
        flash("رابط إعادة التعيين منتهي أو غير صالح." if g.locale == "ar" else "Reset link invalid or expired.", "error")
        return redirect(url_for("auth.forgot"))
    if request.method == "POST":
        password = request.form.get("password", "")
        if len(password) < 6:
            flash("كلمة المرور قصيرة جدًا." if g.locale == "ar" else "Password too short.", "error")
            return render_template("auth/reset.html", token=token)
        dbmod.execute(
            "UPDATE users SET password_hash=?, reset_token=NULL, reset_expires=NULL WHERE id=?",
            (generate_password_hash(password), user["id"]),
        )
        flash("تم تغيير كلمة المرور، سجّل الدخول الآن." if g.locale == "ar" else "Password updated, please log in.", "success")
        return redirect(url_for("auth.login"))
    return render_template("auth/reset.html", token=token)
