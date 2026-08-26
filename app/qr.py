"""
QR code generation for CardX.

Uses the standard `qrcode` package (declared in requirements.txt and
auto-installed by run.py on first launch). We deliberately do NOT ship a
hand-rolled QR encoder: QR codes follow a strict, unforgiving bit-level spec
(Reed-Solomon error correction, mask scoring, format/version info), and a
subtly-wrong implementation would silently produce codes that *look* right
but fail to scan — worse than a normal, well-tested library dependency.
"""
import io

try:
    import qrcode
    from qrcode.constants import ERROR_CORRECT_M
    QR_AVAILABLE = True
except ImportError:  # pragma: no cover
    QR_AVAILABLE = False


def render_png(text, box_size=10, border=3, fg="#0F0F14", bg="#FFFFFF"):
    """Return a BytesIO PNG buffer encoding `text`."""
    if not QR_AVAILABLE:
        raise RuntimeError(
            "Missing dependency 'qrcode'. Run: pip install -r requirements.txt"
        )
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color=fg, back_color=bg)
    buf = io.BytesIO()
    try:
        img.save(buf, format="PNG")
    except TypeError:
        # some qrcode/Pillow version combinations don't forward the
        # `format` kwarg through the PilImage wrapper — fall back to the
        # underlying PIL image if needed.
        if hasattr(img, "get_image"):
            img.get_image().save(buf, format="PNG")
        else:
            img.save(buf)
    buf.seek(0)
    return buf
