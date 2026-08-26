# CardX — Digital Business Card Platform

CardX is a full-stack SaaS-style platform for creating, customizing and
sharing digital business cards — with a Developer API, webhooks, teams,
analytics, an admin panel, and internal billing. It runs entirely locally
with a single command, no Docker and no external services required.

## Quick start

```bash
python run.py
```

That's it. On first run this will:

1. Install missing Python dependencies from `requirements.txt` (this is the
   **only** step that needs internet — a normal, one-time `pip install`,
   exactly like any Python project. Everything after that runs 100% offline).
2. Create and seed the local SQLite database at `instance/cardx.db`.
3. Start the server at **http://127.0.0.1:5000**.
4. Open your browser automatically.

Requires Python 3.9+.

**Demo admin login:** `admin@cardx.local` / `admin123`

## What's actually functional (no mocks)

Everything below performs real work against a real local SQLite database —
none of it is placeholder/mock data (except the illustrative "Solomon
Smith / Sharon Fernandes" sample people shown on the marketing landing page,
which the brief explicitly asked for as demo showcase content):

- **Auth** — real password hashing (Werkzeug/PBKDF2), sessions, password
  reset (a real single-use token, shown on-screen instead of emailed —
  see *Known simplifications* below).
- **Card Builder** — every field, color, template, section, and social
  link is persisted to the database and immediately reflected on the
  public card page.
- **10 distinct templates** — genuinely different layouts (centered,
  cover-hero, side-profile, dark-luxury, glass, asymmetric), not just
  recolors — see `app/templates_data.py` + `app/static/css/card-templates.css`.
- **Public card pages** (`/c/<username>`) — real mini-websites with
  working call/email/WhatsApp/website buttons, social links, and
  section visibility/ordering controlled by the owner.
- **QR codes** — generated with the standard `qrcode` library, permanent
  per card, downloadable.
- **vCard (.vcf)** — generated on the fly from real card data, downloadable
  and directly saveable as a phone contact.
- **Analytics** — real event logging (views, QR scans, clicks, contacts
  saved) to SQLite, visualized with dependency-free server-rendered SVG
  charts (no external JS charting library, no CDN required).
- **Developer REST API** (`/api/v1/...`) — full CRUD on cards, real
  API-key authentication (SHA-256 hashed, never stored in plaintext),
  per-plan daily rate limiting, real analytics endpoint.
- **Webhooks** — real signed HTTP POST requests fired to whatever URL you
  register, for `card.created`, `card.updated`, `card.viewed`,
  `qr.scanned`, `contact.saved`, `link.clicked`.
- **Teams** — real workspace creation, member invites, aggregated stats.
- **Admin panel** — manage users (suspend/delete/change plan), cards,
  pricing plans (editable limits/prices, reflected live on `/pricing`),
  and API usage.
- **Multi-language** — Arabic (RTL), English, French, switchable at
  runtime, persisted per-session.
- **Dark mode** — real theme toggle, persisted per-session.
- **Image uploads** — validated, re-encoded through Pillow (rejects
  corrupt/invalid files), resized and optimized.

## Known simplifications (stated plainly, not hidden)

A handful of things cannot be *real* inside a project that must run
locally with zero external services and zero paid accounts. These are
implemented as clearly-labeled, functional internal simulations rather
than fake UI:

- **Billing** — there is no real Stripe/PayPal integration (that would
  require a merchant account and API keys that don't belong to this
  project). Plan upgrades/downgrades are real database operations with
  real plan-limit enforcement (e.g. the Free plan really is capped at 1
  card, really enforced on both the UI and the API) — just without an
  external card-payment step. This is clearly labeled in the Billing
  page.
- **Email** — there's no SMTP server configured, so verification and
  password-reset links are shown directly in the UI instead of emailed.
  The tokens themselves are real, single-use, and expire normally — wiring
  in a real SMTP/provider (e.g. via `smtplib` or an email API) later is a
  small, isolated change in `app/auth.py`.
- **Custom domains** — the data model (`domains` table) and plan gating
  exist, but actually pointing a real DNS domain at this app requires a
  real public deployment, which is outside the scope of "runs locally."
- **QR encoding** — uses the standard, widely-used `qrcode` Python package
  rather than a hand-rolled encoder. QR codes follow an unforgiving
  bit-level spec; a subtly-wrong custom implementation would produce
  codes that *look* right but fail to scan, which is worse than a
  normal library dependency.

Nothing else is faked — if a feature is listed as working above, it is
wired to the real database and will behave the same after you close and
reopen the app.

## Project structure

```
CardX/
├── run.py                  # single entrypoint
├── requirements.txt
├── app/
│   ├── __init__.py         # Flask app factory
│   ├── db.py                # SQLite schema + helpers (auto-migrates)
│   ├── auth.py               # register/login/reset/verify
│   ├── cards.py               # builder, public card page, QR, vCard
│   ├── dashboard.py            # user dashboard (analytics, team, billing...)
│   ├── admin.py                 # admin panel
│   ├── api.py                    # REST API v1 + webhooks trigger points
│   ├── site.py                    # landing, templates gallery, pricing, docs
│   ├── qr.py, vcard.py, charts.py, i18n.py, templates_data.py, utils.py
│   ├── static/css/...              # design system + card template layouts
│   ├── static/js/...                # builder live-preview, small helpers
│   └── templates/...                 # Jinja2 templates
└── instance/
    └── cardx.db              # created automatically on first run
```

## Environment variables (optional)

| Variable            | Default                | Purpose                          |
|---------------------|-------------------------|-----------------------------------|
| `CARDX_SECRET`       | dev secret              | Flask session secret key          |
| `CARDX_HOST`          | `127.0.0.1`             | Bind host                         |
| `CARDX_PORT`           | `5000`                  | Bind port                         |
| `CARDX_NO_BROWSER`      | unset                   | Set to `1` to skip auto-opening a browser |
| `CARDX_BASE_URL`         | `http://127.0.0.1:5000` | Used for generated absolute links |

## Moving to another machine

Copy the whole `CardX/` folder (or zip/unzip it) and run `python run.py`
again — dependencies re-install automatically if missing, and a fresh
database is created if `instance/cardx.db` isn't present.

## Testing performed before delivery

- Full request/response test suite exercised: landing, templates gallery,
  pricing, docs, registration, login, dashboard, card creation across all
  10 templates, public card rendering, QR image generation, vCard
  download, social link editing, REST API (create/list/get/update/delete
  + rate limiting + invalid-key handling + plan-limit enforcement), real
  webhook HTTP delivery to a local test receiver, admin panel (users,
  cards, plans, API usage), locale switching (AR/EN/FR + RTL/LTR), and
  dark mode.
- The real `python run.py` process was started and hit with real `curl`
  HTTP requests end-to-end (registration → card creation → public page →
  QR → vCard) to confirm the single-command startup path genuinely works,
  not just the internal test client.
