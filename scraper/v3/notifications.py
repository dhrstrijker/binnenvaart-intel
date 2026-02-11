"""V3 notification outbox dispatch."""

from __future__ import annotations

import logging

from notifications import send_personalized_notifications
from v3.db import (
    load_outbox_pending,
    load_vessels_by_source_ids,
    mark_outbox_failed,
    mark_outbox_sent,
)

logger = logging.getLogger(__name__)


def _build_change_from_outbox_row(row: dict, vessel: dict | None) -> dict | None:
    payload = row.get("payload") or {}
    source_id = str(payload.get("_source_id") or payload.get("source_id") or "")
    if not source_id or not vessel:
        return None

    old_price = payload.get("_old_price")
    new_price = payload.get("_new_price")

    return {
        "kind": row["event_type"],
        "vessel": vessel,
        "old_price": old_price,
        "new_price": new_price if new_price is not None else vessel.get("price"),
        "recorded_at": row.get("created_at"),
    }


def dispatch_outbox_notifications_v3(limit: int = 200) -> dict:
    pending = load_outbox_pending(limit=limit)
    if not pending:
        return {"pending": 0, "sent": 0, "failed": 0}

    ids = [row["id"] for row in pending]
    vessel_map_by_source: dict[str, dict[str, dict]] = {}
    for source in sorted({row["source"] for row in pending}):
        source_ids = [
            str((row.get("payload") or {}).get("_source_id") or (row.get("payload") or {}).get("source_id") or "")
            for row in pending
            if row["source"] == source
        ]
        vessel_map_by_source[source] = load_vessels_by_source_ids(source, source_ids)

    changes = []
    for row in pending:
        payload = row.get("payload") or {}
        source_id = str(payload.get("_source_id") or payload.get("source_id") or "")
        vessel = vessel_map_by_source.get(row["source"], {}).get(source_id)
        change = _build_change_from_outbox_row(row, vessel)
        if change:
            changes.append(change)

    if not changes:
        mark_outbox_sent(ids)
        return {"pending": len(pending), "sent": len(ids), "failed": 0}

    stats = {
        "total": len(changes),
        "inserted": sum(1 for c in changes if c["kind"] == "inserted"),
        "price_changed": sum(1 for c in changes if c["kind"] == "price_changed"),
        "unchanged": 0,
    }

    try:
        send_personalized_notifications(stats, changes)
    except Exception as exc:
        logger.exception("V3 outbox notification dispatch failed")
        mark_outbox_failed(ids, str(exc))
        return {"pending": len(pending), "sent": 0, "failed": len(ids)}

    mark_outbox_sent(ids)
    return {"pending": len(pending), "sent": len(ids), "failed": 0}
