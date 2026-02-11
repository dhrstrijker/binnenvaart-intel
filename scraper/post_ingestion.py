"""Post-ingestion maintenance tasks shared by V1/V2 runs."""

from __future__ import annotations

import logging

from db import run_dedup, supabase

logger = logging.getLogger(__name__)


def run_post_ingestion_tasks() -> None:
    """Run deduplication and enrichment/prediction tasks (non-fatal)."""
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

        all_vessels = supabase.table("vessels").select(
            "id, name, type, length_m, width_m, tonnage, build_year, price, source, "
            "raw_details, condition_signals_hash, condition_signals, "
            "structured_details_hash, structured_details"
        ).eq("status", "active").execute().data or []
        logger.info("Running condition extraction on %d active vessels...", len(all_vessels))
        extraction_result = run_extraction(all_vessels)
        logger.info(
            "Extraction: %d extracted, %d skipped, %d errors",
            extraction_result["extracted"],
            extraction_result["skipped"],
            extraction_result["errors"],
        )

        logger.info("Running structured extraction on %d active vessels...", len(all_vessels))
        struct_result = run_structured_extraction(all_vessels)
        logger.info(
            "Structured extraction: %d extracted, %d skipped, %d errors",
            struct_result["extracted"],
            struct_result["skipped"],
            struct_result["errors"],
        )

        all_vessels = supabase.table("vessels").select(
            "id, name, type, length_m, width_m, tonnage, build_year, price, source, "
            "condition_signals"
        ).eq("status", "active").execute().data or []
        logger.info("Running price predictions on %d active vessels...", len(all_vessels))
        prediction_result = predict_all(all_vessels)
        logger.info(
            "Predictions: %d predicted, %d suppressed, %d errors",
            prediction_result["predicted"],
            prediction_result["suppressed"],
            prediction_result["errors"],
        )
    except Exception:
        logger.exception("Condition extraction / price prediction failed (non-fatal)")

