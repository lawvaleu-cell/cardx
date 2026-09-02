"""Tiny dependency-free SVG chart renderer for the analytics dashboard."""


def line_chart(labels, values, width=560, height=200, color="#4F3FF0", fill="#EEECFF"):
    if not values:
        values = [0]
    if not labels:
        labels = [""] * len(values)
    pad_l, pad_r, pad_t, pad_b = 10, 10, 16, 26
    w = width - pad_l - pad_r
    h = height - pad_t - pad_b
    vmax = max(max(values), 1)
    n = len(values)
    step = w / max(n - 1, 1)

    points = []
    for i, v in enumerate(values):
        x = pad_l + i * step
        y = pad_t + h - (v / vmax) * h
        points.append((x, y))

    path_d = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    area_d = path_d + f" L {points[-1][0]:.1f},{pad_t+h:.1f} L {points[0][0]:.1f},{pad_t+h:.1f} Z"

    circles = "".join(
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="{color}" />' for x, y in points
    )
    label_svgs = "".join(
        f'<text x="{pad_l + i*step:.1f}" y="{height-6}" font-size="10" text-anchor="middle">{lbl}</text>'
        for i, lbl in enumerate(labels)
    )

    return f'''<svg viewBox="0 0 {width} {height}" width="100%" height="{height}" xmlns="http://www.w3.org/2000/svg">
  <path d="{area_d}" fill="{fill}" opacity="0.5" />
  <path d="{path_d}" fill="none" stroke="{color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
  {circles}
  {label_svgs}
</svg>'''


def bar_chart(labels, values, width=560, height=220, color="#FF6A45"):
    if not values:
        return line_chart([], [])
    pad_l, pad_r, pad_t, pad_b = 10, 10, 10, 26
    w = width - pad_l - pad_r
    h = height - pad_t - pad_b
    vmax = max(max(values), 1)
    n = len(values)
    gap = 10
    bw = (w - gap * (n - 1)) / n if n else w

    bars = []
    labels_svg = []
    for i, v in enumerate(values):
        x = pad_l + i * (bw + gap)
        bh = (v / vmax) * h
        y = pad_t + h - bh
        bars.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{max(bh,2):.1f}" rx="6" fill="{color}" />')
        lbl = labels[i] if i < len(labels) else ""
        labels_svg.append(f'<text x="{x+bw/2:.1f}" y="{height-6}" font-size="10" text-anchor="middle">{lbl}</text>')

    return f'''<svg viewBox="0 0 {width} {height}" width="100%" height="{height}" xmlns="http://www.w3.org/2000/svg">
  {''.join(bars)}
  {''.join(labels_svg)}
</svg>'''


def donut_chart(segments, width=200, height=200, colors=None):
    """segments: list of (label, value)."""
    colors = colors or ["#4F3FF0", "#FF6A45", "#22D3EE", "#F59E0B", "#16A34A", "#EC4899"]
    total = sum(v for _, v in segments) or 1
    cx, cy, r, r_inner = width / 2, height / 2, min(width, height) / 2 - 6, min(width, height) / 2 - 26
    start_angle = -90
    paths = []
    import math
    for i, (label, value) in enumerate(segments):
        angle = (value / total) * 360
        end_angle = start_angle + angle
        large = 1 if angle > 180 else 0
        x1 = cx + r * math.cos(math.radians(start_angle))
        y1 = cy + r * math.sin(math.radians(start_angle))
        x2 = cx + r * math.cos(math.radians(end_angle))
        y2 = cy + r * math.sin(math.radians(end_angle))
        color = colors[i % len(colors)]
        paths.append(
            f'<path d="M {cx} {cy} L {x1:.2f} {y1:.2f} A {r} {r} 0 {large} 1 {x2:.2f} {y2:.2f} Z" fill="{color}" opacity="0.92"/>'
        )
        start_angle = end_angle
    return f'''<svg viewBox="0 0 {width} {height}" width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg">
  {''.join(paths)}
  <circle cx="{cx}" cy="{cy}" r="{r_inner}" fill="var(--surface, #fff)" />
</svg>'''
