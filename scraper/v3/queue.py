"""Queue operations for detail-worker runs."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from db import supabase


class DetailQueueV3:
    @staticmethod
    def claim_jobs(source: str, limit: int) -> list[dict]:
        result = supabase.rpc(
            "claim_detail_jobs_v3",
            {"p_source": source, "p_limit": max(1, int(limit))},
        ).execute()
        return result.data or []

    @staticmethod
    def mark_done(job_id: str) -> None:
        supabase.table("scrape_detail_queue_v3").update(
            {
                "status": "done",
                "locked_at": None,
                "locked_by": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", job_id).execute()

    @staticmethod
    def mark_retry(job: dict, error_message: str) -> None:
        attempt_count = int(job.get("attempt_count", 0)) + 1
        max_attempts = int(job.get("max_attempts", 3))
        if attempt_count >= max_attempts:
            DetailQueueV3.mark_dead(job["id"], error_message)
            return

        backoff_minutes = min(2 ** max(0, attempt_count - 1), 30)
        next_attempt = datetime.now(timezone.utc) + timedelta(minutes=backoff_minutes)
        supabase.table("scrape_detail_queue_v3").update(
            {
                "status": "pending",
                "attempt_count": attempt_count,
                "last_error": (error_message or "")[:500],
                "next_attempt_at": next_attempt.isoformat(),
                "locked_at": None,
                "locked_by": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", job["id"]).execute()

    @staticmethod
    def mark_dead(job_id: str, error_message: str) -> None:
        supabase.table("scrape_detail_queue_v3").update(
            {
                "status": "dead",
                "last_error": (error_message or "")[:500],
                "locked_at": None,
                "locked_by": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", job_id).execute()
