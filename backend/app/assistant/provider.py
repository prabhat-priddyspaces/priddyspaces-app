from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings


@dataclass
class ProviderResult:
    text: str
    usage: dict[str, Any]
    model: str


def estimate_cost_usd(model: str, usage: dict[str, Any]) -> float:
    input_tokens = int(usage.get("input_tokens") or 0)
    output_tokens = int(usage.get("output_tokens") or 0)
    if model == settings.ASSISTANT_SUMMARY_MODEL:
        input_rate = settings.ASSISTANT_SUMMARY_INPUT_COST_PER_1M
        output_rate = settings.ASSISTANT_SUMMARY_OUTPUT_COST_PER_1M
    else:
        input_rate = settings.ASSISTANT_PRIMARY_INPUT_COST_PER_1M
        output_rate = settings.ASSISTANT_PRIMARY_OUTPUT_COST_PER_1M
    return round((input_tokens / 1_000_000 * input_rate) + (output_tokens / 1_000_000 * output_rate), 6)


def _extract_text(response: dict[str, Any]) -> str:
    if response.get("output_text"):
        return str(response["output_text"])
    parts: list[str] = []
    for item in response.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"} and content.get("text"):
                parts.append(str(content["text"]))
    return "\n".join(parts).strip()


def call_openai_response(
    *,
    instructions: str,
    input_text: str,
    model: str | None = None,
    text_schema: dict[str, Any] | None = None,
) -> ProviderResult | None:
    if not settings.OPENAI_API_KEY:
        return None
    chosen_model = model or settings.ASSISTANT_PRIMARY_MODEL
    payload: dict[str, Any] = {
        "model": chosen_model,
        "instructions": instructions,
        "input": input_text,
        "store": False,
    }
    if text_schema:
        payload["text"] = {
            "format": {
                "type": "json_schema",
                "name": "assistant_response",
                "strict": True,
                "schema": text_schema,
            }
        }
    try:
        response = httpx.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=25.0,
        )
        response.raise_for_status()
    except Exception:
        return None

    data = response.json()
    usage = data.get("usage") or {}
    return ProviderResult(text=_extract_text(data), usage=usage, model=chosen_model)
