from __future__ import annotations

from typing import Any

import bleach
from fastapi import HTTPException
from jinja2 import StrictUndefined, meta, nodes
from jinja2.exceptions import TemplateError, UndefinedError
from jinja2.sandbox import SandboxedEnvironment


ALLOWED_MARKETING_HTML_TAGS = [
    "a",
    "b",
    "br",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "li",
    "ol",
    "p",
    "span",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
]
ALLOWED_MARKETING_HTML_ATTRIBUTES = {
    "a": ["href", "title"],
    "table": ["cellpadding", "cellspacing", "role"],
    "td": ["align", "colspan"],
    "th": ["align", "colspan"],
}

ALLOWED_TEMPLATE_FIELDS: dict[str, set[str]] = {
    "member": {"first_name", "last_name", "full_name", "email", "phone", "company"},
    "owner": {"first_name", "last_name", "full_name", "email", "phone"},
    "business": {"name", "support_email", "phone", "address", "city", "state", "postal_code", "website"},
    "location": {"name", "address", "city", "state", "postal_code", "phone", "email", "timezone"},
    "booking": {
        "number",
        "request_number",
        "start_date",
        "end_date",
        "start_time",
        "end_time",
        "space_name",
        "location_name",
        "link",
        "access_pass_link",
    },
    "space": {"name", "type", "capacity", "location_name"},
    "membership": {"name", "status", "renewal_date", "expiry_date"},
    "invoice": {"number", "amount", "balance_due", "due_date", "link", "status"},
    "payment": {"amount", "status", "failure_reason", "provider"},
    "card": {"brand", "last4", "exp_month", "exp_year", "expiry"},
    "links": {
        "unsubscribe",
        "view_in_browser",
        "booking",
        "invoice",
        "retry_payment",
        "update_payment_method",
        "access_pass",
    },
}


def ensure_template_allowed(subject: str, html_body: str | None, text_body: str | None) -> list[str]:
    if not subject or not subject.strip():
        raise HTTPException(status_code=400, detail="Template subject is required")
    if not (html_body and html_body.strip()) and not (text_body and text_body.strip()):
        raise HTTPException(status_code=400, detail="Template body is required")

    variables: set[str] = set()
    for source in [subject, html_body or "", text_body or ""]:
        variables.update(_validate_template_source(source))
    return sorted(variables)


def _validate_template_source(source: str) -> set[str]:
    env = SandboxedEnvironment()
    try:
        parsed = env.parse(source)
    except TemplateError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid template syntax: {exc}") from exc

    undeclared = meta.find_undeclared_variables(parsed)
    unknown = sorted(name for name in undeclared if name not in ALLOWED_TEMPLATE_FIELDS)
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown template variable(s): {', '.join(unknown)}")

    if list(parsed.find_all(nodes.Call)):
        raise HTTPException(status_code=400, detail="Template function calls are not allowed")
    if list(parsed.find_all(nodes.Getitem)):
        raise HTTPException(status_code=400, detail="Template item access is not allowed; use dotted fields")

    variables: set[str] = set()
    for attr in parsed.find_all(nodes.Getattr):
        root = _root_name(attr)
        if not root:
            continue
        if root not in ALLOWED_TEMPLATE_FIELDS:
            raise HTTPException(status_code=400, detail=f"Unknown template variable: {root}")
        if attr.attr not in ALLOWED_TEMPLATE_FIELDS[root]:
            raise HTTPException(status_code=400, detail=f"Unknown template field: {root}.{attr.attr}")
        variables.add(f"{root}.{attr.attr}")
    for name in parsed.find_all(nodes.Name):
        if name.name in ALLOWED_TEMPLATE_FIELDS:
            variables.add(name.name)
    return variables


def _root_name(node: nodes.Node) -> str | None:
    current = node
    while isinstance(current, nodes.Getattr):
        current = current.node
    if isinstance(current, nodes.Name):
        return current.name
    return None


def render_template_sources(
    *,
    subject: str,
    html_body: str | None,
    text_body: str | None,
    context: dict[str, Any],
) -> tuple[str, str | None, str | None, list[str]]:
    env = SandboxedEnvironment(undefined=StrictUndefined)
    missing: list[str] = []

    def _render(source: str | None) -> str | None:
        if source is None:
            return None
        try:
            return env.from_string(source).render(**context)
        except UndefinedError as exc:
            missing.append(str(exc))
            return source
        except TemplateError as exc:
            missing.append(str(exc))
            return source

    rendered_subject = _render(subject) or subject
    html = _render(html_body)
    text = _render(text_body)
    if html is not None:
        html = bleach.clean(
            html,
            tags=ALLOWED_MARKETING_HTML_TAGS,
            attributes=ALLOWED_MARKETING_HTML_ATTRIBUTES,
            protocols=["http", "https", "mailto"],
            strip=True,
        )
    return rendered_subject, html, text, sorted(set(missing))
