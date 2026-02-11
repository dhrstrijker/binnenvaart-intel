"""Post-ingestion maintenance tasks shared by V1/V2 runs."""

from __future__ import annotations

import logging

from db import run_dedup, supabase

logger = logging.getLogger(__name__)


def _load_active_vessels(select_clause: str, vessel_ids: list[str] | None = None) -> list[dict]:
    if vessel_ids is not None and not vessel_ids:
        return []
    query = supabase.table("vessels").select(select_clause).eq("status", "active")
    if vessel_ids is not None:
        query = query.in_("id", vessel_ids)
    return query.execute().data or []


def run_post_ingestion_tasks(changed_vessel_ids: list[str] | None = None, scope: str = "full") -> None:
    """Run deduplication and enrichment/prediction tasks (non-fatal)."""
    scope_normalized = (scope or "full").strip().lower()
    if scope_normalized not in {"full", "incremental"}:
        logger.warning("Unknown post-ingestion scope '%s'; defaulting to full", scope)
        scope_normalized = "full"

    candidate_ids: list[str] = []
    seen: set[str] = set()
    incremental_requested = scope_normalized == "incremental"
    incremental = incremental_requested and changed_vessel_ids is not None

    if incremental_requested and changed_vessel_ids is None:
        logger.info("Post-ingestion incremental scope requested but candidates unavailable; falling back to full scan")

    if incremental:
        for vessel_id in changed_vessel_ids or []:
            vessel_id_str = str(vessel_id).strip()
            if not vessel_id_str or vessel_id_str in seen:
                continue
            seen.add(vessel_id_str)
            candidate_ids.append(vessel_id_str)
        if not candidate_ids:
            logger.info("Post-ingestion incremental scope found zero changed vessels; skipping post-ingestion tasks")
            return

    extraction_scope_ids = candidate_ids if incremental else None
    prediction_target_ids = candidate_ids if incremental else None

    logger.info(
        "Post-ingestion scope=%s candidates=%d",
        "incremental" if incremental else "full",
        len(candidate_ids) if incremental else 0,
    )

    try:
        dedup_result = run_dedup()
        logger.info(
            "Dedup: %d clusters, %d duplicates linked",
            dedup_result["clusters"],
            dedup_result["linked"],
        )
    except Exception:
        logger.exception("Deduplication failed")

    try:
        from haiku_extract import run_extraction
        from price_model import predict_all
        from structured_extract import run_extraction as run_structured_extraction

        extraction_vessels = _load_active_vessels(
            "id, name, type, length_m, width_m, tonnage, build_year, price, source, "
            "raw_details, condition_signals_hash, condition_signals, "
            "structured_details_hash, structured_details",
            extraction_scope_ids,
        )
        logger.info(
            "Running condition extraction on %d active vessel(s)...",
            len(extraction_vessels),
        )
        extraction_result = run_extraction(extraction_vessels)
        logger.info(
            "Extraction: %d extracted, %d skipped, %d errors",
            extraction_result["extracted"],
            extraction_result["skipped"],
            extraction_result["errors"],
        )

        logger.info(
            "Running structured extraction on %d active vessel(s)...",
            len(extraction_vessels),
        )
        struct_result = run_structured_extraction(extraction_vessels)
        logger.info(
            "Structured extraction: %d extracted, %d skipped, %d errors",
            struct_result["extracted"],
            struct_result["skipped"],
            struct_result["errors"],
        )

        if prediction_target_ids is not None:
            active_target_ids = {str(v.get("id")) for v in extraction_vessels if v.get("id")}
            prediction_target_ids = [vessel_id for vessel_id in prediction_target_ids if vessel_id in active_target_ids]
            if not prediction_target_ids:
                logger.info("No active candidate vessels for price prediction; skipping prediction step")
                return

        fleet_vessels = _load_active_vessels(
            "id, name, type, length_m, width_m, tonnage, build_year, price, source, "
            "condition_signals"
        )
        logger.info(
            "Running price predictions on %d active vessel(s)%s...",
            len(fleet_vessels),
            f" (targeting {len(prediction_target_ids)} candidate vessel(s))"
            if prediction_target_ids is not None
            else "",
        )
        prediction_result = predict_all(fleet_vessels, target_ids=prediction_target_ids)
        logger.info(
            "Predictions: %d predicted, %d suppressed, %d errors",
            prediction_result["predicted"],
            prediction_result["suppressed"],
            prediction_result["errors"],
        )
    except Exception:
        logger.exception("Condition extraction / price prediction failed (non-fatal)")
