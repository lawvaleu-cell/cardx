import os
import time
from flask import Flask, g, session, request, redirect, url_for
from . import db as dbmod
from .i18n import t, RTL_LOCALES

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def create_app():
    app = Flask(__name__, instance_relative_config=True)
    app.config.update(
        SECRET_KEY=os.environ.get("CARDX_SECRET", "cardx-dev-secret-change-me"),
        DATABASE=os.path.join(BASE_DIR, "instance", "cardx.db"),
        MAX_CONTENT_LENGTH=8 * 1024 * 1024,  # 8MB upload cap
        UPLOAD_DIR=os.path.join(BASE_DIR, "instance", "uploads"),
        SITE_NAME="CardX",
        SITE_BASE_URL=os.environ.get("CARDX_BASE_URL", "http://127.0.0.1:5000"),
    )
    os.makedirs(app.config["UPLOAD_DIR"], exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, "instance"), exist_ok=True)

    dbmod.init_db(app)
    app.teardown_appcontext(dbmod.close_db)

    from .auth import bp as auth_bp
    from .cards import bp as cards_bp
    from .dashboard import bp as dashboard_bp
    from .admin import bp as admin_bp
    from .api import bp as api_bp
    from .site import bp as site_bp

    app.register_blueprint(site_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(cards_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(api_bp)

    @app.before_request
    def load_user():
        g.user = None
        uid = session.get("user_id")
        if uid:
            g.user = dbmod.query("SELECT * FROM users WHERE id=?", (uid,), one=True)
        g.locale = session.get("locale", (g.user["locale"] if g.user else "ar"))
        g.dark_mode = session.get("dark_mode", (bool(g.user["dark_mode"]) if g.user else False))
        g.rtl = g.locale in RTL_LOCALES

    @app.context_processor
    def inject_globals():
        return dict(
            t=lambda key: t(key, g.get("locale", "ar")),
            locale=g.get("locale", "ar"),
            rtl=g.get("rtl", True),
            current_user=g.get("user"),
            dark_mode=g.get("dark_mode", False),
            site_name=app.config["SITE_NAME"],
            now_ts=int(time.time()),
        )

    @app.template_filter("timestamp_to_date")
    def timestamp_to_date(ts):
        import datetime
        try:
            return datetime.datetime.fromtimestamp(int(ts)).strftime("%Y-%m-%d %H:%M")
        except Exception:
            return ""

    @app.route("/set-locale/<loc>")
    def set_locale(loc):
        if loc in ("ar", "en", "fr"):
            session["locale"] = loc
        return redirect(request.referrer or url_for("site.landing"))

    @app.route("/toggle-theme")
    def toggle_theme():
        session["dark_mode"] = not session.get("dark_mode", False)
        return redirect(request.referrer or url_for("site.landing"))

    @app.errorhandler(404)
    def not_found(e):
        from flask import render_template
        return render_template("404.html"), 404

    return app
