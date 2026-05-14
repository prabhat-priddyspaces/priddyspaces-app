from io import BytesIO
from datetime import datetime, timezone


def _money(value: object) -> str:
    try:
        return f"${float(value or 0):,.2f}".replace(".00", "")
    except (TypeError, ValueError):
        return "$0"


def _issued_at(payload: dict) -> str:
    return payload.get("issued_at") or datetime.now(timezone.utc).date().isoformat()


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
        f"Date: {_issued_at(payload)}",
        f"Member: {payload.get('member_name') or payload.get('member_email') or ''}",
        f"Status: {payload.get('status', '')}",
    ]

    if payload.get("member_email") and payload.get("member_name"):
        lines.append(f"Member email: {payload['member_email']}")
    if payload.get("booking_public_id"):
        lines.append(f"Booking: {payload['booking_public_id']}")
    if payload.get("subscription_public_id"):
        lines.append(f"Membership: {payload['subscription_public_id']}")
    if payload.get("payment_public_id"):
        payment = payload["payment_public_id"]
        provider = payload.get("payment_provider")
        status = payload.get("payment_status")
        lines.append(f"Payment: {payment}{f' ({provider})' if provider else ''}{f' - {status}' if status else ''}")
    if payload.get("space_name"):
        lines.append(f"Space: {payload['space_name']}")
    if payload.get("location_name"):
        lines.append(f"Location: {payload['location_name']}")
    if payload.get("description"):
        lines.append(f"Description: {payload['description']}")

    lines.append(f"Amount: {_money(payload.get('amount', 0))}")

    for line in lines:
        pdf.drawString(40, y, line)
        y -= 16

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()
