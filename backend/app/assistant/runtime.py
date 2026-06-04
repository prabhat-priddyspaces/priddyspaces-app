from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote, urlencode
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.assistant.context import AssistantContext, primary_organization_id
from app.assistant.provider import estimate_cost_usd
from app.assistant.redaction import redact_pii
from app.core.config import settings
from app.models.assistant import (
    AssistantConversation,
    AssistantFeedback,
    AssistantMessage,
    AssistantRateLimit,
    OwnerPolicyKB,
    SpaceAlert,
    SupportTicket,
)
from app.models.booking_request import BookingRequest
from app.models.enums import BookingRequestStatus, PaymentStatus
from app.models.floor_plan import FloorPlan
from app.models.invoice import Invoice
from app.models.location import Location
from app.models.organization import Organization
from app.models.payment import Payment
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.assistant import AssistantCitation, AssistantClientAction, AssistantMessageOut, AssistantProposal
from app.services.public_marketplace import PublicMarketplaceSearchFilters, search_public_locations


DEFAULT_NEAR_ME_RADIUS_MILES = 50
MARKETPLACE_CATEGORY_ROUTES = {
    "coworking": "spaces",
    "private_office": "private-offices",
    "meeting_room": "meeting-rooms",
}
MARKETPLACE_CATEGORY_LABELS = {
    "coworking": "coworking spaces",
    "private_office": "private offices",
    "meeting_room": "meeting rooms",
}
TOOL_BACKED_INTENTS = {
    "marketplace_search",
    "pricing_quote",
    "booking_proposal",
    "cancellation_guidance",
    "billing_lookup",
    "policy_lookup",
    "owner_ops",
    "platform_diagnostics",
    "support_escalation",
}


@dataclass
class IntentResolution:
    intent: str
    slots: dict[str, Any] = field(default_factory=dict)
    confidence: float = 1.0
    quality_events: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class AnswerEnvelope:
    intent: str
    slots: dict[str, Any]
    content: str
    citations: list[dict[str, Any]] = field(default_factory=list)
    proposals: list[dict[str, Any]] = field(default_factory=list)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    client_actions: list[dict[str, Any]] = field(default_factory=list)
    quality_events: list[dict[str, Any]] = field(default_factory=list)
    answer_basis: dict[str, Any] = field(default_factory=dict)


def disabled_chat_response() -> dict[str, Any]:
    return {
        "enabled": False,
        "disabled_reason": "Assistant is currently disabled.",
        "conversation_public_id": None,
        "guest_id": None,
        "message": None,
        "rate_limited": False,
        "cost_capped": False,
    }


def serialize_message(message: AssistantMessage) -> AssistantMessageOut:
    event_metadata = message.event_metadata or {}
    return AssistantMessageOut(
        public_id=message.public_id,
        role=message.role,
        content=message.content,
        citations=[AssistantCitation(**item) for item in (message.citations or [])],
        proposals=[AssistantProposal(**item) for item in (message.proposals or [])],
        client_actions=[AssistantClientAction(**item) for item in (event_metadata.get("client_actions") or [])],
        created_at=message.created_at,
    )


def _citation(type_: str, id_: str, url: str, title: str | None = None) -> dict[str, str | None]:
    return {"type": type_, "id": str(id_), "url": url, "title": title}


def _quality_event(kind: str, **details: Any) -> dict[str, Any]:
    event = {"kind": kind}
    event.update({key: value for key, value in details.items() if value is not None})
    return event


def _metadata_events(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for item in items:
        if "proposal_id" in item:
            continue
        if "kind" in item:
            events.append(item)
        elif item.get("missing_policy_category"):
            events.append(_quality_event("missing_policy", category=item.get("missing_policy_category")))
        else:
            events.append(item)
    return events


def public_space_url(space_public_id: str, *, back: str = "/spaces") -> str:
    return f"/spaces/{quote(str(space_public_id), safe='')}?{urlencode({'back': back})}"


def public_location_url(
    route_key: str,
    location_public_id: str,
    *,
    q: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    radius_miles: float | None = None,
    sort: str | None = None,
) -> str:
    params: dict[str, str] = {"route": route_key}
    if q:
        params["q"] = q
    if lat is not None and lng is not None:
        params["lat"] = f"{lat:.6f}"
        params["lng"] = f"{lng:.6f}"
    if radius_miles is not None:
        params["radius_miles"] = f"{radius_miles:g}"
    if sort:
        params["sort"] = sort
    return f"/locations/{quote(str(location_public_id), safe='')}?{urlencode(params)}"


def _make_proposal(
    *,
    kind: str,
    summary: str,
    method: str,
    path: str,
    payload: dict[str, Any],
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "proposal_id": f"prop_{uuid4().hex}",
        "kind": kind,
        "summary": summary,
        "endpoint": {"method": method, "path": path},
        "payload": payload,
        "warnings": warnings or [],
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(),
        "status": "pending",
    }


def _limits_for(audience: str) -> tuple[int, int]:
    if audience == "platform_admin":
        return settings.ASSISTANT_PLATFORM_ADMIN_PER_MINUTE, settings.ASSISTANT_PLATFORM_ADMIN_PER_DAY
    if audience == "owner":
        return settings.ASSISTANT_OWNER_PER_MINUTE, settings.ASSISTANT_OWNER_PER_DAY
    if audience == "staff":
        return settings.ASSISTANT_STAFF_PER_MINUTE, settings.ASSISTANT_STAFF_PER_DAY
    if audience == "member":
        return settings.ASSISTANT_MEMBER_PER_MINUTE, settings.ASSISTANT_MEMBER_PER_DAY
    if audience == "guest":
        return settings.ASSISTANT_GUEST_PER_MINUTE, settings.ASSISTANT_GUEST_PER_DAY
    return settings.ASSISTANT_ANON_PER_MINUTE, settings.ASSISTANT_ANON_PER_DAY


def enforce_rate_limit(db: Session, ctx: AssistantContext) -> None:
    per_min, per_day = _limits_for(ctx.audience)
    now = datetime.now(timezone.utc)
    windows = [
        ("minute", now.replace(second=0, microsecond=0), per_min),
        ("day", now.replace(hour=0, minute=0, second=0, microsecond=0), per_day),
    ]
    for window_type, window_start, limit in windows:
        row = (
            db.query(AssistantRateLimit)
            .filter(
                AssistantRateLimit.identifier == ctx.identifier,
                AssistantRateLimit.audience == ctx.audience,
                AssistantRateLimit.window_type == window_type,
                AssistantRateLimit.window_start == window_start,
            )
            .first()
        )
        if not row:
            row = AssistantRateLimit(
                identifier=ctx.identifier,
                audience=ctx.audience,
                window_type=window_type,
                window_start=window_start,
                request_count=0,
                token_count=0,
                cost_usd=0,
            )
        row.request_count += 1
        db.add(row)
        if row.request_count > limit:
            db.commit()
            raise HTTPException(status_code=429, detail="Assistant rate limit exceeded")
    db.commit()


def cost_cap_exceeded(db: Session) -> bool:
    day_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    total = (
        db.query(func.coalesce(func.sum(AssistantMessage.estimated_cost_usd), 0.0))
        .filter(AssistantMessage.created_at >= day_start)
        .scalar()
        or 0.0
    )
    return float(total) >= settings.ASSISTANT_DAILY_COST_CAP_USD


def get_or_create_conversation(
    db: Session,
    *,
    conversation_public_id: str | None,
    ctx: AssistantContext,
    first_message: str,
) -> AssistantConversation:
    if conversation_public_id:
        existing = (
            db.query(AssistantConversation)
            .filter(
                AssistantConversation.public_id == conversation_public_id,
                AssistantConversation.deleted_at.is_(None),
            )
            .first()
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return existing

    conversation = AssistantConversation(
        user_id=ctx.user_id,
        guest_id=ctx.guest_id,
        audience=ctx.audience,
        tenant_id=ctx.tenant_ids[0] if ctx.tenant_ids else None,
        organization_id=ctx.organization_ids[0] if ctx.organization_ids else None,
        accessible_location_ids=ctx.accessible_location_ids,
        title=first_message[:80],
        escalation_state="none",
        last_message_at=datetime.now(timezone.utc),
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def _context_float(page_context: dict[str, Any], key: str) -> float | None:
    value = page_context.get(key)
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _context_radius(page_context: dict[str, Any]) -> float | None:
    radius = _context_float(page_context, "radius_miles")
    if radius is None or radius <= 0:
        return None
    return min(radius, 1000)


def _is_near_me_query(text: str) -> bool:
    lowered = text.lower()
    return any(
        phrase in lowered
        for phrase in ["near me", "nearby", "near my location", "around me", "close to me", "close by"]
    )


def _is_price_sorted_query(text: str) -> bool:
    lowered = text.lower()
    return any(word in lowered for word in ["cheap", "cheapest", "lowest", "least expensive", "affordable", "price"])


def _is_pricing_query(text: str) -> bool:
    lowered = text.lower()
    return any(phrase in lowered for phrase in ["price", "pricing", "cost", "how much", "rate", "quote", "cheapest"])


def _marketplace_category(text: str) -> str:
    lowered = text.lower()
    if any(word in lowered for word in ["meeting", "conference", "boardroom", "board room"]):
        return "meeting_room"
    if "private office" in lowered or "office" in lowered:
        return "private_office"
    return "coworking"


def _marketplace_query_text(text: str) -> str | None:
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    stopwords = {
        "a",
        "an",
        "and",
        "around",
        "available",
        "availability",
        "board",
        "boardroom",
        "by",
        "cheap",
        "cheapest",
        "close",
        "conference",
        "coworking",
        "desk",
        "does",
        "find",
        "for",
        "from",
        "how",
        "in",
        "is",
        "least",
        "location",
        "locations",
        "lowest",
        "me",
        "meeting",
        "much",
        "my",
        "near",
        "nearby",
        "office",
        "please",
        "price",
        "pricing",
        "quote",
        "rate",
        "rates",
        "private",
        "room",
        "rooms",
        "search",
        "show",
        "space",
        "spaces",
        "the",
        "to",
        "what",
        "with",
    }
    kept = [token for token in tokens if token not in stopwords and len(token) > 1]
    query = " ".join(kept).strip()
    return query or None


def _location_label(page_context: dict[str, Any]) -> str:
    for key in ["location_label", "q"]:
        value = page_context.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return "your location"


def _request_location_action(text: str) -> dict[str, Any]:
    return {
        "action_id": f"act_{uuid4().hex}",
        "kind": "request_location",
        "label": "Use my location",
        "payload": {
            "original_message": text,
            "radius_miles": DEFAULT_NEAR_ME_RADIUS_MILES,
        },
    }


def _clarify_input_action(*, label: str, prompt: str, original_message: str) -> dict[str, Any]:
    return {
        "action_id": f"act_{uuid4().hex}",
        "kind": "clarify_input",
        "label": label,
        "payload": {
            "prompt": prompt,
            "original_message": original_message,
        },
    }


def _missing_booking_slots(page_context: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    if not page_context.get("space_public_id"):
        missing.append("space")
    if not page_context.get("start_datetime"):
        missing.append("start_datetime")
    if not page_context.get("end_datetime"):
        missing.append("end_datetime")
    return missing


def _money(value: Any) -> str | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number.is_integer():
        return f"${int(number)}"
    return f"${number:.2f}"


def _location_price(result: dict[str, Any], category: str) -> str:
    if category == "meeting_room":
        hourly = _money(result.get("starting_hourly_price"))
        if hourly:
            return f"{hourly}/hr"
    if category == "private_office":
        monthly = _money(result.get("starting_monthly_price"))
        if monthly:
            return f"{monthly}/mo"
    daily = _money(result.get("starting_day_pass_price"))
    if daily:
        return f"{daily}/day"
    monthly = _money(result.get("starting_monthly_price"))
    if monthly:
        return f"{monthly}/mo"
    hourly = _money(result.get("starting_hourly_price"))
    if hourly:
        return f"{hourly}/hr"
    return "pricing not configured"


def _previous_assistant_slots(db: Session, conversation_id: int) -> dict[str, Any] | None:
    message = (
        db.query(AssistantMessage)
        .filter(
            AssistantMessage.conversation_id == conversation_id,
            AssistantMessage.role == "assistant",
            AssistantMessage.event_metadata.isnot(None),
        )
        .order_by(AssistantMessage.created_at.desc(), AssistantMessage.id.desc())
        .first()
    )
    if not message:
        return None
    slots = (message.event_metadata or {}).get("slots")
    return slots if isinstance(slots, dict) else None


def _resolve_assistant_intent(ctx: AssistantContext, text: str, page_context: dict[str, Any]) -> IntentResolution:
    lowered = text.lower()
    events: list[dict[str, Any]] = []
    policy_category = _policy_category(text)
    marketplace_requested = any(
        word in lowered
        for word in ["find", "search", "space", "room", "desk", "office", "availability", "price", "pricing", "cost", "quote", "rate", "cheapest"]
    )
    slots: dict[str, Any] = {
        "persona": ctx.audience,
        "category": _marketplace_category(text) if marketplace_requested else None,
        "near_me": _is_near_me_query(text),
        "sort": "price_asc" if _is_price_sorted_query(text) else None,
        "q": _marketplace_query_text(text),
        "lat": _context_float(page_context, "lat"),
        "lng": _context_float(page_context, "lng"),
        "radius_miles": _context_radius(page_context),
        "page_q": page_context.get("q") if isinstance(page_context.get("q"), str) else None,
        "policy_category": policy_category,
        "booking_request_public_id": page_context.get("booking_request_public_id"),
        "space_public_id": page_context.get("space_public_id"),
        "start_datetime": page_context.get("start_datetime"),
        "end_datetime": page_context.get("end_datetime"),
    }
    if slots["q"] and slots["page_q"] and str(slots["q"]).casefold() not in str(slots["page_q"]).casefold():
        events.append(_quality_event("context_mismatch", field="location", explicit=slots["q"], page=slots["page_q"]))

    if any(word in lowered for word in ["human", "support", "escalate", "agent"]):
        return IntentResolution("support_escalation", slots, quality_events=events)
    if ctx.audience in {"owner", "staff"} and slots["booking_request_public_id"] and any(word in lowered for word in ["approve", "reject"]):
        return IntentResolution("booking_proposal", slots, quality_events=events)
    if "cancel" in lowered and slots["booking_request_public_id"]:
        return IntentResolution("cancellation_guidance", slots, quality_events=events)
    if "book" in lowered and not any(word in lowered for word in ["cancel", "approve", "reject"]):
        return IntentResolution("booking_proposal", slots, quality_events=events)
    if policy_category:
        return IntentResolution("policy_lookup", slots, quality_events=events)
    if ctx.audience in {"owner", "staff"} and any(word in lowered for word in ["pending", "approval", "arrivals", "handoff"]):
        return IntentResolution("owner_ops", slots, quality_events=events)
    if ctx.audience in {"owner", "staff"} and any(word in lowered for word in ["revenue", "occupancy", "analytics", "mrr", "churn"]):
        return IntentResolution("owner_ops", slots, quality_events=events)
    if ctx.audience == "platform_admin" and any(word in lowered for word in ["diagnostic", "failed", "onboarding", "listing", "platform"]):
        return IntentResolution("platform_diagnostics", slots, quality_events=events)
    if any(word in lowered for word in ["invoice", "payment", "billing", "refund"]):
        return IntentResolution("billing_lookup", slots, quality_events=events)
    if marketplace_requested:
        return IntentResolution("pricing_quote" if _is_pricing_query(text) else "marketplace_search", slots, quality_events=events)
    events.append(_quality_event("unsupported_intent", message=text[:120]))
    return IntentResolution("unsupported", slots, confidence=0.4, quality_events=events)


def _search_marketplace(
    db: Session,
    text: str,
    page_context: dict[str, Any],
    resolution: IntentResolution,
) -> AnswerEnvelope:
    category = str(resolution.slots.get("category") or _marketplace_category(text))
    category_label = MARKETPLACE_CATEGORY_LABELS[category]
    route_key = MARKETPLACE_CATEGORY_ROUTES[category]
    near_me = _is_near_me_query(text)
    lat = _context_float(page_context, "lat")
    lng = _context_float(page_context, "lng")
    has_coords = lat is not None and lng is not None
    text_query = _marketplace_query_text(text)
    events = list(resolution.quality_events)
    if near_me and not has_coords:
        events.append(_quality_event("missing_required_slot", slot="location", intent="marketplace_search"))
        return AnswerEnvelope(
            intent=resolution.intent,
            slots={"category": category, "near_me": True, "radius_miles": DEFAULT_NEAR_ME_RADIUS_MILES},
            content=f"I need your location to search for {category_label} within {DEFAULT_NEAR_ME_RADIUS_MILES} miles.",
            tool_calls=[{"name": "search_locations", "status": "blocked"}],
            client_actions=[_request_location_action(text)],
            quality_events=events,
        )

    use_coords = bool(has_coords and (near_me or not text_query))
    radius_miles = _context_radius(page_context) if use_coords else None
    if use_coords and radius_miles is None:
        radius_miles = DEFAULT_NEAR_ME_RADIUS_MILES
    q = None if use_coords else text_query
    if not q and not use_coords:
        raw_q = page_context.get("q")
        q = raw_q.strip() if isinstance(raw_q, str) and raw_q.strip() else None
    conversation_slots = page_context.get("conversation_slots")
    if not q and not use_coords and isinstance(conversation_slots, dict):
        prior_q = conversation_slots.get("q")
        if isinstance(prior_q, str) and prior_q.strip():
            q = prior_q.strip()
    sort = "price_asc" if _is_price_sorted_query(text) else None
    filters = PublicMarketplaceSearchFilters(
        category=category,
        q=q,
        sort=sort,
        lat=lat if use_coords else None,
        lng=lng if use_coords else None,
        radius_miles=radius_miles,
        page=1,
        page_size=5,
    )
    payload = search_public_locations(db, filters)
    results = [item for item in payload.get("results", []) if isinstance(item, dict)]
    search_params = {
        key: value
        for key, value in {
            "q": q,
            "lat": f"{lat:.6f}" if use_coords and lat is not None else None,
            "lng": f"{lng:.6f}" if use_coords and lng is not None else None,
            "radius_miles": f"{radius_miles:g}" if radius_miles is not None else None,
            "sort": sort,
        }.items()
        if value
    }
    search_url = f"/{route_key}"
    if search_params:
        search_url = f"{search_url}?{urlencode(search_params)}"
    if not results:
        if use_coords:
            label = _location_label(page_context)
            events.append(_quality_event("no_results", intent=resolution.intent, category=category, radius_miles=radius_miles, location_label=label))
            return AnswerEnvelope(
                intent=resolution.intent,
                slots={"category": category, "q": q, "lat": lat, "lng": lng, "radius_miles": radius_miles, "sort": sort},
                content=f"I could not find {category_label} within {radius_miles:g} miles of {label}. Try widening the radius or searching by city.",
                citations=[_citation("marketplace", "search", search_url, "Marketplace search")],
                tool_calls=[{"name": "search_locations", "status": "completed"}],
                quality_events=events,
                answer_basis={"result_count": 0, "radius_miles": radius_miles, "location_label": label},
            )
        events.append(_quality_event("no_results", intent=resolution.intent, category=category, q=q))
        return AnswerEnvelope(
            intent=resolution.intent,
            slots={"category": category, "q": q, "sort": sort},
            content=f"I could not find matching public {category_label}. Try a city, neighborhood, team size, or date.",
            citations=[_citation("marketplace", "search", search_url, "Marketplace search")],
            tool_calls=[{"name": "search_locations", "status": "completed"}],
            quality_events=events,
            answer_basis={"result_count": 0, "query": q},
        )

    if use_coords:
        label = _location_label(page_context)
        prefix = "Cheapest " if sort == "price_asc" else ""
        lines = [f"{prefix}{category_label.capitalize()} within {radius_miles:g} miles of {label}:"]
    elif q:
        lines = [f"Matching {category_label} for {q}:"]
    else:
        lines = [f"Here are matching {category_label}:"]

    citations: list[dict[str, Any]] = []
    for result in results:
        location_public_id = str(result["location_public_id"])
        name = str(result.get("name") or "Location")
        city_state = ", ".join(str(part) for part in [result.get("city"), result.get("state")] if part)
        address = ", ".join(str(part) for part in [result.get("address"), city_state] if part) or "address not configured"
        matching_count = int(result.get("matching_space_count") or 0)
        noun = category_label[:-1] if matching_count == 1 and category_label.endswith("s") else category_label
        distance = result.get("distance_miles")
        distance_text = f", {float(distance):.1f} miles away" if distance is not None else ""
        lines.append(
            f"- {name} ({address}): {matching_count} matching {noun}, from {_location_price(result, category)}{distance_text}."
        )
        citations.append(
            _citation(
                "location",
                location_public_id,
                public_location_url(
                    route_key,
                    location_public_id,
                    q=q,
                    lat=lat if use_coords else None,
                    lng=lng if use_coords else None,
                    radius_miles=radius_miles,
                    sort=sort,
                ),
                name,
            )
        )
    return AnswerEnvelope(
        intent="pricing_quote" if _is_pricing_query(text) else "marketplace_search",
        slots={"category": category, "q": q, "lat": lat if use_coords else None, "lng": lng if use_coords else None, "radius_miles": radius_miles, "sort": sort},
        content="\n".join(lines),
        citations=citations,
        tool_calls=[{"name": "search_locations", "status": "completed"}],
        quality_events=events,
        answer_basis={
            "result_count": len(results),
            "price_basis": "hourly first, then day/month fallback" if category == "meeting_room" else "lowest configured starting price",
            "distance_basis": f"within {radius_miles:g} miles" if use_coords else None,
        },
    )


def _policy_category(text: str) -> str | None:
    lowered = text.lower()
    categories = {
        "wifi": ["wifi", "wi-fi", "internet"],
        "parking": ["parking", "garage"],
        "transit": ["transit", "train", "bus", "subway"],
        "door_code": ["door", "access code", "entry code"],
        "cancellation": ["cancel", "refund", "cancellation"],
        "guest_policy": ["guest", "bring someone"],
        "amenities": ["amenity", "amenities", "coffee", "printer"],
        "support": ["support", "help desk"],
        "floor_plan": ["floor plan", "map"],
    }
    for category, needles in categories.items():
        if any(needle in lowered for needle in needles):
            return category
    return None


def _policy_response(
    db: Session,
    ctx: AssistantContext,
    category: str,
    page_context: dict[str, Any],
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    public_categories = {"parking", "transit", "amenities", "cancellation", "guest_policy"}
    if ctx.audience in {"anonymous", "guest"} and category not in public_categories:
        return "Sign in to access that location-specific information.", [], []

    query = db.query(OwnerPolicyKB).filter(OwnerPolicyKB.category == category, OwnerPolicyKB.is_active.is_(True))
    tenant_ids = list(ctx.tenant_ids)
    location = None
    space = None
    if page_context.get("space_public_id"):
        space = db.query(Space).filter(Space.public_id == page_context["space_public_id"]).first()
        if space:
            tenant_ids.append(space.tenant_id)
    if page_context.get("location_public_id"):
        location = db.query(Location).filter(Location.public_id == page_context["location_public_id"]).first()
        if location:
            tenant_ids.append(location.tenant_id)
    if tenant_ids:
        query = query.filter(OwnerPolicyKB.tenant_id.in_(sorted(set(tenant_ids))))
    if space:
        query = query.filter((OwnerPolicyKB.space_id == space.id) | (OwnerPolicyKB.location_id == space.location_id) | (OwnerPolicyKB.space_id.is_(None)))
    elif location:
        query = query.filter((OwnerPolicyKB.location_id == location.id) | (OwnerPolicyKB.location_id.is_(None)))
    elif ctx.organization_ids:
        query = query.filter(OwnerPolicyKB.organization_id.in_(ctx.organization_ids))
    else:
        query = query.filter(False)

    item = query.order_by(OwnerPolicyKB.space_id.desc(), OwnerPolicyKB.location_id.desc(), OwnerPolicyKB.updated_at.desc()).first()
    if item:
        return item.body, [_citation("policy", item.public_id, f"/owner/settings/assistant-policies?policy={item.public_id}", item.title)], []

    metadata = {"missing_policy_category": category}
    return "This policy has not been configured yet.", [], [metadata]


def _booking_or_action_response(ctx: AssistantContext, text: str, page_context: dict[str, Any]) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    lowered = text.lower()
    if "book" in lowered and ctx.audience == "member":
        space_public_id = page_context.get("space_public_id")
        start_datetime = page_context.get("start_datetime")
        end_datetime = page_context.get("end_datetime")
        if space_public_id and start_datetime and end_datetime:
            proposal = _make_proposal(
                kind="booking_request.create",
                summary="Create booking request",
                method="POST",
                path="/api/booking-requests",
                payload={
                    "space_public_id": space_public_id,
                    "start_datetime": start_datetime,
                    "end_datetime": end_datetime,
                    "booking_mode": page_context.get("booking_mode") or "hourly",
                    "full_day": bool(page_context.get("full_day") or False),
                    "member_owner_payment_method_public_id": page_context.get("member_owner_payment_method_public_id"),
                    "payment_authorization_consent": bool(page_context.get("payment_authorization_consent") or False),
                },
                warnings=["Existing booking, payment, and conflict validations will run after confirmation."],
            )
            return "I drafted a booking request. Review the details and confirm when you are ready.", [], [proposal]
        return "I can draft the booking once a space, start time, and end time are selected.", [_citation("marketplace", "search", "/spaces", "Marketplace")], []

    request_id = page_context.get("booking_request_public_id")
    if "cancel" in lowered and request_id and ctx.audience in {"member", "owner", "staff"}:
        proposal = _make_proposal(
            kind="booking.cancel",
            summary="Cancel booking request",
            method="POST",
            path=f"/api/booking-requests/{request_id}/cancel",
            payload={},
            warnings=["Cancellation deadline and refund rules will be re-checked after confirmation."],
        )
        return "I drafted a cancellation request. Confirm only if you want the existing API to process it.", [_citation("booking", request_id, f"/member/requests/{request_id}", "Booking request")], [proposal]

    if ctx.audience in {"owner", "staff"} and request_id and "approve" in lowered:
        proposal = _make_proposal(
            kind="booking_request.approve",
            summary="Approve booking request",
            method="POST",
            path=f"/api/booking-requests/{request_id}/approve",
            payload={"operator_notes": page_context.get("operator_notes")},
            warnings=["Payment collection and conflict checks will run after confirmation."],
        )
        return "I drafted an approval action for this request.", [_citation("booking", request_id, f"/owner/requests?request={request_id}", "Booking request")], [proposal]

    if ctx.audience in {"owner", "staff"} and request_id and "reject" in lowered:
        proposal = _make_proposal(
            kind="booking_request.reject",
            summary="Reject booking request",
            method="POST",
            path=f"/api/booking-requests/{request_id}/reject",
            payload={"operator_notes": page_context.get("operator_notes")},
            warnings=["The rejection will be audited after confirmation."],
        )
        return "I drafted a rejection action for this request.", [_citation("booking", request_id, f"/owner/requests?request={request_id}", "Booking request")], [proposal]

    return "", [], []


def _owner_pending_response(db: Session, ctx: AssistantContext) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    if not ctx.accessible_location_ids:
        return "I could not find any assigned owner or staff locations for your account.", [], []
    space_ids = [sid for (sid,) in db.query(Space.id).filter(Space.location_id.in_(ctx.accessible_location_ids)).all()]
    requests = (
        db.query(BookingRequest)
        .filter(BookingRequest.space_id.in_(space_ids), BookingRequest.status == BookingRequestStatus.REQUESTED)
        .order_by(BookingRequest.created_at.asc())
        .limit(10)
        .all()
        if space_ids
        else []
    )
    if not requests:
        return "There are no pending booking requests in your assigned locations.", [], []
    lines = [f"You have {len(requests)} pending request(s) in the first page:"]
    citations = []
    for req in requests:
        lines.append(f"- Request {req.public_id} from {req.start_datetime} to {req.end_datetime}.")
        citations.append(_citation("booking", req.public_id, f"/owner/requests?request={req.public_id}", "Pending request"))
    return "\n".join(lines), citations, []


def _analytics_response(db: Session, ctx: AssistantContext) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    tenant_ids = ctx.tenant_ids
    if not tenant_ids:
        return "I could not find owner analytics scope for your account.", [], []
    succeeded = db.query(Payment).filter(Payment.tenant_id.in_(tenant_ids), Payment.status == PaymentStatus.SUCCEEDED).all()
    revenue = sum((p.owner_net_amount if p.owner_net_amount is not None else p.amount) or 0 for p in succeeded)
    active_subs = (
        db.query(func.count(Subscription.id))
        .filter(Subscription.tenant_id.in_(tenant_ids), Subscription.status.in_(["active", "trialing", "past_due", "canceling"]))
        .scalar()
        or 0
    )
    locations = db.query(func.count(Location.id)).filter(Location.tenant_id.in_(tenant_ids)).scalar() or 0
    spaces = db.query(func.count(Space.id)).filter(Space.tenant_id.in_(tenant_ids)).scalar() or 0
    return (
        f"Owner summary: revenue captured is ${revenue}, active memberships are {active_subs}, with {locations} location(s) and {spaces} space(s).",
        [_citation("analytics", "owner-overview", "/owner/analytics", "Owner analytics")],
        [],
    )


def _billing_response(db: Session, ctx: AssistantContext) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    if not ctx.user_id:
        return "Sign in to review invoices and payments.", [], []
    if ctx.audience == "member":
        invoices = db.query(Invoice).filter(Invoice.user_id == ctx.user_id).order_by(Invoice.created_at.desc()).limit(5).all()
    else:
        invoices = db.query(Invoice).filter(Invoice.tenant_id.in_(ctx.tenant_ids)).order_by(Invoice.created_at.desc()).limit(5).all() if ctx.tenant_ids else []
    if not invoices:
        return "I could not find recent invoices in your accessible account scope.", [_citation("invoice", "list", "/member/invoices", "Invoices")], []
    total = sum(float(inv.amount or 0) for inv in invoices)
    citations = [_citation("invoice", inv.public_id, f"/member/invoices?invoice={inv.public_id}", "Invoice") for inv in invoices]
    return f"I found {len(invoices)} recent invoice(s), totaling ${total:.2f} in this view.", citations, []


def _floor_plan_response(db: Session, ctx: AssistantContext, page_context: dict[str, Any]) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    location = None
    if page_context.get("location_public_id"):
        location = db.query(Location).filter(Location.public_id == page_context["location_public_id"]).first()
    elif page_context.get("space_public_id"):
        space = db.query(Space).filter(Space.public_id == page_context["space_public_id"]).first()
        if space:
            location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        return "Open a location or space and I can look up the floor plan for that page.", [], []
    if ctx.audience not in {"platform_admin", "owner", "staff"} and location.id not in ctx.accessible_location_ids:
        # Member floor-plan access is intentionally conservative in v1.
        return "Floor plans are available after sign-in only when the location has exposed one for your booking context.", [], []
    plan = db.query(FloorPlan).filter(FloorPlan.location_id == location.id).order_by(FloorPlan.version.desc()).first()
    if not plan:
        return "This policy has not been configured yet.", [], [{"missing_policy_category": "floor_plan"}]
    return f"The latest floor plan for {location.name} is available.", [_citation("floor_plan", plan.public_id, plan.image_url, "Floor plan")], []


def _platform_response(db: Session) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    users = db.query(func.count(User.id)).scalar() or 0
    orgs = db.query(func.count(Organization.id)).scalar() or 0
    failed_payments = db.query(func.count(Payment.id)).filter(Payment.status == PaymentStatus.FAILED).scalar() or 0
    return (
        f"Platform diagnostic summary: {users} users, {orgs} owner companies, and {failed_payments} failed payment record(s).",
        [_citation("admin", "platform-dashboard", "/admin", "Platform console")],
        [],
    )


def _finalize_envelope(envelope: AnswerEnvelope) -> AnswerEnvelope:
    missing_slot = any(event.get("kind") == "missing_required_slot" for event in envelope.quality_events)
    unsupported = envelope.intent == "unsupported"
    missing_policy = any(event.get("kind") in {"missing_policy"} or event.get("missing_policy_category") for event in envelope.quality_events)
    if envelope.intent in TOOL_BACKED_INTENTS and not envelope.citations and not envelope.proposals and not envelope.client_actions and not missing_slot and not missing_policy:
        envelope.quality_events.append(_quality_event("citation_missing_prevented", intent=envelope.intent))
        envelope.content = "I could not answer reliably because the source citation was missing. Try again or contact support."
        envelope.citations = [_citation("assistant", "reliability", "/assistant", "Assistant reliability")]
        envelope.tool_calls.append({"name": "citation_guardrail", "status": "blocked"})
    if unsupported:
        envelope.quality_events.append(_quality_event("low_confidence_intent", intent=envelope.intent))
    return envelope


def _local_assistant_response(
    db: Session,
    *,
    ctx: AssistantContext,
    text: str,
    page_context: dict[str, Any],
) -> AnswerEnvelope:
    resolution = _resolve_assistant_intent(ctx, text, page_context)
    if resolution.intent in {"booking_proposal", "cancellation_guidance"}:
        action_answer, action_citations, action_proposals = _booking_or_action_response(ctx, text, page_context)
        events = list(resolution.quality_events)
        client_actions: list[dict[str, Any]] = []
        if action_answer and not action_proposals and "book" in text.lower():
            missing = _missing_booking_slots(page_context)
            if missing:
                events.append(_quality_event("missing_required_slot", intent="booking_proposal", slot=",".join(missing)))
                client_actions.append(
                    _clarify_input_action(
                        label="Add booking details",
                        prompt="Choose a space, start time, and end time, then ask me to draft the booking again.",
                        original_message=text,
                    )
                )
        if action_answer:
            return _finalize_envelope(
                AnswerEnvelope(
                    intent=resolution.intent,
                    slots=resolution.slots,
                    content=action_answer,
                    citations=action_citations,
                    proposals=action_proposals,
                    tool_calls=[{"name": "proposal_builder", "status": "completed" if action_proposals else "blocked"}],
                    client_actions=client_actions,
                    quality_events=events,
                )
            )

    if resolution.intent == "support_escalation":
        proposal = _make_proposal(
            kind="support.escalate",
            summary="Talk to a human",
            method="POST",
            path="/api/assistant/support-tickets",
            payload={"subject": page_context.get("subject") or "Assistant escalation"},
            warnings=[],
        )
        return _finalize_envelope(
            AnswerEnvelope(
                intent=resolution.intent,
                slots=resolution.slots,
                content="I can create a support ticket with this conversation transcript.",
                citations=[_citation("support", "escalation", "/support", "Support escalation")],
                proposals=[proposal],
                tool_calls=[{"name": "propose_escalate_to_human", "status": "completed"}],
                quality_events=resolution.quality_events,
            )
        )

    if resolution.intent == "policy_lookup" and resolution.slots.get("policy_category") == "floor_plan":
        answer, citations, metadata = _floor_plan_response(db, ctx, page_context)
        return _finalize_envelope(
            AnswerEnvelope(
                intent=resolution.intent,
                slots=resolution.slots,
                content=answer,
                citations=citations,
                tool_calls=[{"name": "get_floor_plan", "status": "completed"}],
                quality_events=resolution.quality_events + _metadata_events(metadata),
            )
        )
    if resolution.intent == "policy_lookup":
        answer, citations, metadata = _policy_response(db, ctx, str(resolution.slots["policy_category"]), page_context)
        return _finalize_envelope(
            AnswerEnvelope(
                intent=resolution.intent,
                slots=resolution.slots,
                content=answer,
                citations=citations,
                tool_calls=[{"name": "owner_policy_kb", "status": "completed"}],
                quality_events=resolution.quality_events + _metadata_events(metadata),
            )
        )

    if resolution.intent == "owner_ops" and any(word in text.lower() for word in ["pending", "approval", "arrivals", "handoff"]):
        answer, citations, proposals = _owner_pending_response(db, ctx)
        return _finalize_envelope(
            AnswerEnvelope(
                intent=resolution.intent,
                slots=resolution.slots,
                content=answer,
                citations=citations,
                proposals=proposals,
                tool_calls=[{"name": "list_pending_requests", "status": "completed"}],
                quality_events=resolution.quality_events,
            )
        )

    if resolution.intent == "owner_ops":
        answer, citations, proposals = _analytics_response(db, ctx)
        return _finalize_envelope(
            AnswerEnvelope(
                intent=resolution.intent,
                slots=resolution.slots,
                content=answer,
                citations=citations,
                proposals=proposals,
                tool_calls=[{"name": "get_revenue_summary", "status": "completed"}],
                quality_events=resolution.quality_events,
            )
        )

    if resolution.intent == "platform_diagnostics":
        answer, citations, proposals = _platform_response(db)
        return _finalize_envelope(
            AnswerEnvelope(
                intent=resolution.intent,
                slots=resolution.slots,
                content=answer,
                citations=citations,
                proposals=proposals,
                tool_calls=[{"name": "platform_diagnostics", "status": "completed"}],
                quality_events=resolution.quality_events,
            )
        )

    if resolution.intent == "billing_lookup":
        answer, citations, proposals = _billing_response(db, ctx)
        return _finalize_envelope(
            AnswerEnvelope(
                intent=resolution.intent,
                slots=resolution.slots,
                content=answer,
                citations=citations,
                proposals=proposals,
                tool_calls=[{"name": "billing_summary", "status": "completed"}],
                quality_events=resolution.quality_events,
            )
        )

    if resolution.intent in {"marketplace_search", "pricing_quote"}:
        try:
            return _finalize_envelope(_search_marketplace(db, text, page_context, resolution))
        except Exception as exc:
            return _finalize_envelope(
                AnswerEnvelope(
                    intent=resolution.intent,
                    slots=resolution.slots,
                    content="I could not complete that search reliably. Try again or contact support.",
                    citations=[_citation("marketplace", "search", f"/{MARKETPLACE_CATEGORY_ROUTES[str(resolution.slots.get('category') or 'coworking')]}", "Marketplace search")],
                    tool_calls=[{"name": "search_locations", "status": "failed", "error": exc.__class__.__name__}],
                    quality_events=resolution.quality_events + [_quality_event("tool_exception", tool="search_locations", error=exc.__class__.__name__)],
                )
            )

    return _finalize_envelope(
        AnswerEnvelope(
            intent="unsupported",
            slots=resolution.slots,
            content="I can help search spaces, explain configured policies, draft booking or cancellation proposals, summarize billing, and escalate to a human when needed.",
            citations=[_citation("assistant", "capabilities", "/assistant", "Assistant capabilities")],
            quality_events=resolution.quality_events,
        )
    )


def process_chat(
    db: Session,
    *,
    ctx: AssistantContext,
    conversation_public_id: str | None,
    guest_id: str | None,
    message: str,
    page_context: dict[str, Any],
) -> dict[str, Any]:
    if cost_cap_exceeded(db):
        return {
            "enabled": True,
            "disabled_reason": "Assistant daily cost cap has been reached.",
            "conversation_public_id": conversation_public_id,
            "guest_id": guest_id,
            "message": None,
            "rate_limited": False,
            "cost_capped": True,
        }

    start = datetime.now(timezone.utc)
    current_user_email = ctx.user.email if ctx.user else None
    redacted_message, redaction_counts = redact_pii(message, current_user_email=current_user_email)
    conversation = get_or_create_conversation(db, conversation_public_id=conversation_public_id, ctx=ctx, first_message=redacted_message)
    runtime_context = dict(page_context or {})
    previous_slots = _previous_assistant_slots(db, conversation.id)
    if previous_slots:
        runtime_context["conversation_slots"] = previous_slots

    user_message = AssistantMessage(
        conversation_id=conversation.id,
        role="user",
        content=redacted_message,
        redaction_counts=redaction_counts,
        estimated_cost_usd=0.0,
    )
    db.add(user_message)
    db.commit()

    envelope = _local_assistant_response(
        db,
        ctx=ctx,
        text=redacted_message,
        page_context=runtime_context,
    )
    event_metadata: dict[str, Any] = {}
    if envelope.quality_events:
        event_metadata["events"] = envelope.quality_events
    if envelope.client_actions:
        event_metadata["client_actions"] = envelope.client_actions
    event_metadata["intent"] = envelope.intent
    event_metadata["slots"] = {key: value for key, value in envelope.slots.items() if value is not None}
    if envelope.answer_basis:
        event_metadata["answer_basis"] = envelope.answer_basis
    usage = {"input_tokens": max(1, len(redacted_message.split())), "output_tokens": max(1, len(envelope.content.split()))}
    cost = estimate_cost_usd(settings.ASSISTANT_PRIMARY_MODEL, usage)
    assistant_message = AssistantMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=envelope.content,
        tool_calls=envelope.tool_calls[: settings.ASSISTANT_MAX_TOOL_HOPS],
        citations=envelope.citations,
        proposals=envelope.proposals,
        usage=usage,
        latency_ms=int((datetime.now(timezone.utc) - start).total_seconds() * 1000),
        redaction_counts={},
        estimated_cost_usd=cost,
        model=settings.ASSISTANT_PRIMARY_MODEL,
        event_metadata=event_metadata or None,
    )
    conversation.last_message_at = datetime.now(timezone.utc)
    if envelope.quality_events and any(item.get("kind") == "missing_policy" for item in envelope.quality_events):
        conversation.summary = "Missing policy question recorded"
    db.add(conversation)
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)
    db.refresh(conversation)

    return {
        "enabled": True,
        "disabled_reason": None,
        "conversation_public_id": conversation.public_id,
        "guest_id": guest_id,
        "message": serialize_message(assistant_message).model_dump(mode="json"),
        "rate_limited": False,
        "cost_capped": False,
    }


def create_support_ticket(
    db: Session,
    *,
    conversation: AssistantConversation | None,
    ctx: AssistantContext,
    subject: str,
    requester_email: str | None = None,
) -> SupportTicket:
    transcript = []
    if conversation:
        messages = (
            db.query(AssistantMessage)
            .filter(AssistantMessage.conversation_id == conversation.id)
            .order_by(AssistantMessage.created_at.asc(), AssistantMessage.id.asc())
            .all()
        )
        transcript = [{"role": m.role, "content": m.content, "created_at": m.created_at.isoformat() if m.created_at else None} for m in messages]
    ticket = SupportTicket(
        conversation_id=conversation.id if conversation else None,
        user_id=ctx.user_id,
        guest_id=ctx.guest_id,
        tenant_id=conversation.tenant_id if conversation else (ctx.tenant_ids[0] if ctx.tenant_ids else None),
        status="open",
        subject=subject or "Assistant escalation",
        requester_email=requester_email or (ctx.user.email if ctx.user else None),
        transcript=transcript,
        event_metadata={"source": "assistant"},
    )
    db.add(ticket)
    if conversation:
        conversation.escalation_state = "open"
        db.add(conversation)
    db.commit()
    db.refresh(ticket)
    return ticket


def create_space_alert_from_context(
    db: Session,
    *,
    ctx: AssistantContext,
    filters: dict[str, Any],
) -> SpaceAlert:
    alert = SpaceAlert(
        user_id=ctx.user_id,
        guest_id=ctx.guest_id,
        tenant_id=ctx.tenant_ids[0] if ctx.tenant_ids else None,
        search_filters=filters,
        status="active",
        is_active=True,
        notification_count=0,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def quality_metrics(db: Session) -> dict[str, Any]:
    total_messages = db.query(func.count(AssistantMessage.id)).scalar() or 0
    total_conversations = db.query(func.count(AssistantConversation.id)).scalar() or 0
    feedback_rows = db.query(AssistantFeedback).all()
    thumbs_down = len([row for row in feedback_rows if row.rating == "down"])
    missing: dict[str, int] = {}
    reliability: dict[str, int] = {}
    recent_reliability: list[dict[str, Any]] = []
    tool_failures: dict[str, int] = {}
    for msg in db.query(AssistantMessage).filter(AssistantMessage.event_metadata.isnot(None)).all():
        for event in (msg.event_metadata or {}).get("events", []):
            kind = str(event.get("kind") or ("missing_policy" if event.get("missing_policy_category") else "unknown"))
            reliability[kind] = reliability.get(kind, 0) + 1
            if kind != "unknown" and len(recent_reliability) < 20:
                conv = db.query(AssistantConversation).filter(AssistantConversation.id == msg.conversation_id).first()
                recent_reliability.append(
                    {
                        "kind": kind,
                        "conversation_public_id": conv.public_id if conv else None,
                        "message_public_id": msg.public_id,
                        "details": event,
                    }
                )
            if event.get("missing_policy_category"):
                key = str(event["missing_policy_category"])
                missing[key] = missing.get(key, 0) + 1
            if event.get("kind") == "missing_policy":
                key = str(event.get("category") or "unknown")
                missing[key] = missing.get(key, 0) + 1
        for call in msg.tool_calls or []:
            if call.get("status") == "failed":
                key = str(call.get("name") or "unknown")
                tool_failures[key] = tool_failures.get(key, 0) + 1
    usage_by_persona = []
    for audience, count in db.query(AssistantConversation.audience, func.count(AssistantConversation.id)).group_by(AssistantConversation.audience).all():
        usage_by_persona.append({"audience": audience, "conversations": count})
    low_rated = []
    for feedback in feedback_rows:
        if feedback.rating != "down":
            continue
        conv = db.query(AssistantConversation).filter(AssistantConversation.id == feedback.conversation_id).first()
        low_rated.append({"conversation_public_id": conv.public_id if conv else None, "reason": feedback.reason})
    return {
        "metrics": {
            "conversations": total_conversations,
            "messages": total_messages,
            "feedback_count": len(feedback_rows),
            "thumbs_down_rate": round(thumbs_down / len(feedback_rows), 3) if feedback_rows else 0,
        },
        "low_rated_conversations": low_rated[:20],
        "missing_policy_categories": [{"category": key, "count": value} for key, value in sorted(missing.items())],
        "reliability_events": [{"kind": key, "count": value} for key, value in sorted(reliability.items())],
        "recent_reliability_events": recent_reliability,
        "tool_failure_rates": [{"tool": key, "failures": value} for key, value in sorted(tool_failures.items())],
        "usage_by_persona": usage_by_persona,
        "abandoned_booking_drafts": [],
    }


def default_policy_scope(db: Session, ctx: AssistantContext) -> int | None:
    return primary_organization_id(db, ctx)
