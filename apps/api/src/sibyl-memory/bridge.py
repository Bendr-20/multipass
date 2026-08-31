#!/home/ubuntu/.openclaw/sibyl-venv/bin/python
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

from sibyl_memory_hermes import SibylMemoryProvider

MEMORY_KEY_PREFIX = "multipass_console_memory"
THREAD_KEY_PREFIX = "multipass_console_thread"
MAX_MEMORY_ENTRIES = 12
MAX_THREAD_MESSAGES = 20


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def state_key(prefix: str, namespace: str) -> str:
    return f"{prefix}:{namespace}"


def load_entries(provider: SibylMemoryProvider, key: str, field: str) -> list[dict]:
    state = provider.get_state(key) or {}
    body = state.get("body") if isinstance(state, dict) else {}
    entries = body.get(field) if isinstance(body, dict) else None
    return entries if isinstance(entries, list) else []


def normalize_tags(tags) -> list[str]:
    if not isinstance(tags, list):
        return []
    cleaned = []
    seen = set()
    for tag in tags:
      value = str(tag or "").strip()
      if not value or value in seen:
          continue
      seen.add(value)
      cleaned.append(value)
    return cleaned


def normalize_memory_entry(entry: dict) -> dict | None:
    text = str((entry or {}).get("text") or "").strip()
    if not text:
        return None
    return {
        "text": text,
        "tags": normalize_tags((entry or {}).get("tags")),
        "savedAt": str((entry or {}).get("savedAt") or utc_now()),
    }


def normalize_thread_message(message: dict) -> dict | None:
    text = str((message or {}).get("text") or "").strip()
    if not text:
        return None
    role = "human" if str((message or {}).get("role") or "agent") == "human" else "agent"
    normalized = {
        "id": str((message or {}).get("id") or ""),
        "role": role,
        "text": text,
        "sentAt": str((message or {}).get("sentAt") or utc_now()),
        "transport": str((message or {}).get("transport") or "live_chat"),
    }
    inference_provider = str((message or {}).get("inferenceProvider") or "").strip()
    if inference_provider:
        normalized["inferenceProvider"] = inference_provider
    return normalized


def append_memory(provider: SibylMemoryProvider, namespace: str, entry: dict) -> dict:
    key = state_key(MEMORY_KEY_PREFIX, namespace)
    entries = load_entries(provider, key, "entries")
    normalized = normalize_memory_entry(entry)
    if normalized is None:
        return {"ok": True, "entry": None}
    if not any(
        existing.get("text") == normalized["text"] and existing.get("tags") == normalized["tags"]
        for existing in entries
        if isinstance(existing, dict)
    ):
        entries.append(normalized)
        entries = entries[-MAX_MEMORY_ENTRIES:]
        provider.set_state(key, {"entries": entries})
    return {"ok": True, "entry": normalized}


def read_memory(provider: SibylMemoryProvider, namespace: str, limit: int) -> dict:
    key = state_key(MEMORY_KEY_PREFIX, namespace)
    entries = load_entries(provider, key, "entries")
    return {"ok": True, "entries": list(reversed(entries[-limit:]))}


def search_memory(provider: SibylMemoryProvider, namespace: str, query: str, limit: int) -> dict:
    key = state_key(MEMORY_KEY_PREFIX, namespace)
    entries = load_entries(provider, key, "entries")
    q = str(query or "").strip().lower()
    if not q:
        return {"ok": True, "entries": list(reversed(entries[-limit:]))}
    filtered = [
        entry for entry in entries
        if isinstance(entry, dict) and q in f"{entry.get('text', '')} {' '.join(entry.get('tags', []))}".lower()
    ]
    return {"ok": True, "entries": list(reversed(filtered[-limit:]))}


def append_thread(provider: SibylMemoryProvider, namespace: str, messages: list[dict]) -> dict:
    key = state_key(THREAD_KEY_PREFIX, namespace)
    entries = load_entries(provider, key, "messages")
    normalized = [value for value in (normalize_thread_message(message) for message in messages) if value]
    if normalized:
        entries.extend(normalized)
        entries = entries[-MAX_THREAD_MESSAGES:]
        provider.set_state(key, {"messages": entries})
    return {"ok": True, "messages": entries}


def read_thread(provider: SibylMemoryProvider, namespace: str, limit: int) -> dict:
    key = state_key(THREAD_KEY_PREFIX, namespace)
    entries = load_entries(provider, key, "messages")
    return {"ok": True, "messages": entries[-limit:]}


def main() -> int:
    payload = json.loads(sys.stdin.read() or "{}")
    action = str(payload.get("action") or "").strip()
    namespace = str(payload.get("namespace") or "").strip()
    provider = SibylMemoryProvider()

    if not action:
        raise ValueError("action is required")
    if action not in {"append_memory", "read_memory", "search_memory", "append_thread", "read_thread"}:
        raise ValueError(f"unsupported action: {action}")
    if not namespace:
        raise ValueError("namespace is required")

    if action == "append_memory":
        result = append_memory(provider, namespace, payload.get("entry") or {})
    elif action == "read_memory":
        result = read_memory(provider, namespace, int(payload.get("limit") or 5))
    elif action == "search_memory":
        result = search_memory(provider, namespace, str(payload.get("query") or ""), int(payload.get("limit") or 5))
    elif action == "append_thread":
        result = append_thread(provider, namespace, payload.get("messages") or [])
    else:
        result = read_thread(provider, namespace, int(payload.get("limit") or 10))

    sys.stdout.write(json.dumps(result))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover - bridge failure path
        sys.stderr.write(str(exc))
        raise SystemExit(1)
