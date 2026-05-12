from io import BytesIO
from datetime import datetime


def generate_invoice_pdf(payload: dict) -> bytes:
    try:
        from reportlab.lib.pagesizes import LETTER
        from reportlab.pdfgen import canvas
    except ModuleNotFoundError as exc:
        raise RuntimeError("PDF invoice generation requires reportlab to be installed") from exc

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=LETTER)
    width, height = LETTER

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(40, height - 50, "Priddyspaces Invoice")

    pdf.setFont("Helvetica", 11)
    y = height - 90
    lines = [
        f"Invoice: {payload.get('invoice_number', '')}",
        f"Date: {payload.get('issued_at', datetime.utcnow().date().isoformat())}",
        f"Member: {payload.get('member_email', '')}",
    ]

    if payload.get("booking_public_id"):
        lines.append(f"Booking: {payload['booking_public_id']}")
    if payload.get("subscription_public_id"):
        lines.append(f"Membership: {payload['subscription_public_id']}")
    if payload.get("description"):
        lines.append(f"Description: {payload['description']}")

    lines.append(f"Amount: ${payload.get('amount', 0)}")

    for line in lines:
        pdf.drawString(40, y, line)
        y -= 16

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()
