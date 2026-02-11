import logging
import os

from v2.config import DEFAULT_SOURCE_CONFIGS
from v2.pipeline import PipelineV2
from v2.sources.galle_v2 import GalleAdapter
from v2.sources.gsk_v2 import GSKAdapter
from v2.sources.gtsschepen_v2 import GTSSchepenAdapter
from v2.sources.pcshipbrokers_v2 import PCShipbrokersAdapter
from v2.sources.rensendriessen_v2 import RensenDriessenAdapter

logger = logging.getLogger(__name__)


ADAPTERS = {
    "galle": GalleAdapter,
    "rensendriessen": RensenDriessenAdapter,
    "pcshipbrokers": PCShipbrokersAdapter,
    "gtsschepen": GTSSchepenAdapter,
    "gsk": GSKAdapter,
}


def _parse_sources() -> list[str]:
    raw = os.environ.get("PIPELINE_V2_SOURCES", "galle,rensendriessen,pcshipbrokers,gtsschepen,gsk")
    return [s.strip() for s in raw.split(",") if s.strip()]


def run_pipeline_v2() -> list[dict]:
    mode = os.environ.get("PIPELINE_V2_MODE", "shadow").strip().lower()
    if mode not in {"shadow", "authoritative"}:
        raise ValueError("PIPELINE_V2_MODE must be 'shadow' or 'authoritative'")

    sources = _parse_sources()
    pipeline = PipelineV2(mode=mode)
    results = []

    logger.info("Starting pipeline v2 in %s mode for sources: %s", mode, ", ".join(sources))

    for source in sources:
        config = DEFAULT_SOURCE_CONFIGS.get(source)
        adapter_cls = ADAPTERS.get(source)

        if not config:
            logger.warning("Skipping unknown v2 source config: %s", source)
            continue
        if not adapter_cls:
            logger.warning("Skipping source without v2 adapter implementation: %s", source)
            continue

        adapter = adapter_cls()
        result = pipeline.run_source(adapter, config)
        results.append(result)
        logger.info(
            "v2 %s: listings=%d inserted=%d price_changed=%d sold=%d removed=%d unchanged=%d details=%d",
            source,
            result["listings"],
            result["inserted"],
            result["price_changed"],
            result["sold"],
            result["removed"],
            result["unchanged"],
            result["detail_fetch_count"],
        )

    logger.info("Pipeline v2 completed for %d source(s)", len(results))
    return results
