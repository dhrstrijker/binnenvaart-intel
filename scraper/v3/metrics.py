from dataclasses import asdict, dataclass


@dataclass
class RunMetricsV3:
    external_request_count: int = 0
    supabase_read_count: int = 0
    supabase_write_count: int = 0
    parse_fail_count: int = 0
    selector_fail_count: int = 0
    detail_fetch_count: int = 0
    staged_count: int = 0
    queue_depth: int = 0
    queue_oldest_age_minutes: float | None = None
    notification_latency_seconds_p95: float | None = None
    inserted_count: int = 0
    price_changed_count: int = 0
    sold_count: int = 0
    removed_count: int = 0
    unchanged_count: int = 0

    def to_db_update(self) -> dict:
        return asdict(self)
