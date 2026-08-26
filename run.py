#!/usr/bin/env python3
"""
CardX — single entrypoint.

    python run.py

This script:
  1. Ensures all Python dependencies from requirements.txt are installed
     (installs them automatically on first run — needs internet ONCE).
     If your system Python refuses direct installs ("externally managed
     environment" / PEP 668, common on newer Debian/Ubuntu), it
     automatically creates a local virtual environment in .venv/ and
     re-launches itself from there — no manual venv steps needed.
  2. Creates and seeds the local SQLite database on first launch.
  3. Starts the Flask development server.
  4. Opens your browser to the app automatically.

No Docker, no external services, no separate setup commands required.
"""
import os
import sys
import subprocess
import importlib
import threading
import time
import webbrowser

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_DIR = os.path.join(BASE_DIR, ".venv")
REQUIRED_MODULES = {
    "flask": "Flask",
    "werkzeug": "Werkzeug",
    "PIL": "Pillow",
    "qrcode": "qrcode",
}
HOST = os.environ.get("CARDX_HOST", "127.0.0.1")
PORT = int(os.environ.get("CARDX_PORT", "5000"))


def _missing_modules():
    missing = []
    for module_name, pip_name in REQUIRED_MODULES.items():
        try:
            importlib.import_module(module_name)
        except ImportError:
            missing.append(pip_name)
    return missing


def _venv_python():
    if os.name == "nt":
        return os.path.join(VENV_DIR, "Scripts", "python.exe")
    return os.path.join(VENV_DIR, "bin", "python3")


def _pip_install(python_exe, extra_args=None):
    req_file = os.path.join(BASE_DIR, "requirements.txt")
    cmd = [python_exe, "-m", "pip", "install", "-r", req_file]
    if extra_args:
        cmd += extra_args
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)


def _friendly_failure(output):
    print("\n[CardX] \u2717 Could not install required Python packages automatically.\n")
    print("This is almost always one of two things:")
    print("  1) No internet connection is available right now (pip needs")
    print("     internet the very first time you run CardX, to download")
    print("     Flask/Pillow/qrcode -- after that it runs fully offline).")
    print("  2) Your Python installation blocks package installs and the")
    print("     automatic virtual-environment fallback also failed.\n")
    print("What to try:")
    print("  - Check your internet connection and run `python run.py` again.")
    print("  - Or install manually:")
    print(f"      python3 -m venv {VENV_DIR}")
    if os.name == "nt":
        print(f"      {VENV_DIR}\\Scripts\\pip install -r requirements.txt")
        print(f"      {VENV_DIR}\\Scripts\\python run.py")
    else:
        print(f"      {VENV_DIR}/bin/pip install -r requirements.txt")
        print(f"      {VENV_DIR}/bin/python run.py")
    print("\n--- pip output ---")
    print(output.strip()[-2000:])
    sys.exit(1)


def ensure_dependencies():
    missing = _missing_modules()
    if not missing:
        print("[CardX] All dependencies already satisfied.")
        return

    print(f"[CardX] Installing missing dependencies: {', '.join(missing)} ...")

    # Attempt 1: plain install into the current interpreter's environment.
    result = _pip_install(sys.executable)
    if result.returncode == 0 and not _missing_modules():
        print("[CardX] Dependencies installed.")
        return

    externally_managed = "externally-managed-environment" in (result.stdout or "")

    # Attempt 2: same interpreter, forcing the install (works on most
    # Debian/Ubuntu systems that flag themselves as "externally managed"
    # but still allow this override).
    if externally_managed:
        print("[CardX] System Python is externally managed -- retrying with --break-system-packages ...")
        result2 = _pip_install(sys.executable, extra_args=["--break-system-packages"])
        if result2.returncode == 0 and not _missing_modules():
            print("[CardX] Dependencies installed.")
            return
        result = result2

    # Attempt 3: create an isolated virtual environment and re-exec CardX
    # from inside it. This is the most robust path for locked-down system
    # Pythons, and needs no manual steps from the user.
    print("[CardX] Falling back to a local virtual environment (.venv) ...")
    try:
        if not os.path.isdir(VENV_DIR):
            subprocess.run([sys.executable, "-m", "venv", VENV_DIR], check=True)
        venv_python = _venv_python()
        result3 = _pip_install(venv_python)
        if result3.returncode == 0:
            print("[CardX] Dependencies installed inside .venv -- restarting CardX ...")
            os.execv(venv_python, [venv_python, os.path.abspath(__file__)] + sys.argv[1:])
        else:
            _friendly_failure(result3.stdout or "")
    except Exception as exc:  # venv creation itself failed (e.g. no venv module, no disk space)
        _friendly_failure(f"{result.stdout or ''}\n\nVirtualenv fallback error: {exc}")


def open_browser_later(url, delay=1.4):
    def _open():
        time.sleep(delay)
        try:
            webbrowser.open(url)
        except Exception:
            pass
    threading.Thread(target=_open, daemon=True).start()


def main():
    print("=" * 60)
    print("  CardX -- Digital Business Card Platform")
    print("=" * 60)

    ensure_dependencies()

    sys.path.insert(0, BASE_DIR)
    from app import create_app  # noqa: E402  (import after deps are guaranteed present)

    app = create_app()

    url = f"http://{HOST}:{PORT}"
    print("[CardX] Database ready at instance/cardx.db")
    print(f"[CardX] Starting server at {url}")
    print("[CardX] Admin login -> admin@cardx.local / admin123")
    print("[CardX] Press CTRL+C to stop.")

    if os.environ.get("CARDX_NO_BROWSER") != "1":
        open_browser_later(url)

    app.run(host=HOST, port=PORT, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
