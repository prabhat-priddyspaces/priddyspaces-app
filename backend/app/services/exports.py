from __future__ import annotations

import csv
from datetime import datetime
from io import BytesIO, StringIO
from typing import Iterable, Mapping, Sequence


def rows_to_csv(columns: Sequence[str], rows: Iterable[Mapping[str, object]]) -> bytes:
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(columns), extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({col: _csv_cell(row.get(col)) for col in columns})
    return buffer.getvalue().encode("utf-8")


def _csv_cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def rows_to_pdf(
    title: str,
    subtitle: str,
    columns: Sequence[str],
    rows: Sequence[Mapping[str, object]],
    footer: str | None = None,
) -> bytes:
    try:
        from reportlab.lib.pagesizes import LETTER
        from reportlab.pdfgen import canvas
    except ModuleNotFoundError as exc:
        raise RuntimeError("PDF export requires reportlab to be installed") from exc

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=LETTER)
    width, height = LETTER

    y = height - 50
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(40, y, title)
    y -= 20
    pdf.setFont("Helvetica", 10)
    pdf.drawString(40, y, subtitle)
    y -= 24

    # Column widths — equal split within print area
    left = 40
    right = width - 40
    col_count = max(1, len(columns))
    col_width = (right - left) / col_count

    def draw_row(cells: Sequence[str], bold: bool = False) -> None:
        nonlocal y
        pdf.setFont("Helvetica-Bold" if bold else "Helvetica", 9)
        for i, cell in enumerate(cells):
            text = cell if cell is not None else ""
            # crude truncation to avoid column overflow
            max_chars = max(5, int(col_width / 5))
            if len(text) > max_chars:
                text = text[: max_chars - 1] + "…"
            pdf.drawString(left + i * col_width, y, text)
        y -= 14

    # Header row
    draw_row(list(columns), bold=True)
    pdf.setLineWidth(0.5)
    pdf.line(left, y + 8, right, y + 8)

    for row in rows:
        if y < 60:
            pdf.showPage()
            y = height - 50
            pdf.setFont("Helvetica-Bold", 12)
            pdf.drawString(40, y, title + " (continued)")
            y -= 20
            draw_row(list(columns), bold=True)
        draw_row([_csv_cell(row.get(col)) for col in columns])

    if footer:
        if y < 60:
            pdf.showPage()
            y = height - 50
        pdf.setFont("Helvetica-Oblique", 9)
        pdf.drawString(40, 40, footer)

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()
