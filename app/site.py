from flask import Blueprint, render_template, g, redirect, url_for
from . import db as dbmod
from .templates_data import TEMPLATES

bp = Blueprint("site", __name__)


@bp.route("/")
def landing():
    if g.get("user"):
        return redirect(url_for("dashboard.home"))
    return render_template("landing.html", templates=TEMPLATES[:5])


@bp.route("/templates")
def templates_gallery():
    return render_template("templates_gallery.html", templates=TEMPLATES)


@bp.route("/pricing")
def pricing():
    plans = dbmod.query("SELECT * FROM plans ORDER BY sort_order")
    return render_template("pricing.html", plans=plans)


@bp.route("/docs")
def docs():
    return render_template("docs.html")
