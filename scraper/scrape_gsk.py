import logging
import time

import requests

from db import upsert_vessel

logger = logging.getLogger(__name__)

GRAPHQL_URL = "https://www.gskbrokers.eu/graphql"
PAGE_SIZE = 50

QUERY = """
query GetVessels($skip: Int!, $limit: Int!) {
  getVessels(
    pagination: { skip: $skip, limit: $limit }
    sort: { field: RECENT, order: DESC }
  ) {
    totalCount
    vessels {
      id
      legacyId
      vesselName
      slug
      general {
        type
        yearOfBuild
        price
        priceVisible
        priceDropped
        status
        vesselDimensions {
          length
          width
          draft
        }
        tonnage {
          maxTonnage
        }
      }
      gallery {
        filename
      }
      technics {
        engines {
          make
          power
          powerType
          yearOfBuild
        }
      }
    }
  }
}
"""

DETAIL_QUERY = """
query GetVesselBySlug($slug: String!) {
  getVesselBySlug(slug: $slug) {
    description { locale value }
    general {
      euroNumber
      welded
      riveted
      shipyard
      vesselDimensions { length width draft depth }
      buildInformation { locale value }
      particularities { locale value }
      tonnage { maxTonnage at1m90 at2m20 at2m50 at2m80 at3m00 }
      certificates { title validUntil }
      pushCertificate
      oneManCertified
      oneManRadarCertified
      numberOfHolds
      cargoholdCapacity
      trimFill
      doubleHull
      semiDoubleHull
      cargoholdTopDim
      cargoholdTopLength
      cargoholdTopWidth
      cargoholdBottomDim
      cargoholdBottomLength
      cargoholdBottomWidth
      innerBottomMaterial
      innerBottomThickness
      innerBottomYearOfBuild
      containers
      washBulkhead
      midDeckConnection
      heightCoaming
      framesCovered
      cargoholdBeams
      cargoholdHatchesType
      cargoholdHatchesMake
      cargoholdYearOfBuild
      hatchCraneType
      hatchCraneMake
      hatchCraneYearOfBuild
      airdraftWithBallast
      airdraftWithoutBallast
      airdraftWheelhouseLowered
    }
    wheelhouse {
      wheelhouseMaterial { locale value }
      wheelhouseModel
      wheelhouseYearOfBuild
      wheelhouseElevating
      wheelhouseFoldable
      wheelhouseColumn
      wheelhouseScissors
      wheelhouseInnerPassage
      wheelhouseSightHeight
      tanksSternFuel
      tanksSternFreshWater
      tanksSternDirtyWater
      tanksSternDirtyOil
      tanksSternOther
      tanksForeshipFuel
      tanksForeshipFreshWater
      tanksForeshipDirtyWater
      tanksForeshipDirtyOil
      tanksForeshipOther
      ballastTanksCapacityBack
      ballastTanksCapacityMiddle
      ballastTanksCapacityFront
      ballastTanksCapacityDoubleHull
    }
    technics {
      engines {
        description make type power powerType tpm yearOfBuild
        revision runningHours environmentalClassification
        remarks { locale value }
      }
      gearboxes {
        make type reduction yearOfBuild revision runningHours
        remarks { locale value }
      }
      generators {
        make type power kva yearOfBuild revision runningHours
        remarks { locale value }
      }
      bowthrusterMake
      bowthrusterSystem
    }
    steering {
      steeringGear { make type system rudders }
      propellor { make type material sparePropellor nozzle }
      bowthruster { make type yearOfBuild }
    }
    equipment {
      additionalEquipment { locale value }
      winchesForeShip { make type wireDrum chainDisks }
      winchesStern { make type wireDrum chainDisks }
      retractableMooringPole { make type length yearOfBuild }
      carCrane { make type length weight yearOfBuild }
      mastForeShip
      mastStern
      pump { number capacity make description { locale value } }
      ballastPump { number capacity make description { locale value } }
      deckWashPump { number capacity make description { locale value } }
      otherPumpEquipment
      nauticalEquipment {
        radars { type make yearOfBuild }
        radios { type make yearOfBuild }
        gps ais camerasYearOfBuild
        pilot { type make yearOfBuild }
        echoSounder { type make yearOfBuild }
        steeringIndicator { type make yearOfBuild }
        otherNauticalEquipment
      }
      electricalEquipment {
        heating airconditioning solarPanels batteries
        shoreConnection shaftGenerator otherElectricalEquipment
      }
    }
  }
}
"""

# GSK API type enum -> Dutch vessel type
TYPE_MAP = {
    "TONS_250_399": "Motorvrachtschip",
    "TONS_400_499": "Motorvrachtschip",
    "TONS_500_749": "Motorvrachtschip",
    "TONS_750_999": "Motorvrachtschip",
    "TONS_1000_1499": "Motorvrachtschip",
    "TONS_1500": "Motorvrachtschip",
    "PUSH_BARGE": "Duwbak",
    "PUSH_BOAT": "Duw/Sleepboot",
    "TANKERS_9005_9995": "Tankschip",
    "YAUGHT": "Jacht",
    "HOUSEBOAT": "Woonschip",
    "CEMENT_TANKER": "Tankschip",
    "DUMP_BARGE": "Beunschip",
    "BARGE": "Koppelverband",
    "TUG_105_195": "Duw/Sleepboot",
    "PASSENGER_SHIP": "Passagiersschip",
    "POWDER_TANKER": "Tankschip",
    "NEWLY_BUILD": "Nieuwbouw",
}


def _fetch_with_retry(url, json_body, retries=3):
    """POST a GraphQL request with exponential-backoff retries."""
    for attempt in range(1, retries + 1):
        try:
            resp = requests.post(url, json=json_body, timeout=30)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            if attempt == retries:
                raise
            wait = 2 ** (attempt - 1)
            logger.warning("Attempt %d failed: %s. Retrying in %ds...", attempt, e, wait)
            time.sleep(wait)


def map_type(raw_type: str | None) -> str | None:
    """Map a GSK API type enum value to a Dutch vessel type name."""
    if raw_type is None:
        return None
    return TYPE_MAP.get(raw_type)


def build_image_url(legacy_id: str, filename: str) -> str:
    """Build an imgix image URL from a legacy ID and filename."""
    return f"https://gskbrokers.imgix.net/vessels/{legacy_id}/images/{filename}?fit=crop&w=600&h=400"


def _resolve_title(title_list, lang="nl"):
    """Extract a single text value from a VesselTitle list.

    VesselTitle is [{locale: "nl", value: "..."}, {locale: "en", value: "..."}].
    Prefers the requested language, falls back to first non-empty value.
    """
    if not title_list:
        return None
    if isinstance(title_list, str):
        return title_list
    for item in title_list:
        if isinstance(item, dict) and item.get("locale") == lang and item.get("value"):
            return item["value"]
    # Fallback: first non-empty value
    for item in title_list:
        if isinstance(item, dict) and item.get("value"):
            return item["value"]
    return None


def _clean_detail(obj):
    """Recursively remove None values and empty dicts/lists from detail data."""
    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            v = _clean_detail(v)
            if v is not None and v != {} and v != []:
                cleaned[k] = v
        return cleaned or None
    if isinstance(obj, list):
        cleaned = [_clean_detail(item) for item in obj]
        cleaned = [item for item in cleaned if item is not None and item != {} and item != []]
        return cleaned or None
    return obj


def parse_detail(detail_data: dict) -> dict | None:
    """Parse the raw GraphQL detail response into a flat raw_details dict."""
    if not detail_data:
        return None

    specs = {}

    # Description
    desc = _resolve_title(detail_data.get("description"))
    if desc:
        specs["description"] = desc

    # General section
    gen = detail_data.get("general") or {}
    if gen.get("euroNumber"):
        specs["euro_number"] = gen["euroNumber"]
    if gen.get("welded") is not None:
        specs["welded"] = gen["welded"]
    if gen.get("riveted") is not None:
        specs["riveted"] = gen["riveted"]
    if gen.get("shipyard"):
        specs["shipyard"] = gen["shipyard"]

    dims = gen.get("vesselDimensions") or {}
    if dims.get("depth") is not None:
        specs["depth"] = dims["depth"]

    build_info = _resolve_title(gen.get("buildInformation"))
    if build_info:
        specs["build_information"] = build_info

    particularities = _resolve_title(gen.get("particularities"))
    if particularities:
        specs["particularities"] = particularities

    # Tonnage at various drafts
    tonnage = gen.get("tonnage") or {}
    tonnage_details = {}
    for key in ("maxTonnage", "at1m90", "at2m20", "at2m50", "at2m80", "at3m00"):
        if tonnage.get(key) is not None:
            tonnage_details[key] = tonnage[key]
    if tonnage_details:
        specs["tonnage_details"] = tonnage_details

    # Certificates
    certs = gen.get("certificates") or []
    cert_list = [c for c in certs if c.get("title")]
    if cert_list:
        specs["certificates"] = cert_list

    for flag in ("pushCertificate", "oneManCertified", "oneManRadarCertified"):
        if gen.get(flag) is not None:
            specs[flag] = gen[flag]

    # Cargo holds
    cargo = {}
    for key in ("numberOfHolds", "cargoholdCapacity", "trimFill", "doubleHull", "semiDoubleHull",
                "cargoholdTopDim", "cargoholdTopLength", "cargoholdTopWidth",
                "cargoholdBottomDim", "cargoholdBottomLength", "cargoholdBottomWidth",
                "innerBottomMaterial", "innerBottomThickness", "innerBottomYearOfBuild",
                "washBulkhead", "midDeckConnection", "heightCoaming",
                "framesCovered", "cargoholdBeams",
                "cargoholdHatchesType", "cargoholdHatchesMake", "cargoholdYearOfBuild",
                "hatchCraneType", "hatchCraneMake", "hatchCraneYearOfBuild"):
        if gen.get(key) is not None:
            cargo[key] = gen[key]
    if cargo:
        specs["cargohold"] = cargo

    # Airdraft
    airdraft = {}
    for key in ("airdraftWithBallast", "airdraftWithoutBallast", "airdraftWheelhouseLowered"):
        if gen.get(key) is not None:
            airdraft[key] = gen[key]
    if airdraft:
        specs["airdraft"] = airdraft

    # Containers (String field in GSK)
    if gen.get("containers"):
        specs["containers"] = gen["containers"]

    # Wheelhouse
    wh = detail_data.get("wheelhouse") or {}
    wheelhouse = {}
    wh_material = _resolve_title(wh.get("wheelhouseMaterial"))
    if wh_material:
        wheelhouse["material"] = wh_material
    if wh.get("wheelhouseModel"):
        wheelhouse["model"] = wh["wheelhouseModel"]
    if wh.get("wheelhouseYearOfBuild") is not None:
        wheelhouse["yearOfBuild"] = wh["wheelhouseYearOfBuild"]
    for key in ("wheelhouseElevating", "wheelhouseFoldable", "wheelhouseColumn",
                "wheelhouseScissors", "wheelhouseInnerPassage"):
        if wh.get(key) is not None:
            # Strip 'wheelhouse' prefix for cleaner output
            short_key = key[len("wheelhouse"):]
            short_key = short_key[0].lower() + short_key[1:]
            wheelhouse[short_key] = wh[key]
    if wh.get("wheelhouseSightHeight"):
        wheelhouse["sightHeight"] = wh["wheelhouseSightHeight"]

    # Tanks
    tanks = {}
    for key in ("tanksSternFuel", "tanksSternFreshWater", "tanksSternDirtyWater",
                "tanksSternDirtyOil", "tanksSternOther",
                "tanksForeshipFuel", "tanksForeshipFreshWater",
                "tanksForeshipDirtyWater", "tanksForeshipDirtyOil", "tanksForeshipOther"):
        if wh.get(key) is not None:
            tanks[key] = wh[key]
    if tanks:
        wheelhouse["tanks"] = tanks

    # Ballast
    ballast = {}
    for key in ("ballastTanksCapacityBack", "ballastTanksCapacityMiddle",
                "ballastTanksCapacityFront", "ballastTanksCapacityDoubleHull"):
        if wh.get(key) is not None:
            ballast[key] = wh[key]
    if ballast:
        wheelhouse["ballast"] = ballast

    if wheelhouse:
        specs["wheelhouse"] = wheelhouse

    # Technics
    tech = detail_data.get("technics") or {}
    engines = tech.get("engines") or []
    if engines:
        parsed_engines = []
        for eng in engines:
            e = {}
            for k, v in eng.items():
                if k == "remarks":
                    # remarks is LIST<VesselTitle>
                    resolved = _resolve_title(v)
                    if resolved:
                        e["remarks"] = resolved
                elif v is not None:
                    e[k] = v
            if e:
                parsed_engines.append(e)
        if parsed_engines:
            specs["engines"] = parsed_engines
    gearboxes = tech.get("gearboxes") or []
    if gearboxes:
        parsed_gb = []
        for gb in gearboxes:
            g = {}
            for k, v in gb.items():
                if k == "remarks":
                    resolved = _resolve_title(v)
                    if resolved:
                        g["remarks"] = resolved
                elif v is not None:
                    g[k] = v
            if g:
                parsed_gb.append(g)
        if parsed_gb:
            specs["gearboxes"] = parsed_gb
    generators = tech.get("generators") or []
    if generators:
        parsed_gen = []
        for gen_item in generators:
            g = {}
            for k, v in gen_item.items():
                if k == "remarks":
                    resolved = _resolve_title(v)
                    if resolved:
                        g["remarks"] = resolved
                elif v is not None:
                    g[k] = v
            if g:
                parsed_gen.append(g)
        if parsed_gen:
            specs["generators"] = parsed_gen
    if tech.get("bowthrusterMake"):
        specs["bowthruster_make"] = tech["bowthrusterMake"]
    if tech.get("bowthrusterSystem"):
        specs["bowthruster_system"] = tech["bowthrusterSystem"]

    # Steering
    steer = detail_data.get("steering") or {}
    steering = {}
    sg = steer.get("steeringGear") or {}
    sg_data = {k: v for k, v in sg.items() if v is not None}
    if sg_data:
        steering["steeringGear"] = sg_data

    prop = steer.get("propellor") or {}
    propellor = {k: v for k, v in prop.items() if v is not None}
    if propellor:
        steering["propellor"] = propellor

    bt = steer.get("bowthruster") or {}
    bowthruster = {k: v for k, v in bt.items() if v is not None}
    if bowthruster:
        steering["bowthruster"] = bowthruster

    if steering:
        specs["steering"] = steering

    # Equipment
    equip = detail_data.get("equipment") or {}
    equipment = {}

    # Winches
    for key in ("winchesForeShip", "winchesStern"):
        w = equip.get(key)
        if w and any(v is not None for v in w.values()):
            equipment[key] = {k: v for k, v in w.items() if v is not None}

    # Retractable mooring pole
    pole = equip.get("retractableMooringPole")
    if pole and any(v is not None for v in pole.values()):
        equipment["retractableMooringPole"] = {k: v for k, v in pole.items() if v is not None}

    # Car crane
    crane = equip.get("carCrane")
    if crane and any(v is not None for v in crane.values()):
        equipment["carCrane"] = {k: v for k, v in crane.items() if v is not None}

    # Masts
    for key in ("mastForeShip", "mastStern"):
        if equip.get(key):
            equipment[key] = equip[key]

    # Pumps
    for key in ("pump", "ballastPump", "deckWashPump"):
        p = equip.get(key)
        if p:
            pump_data = {}
            for pk, pv in p.items():
                if pk == "description":
                    desc = _resolve_title(pv)
                    if desc:
                        pump_data["description"] = desc
                elif pv is not None:
                    pump_data[pk] = pv
            if pump_data:
                equipment[key] = pump_data

    if equip.get("otherPumpEquipment"):
        equipment["otherPumpEquipment"] = equip["otherPumpEquipment"]

    # Nautical equipment
    naut = equip.get("nauticalEquipment") or {}
    nautical = {}
    for key in ("radars", "radios", "pilot", "echoSounder", "steeringIndicator"):
        item = naut.get(key)
        if item and any(v is not None for v in item.values()):
            nautical[key] = {k: v for k, v in item.items() if v is not None}
    for key in ("gps", "ais", "camerasYearOfBuild", "otherNauticalEquipment"):
        if naut.get(key):
            nautical[key] = naut[key]
    if nautical:
        equipment["nauticalEquipment"] = nautical

    # Electrical equipment
    elec = equip.get("electricalEquipment") or {}
    electrical = {}
    for key in ("heating", "airconditioning", "solarPanels", "batteries",
                "shaftGenerator", "otherElectricalEquipment"):
        if elec.get(key):
            electrical[key] = elec[key]
    if elec.get("shoreConnection") is not None:
        electrical["shoreConnection"] = elec["shoreConnection"]
    if electrical:
        equipment["electricalEquipment"] = electrical

    # Additional equipment
    add_eq = _resolve_title(equip.get("additionalEquipment"))
    if add_eq:
        equipment["additionalEquipment"] = add_eq

    if equipment:
        specs["equipment"] = equipment

    return _clean_detail(specs)


def _fetch_detail(slug: str) -> dict | None:
    """Fetch full vessel details via getVesselBySlug GraphQL query."""
    try:
        resp = _fetch_with_retry(GRAPHQL_URL, {
            "query": DETAIL_QUERY,
            "variables": {"slug": slug},
        })
    except requests.RequestException:
        logger.warning("Could not fetch detail for slug: %s", slug)
        return None

    data = resp.json()
    vessel_data = (data.get("data") or {}).get("getVesselBySlug")
    if not vessel_data:
        logger.warning("No detail data returned for slug: %s", slug)
        return None

    return parse_detail(vessel_data)


def parse_vessel(vessel: dict) -> dict | None:
    """Convert a GSK GraphQL vessel object to our vessel schema.

    Returns None if the vessel should be skipped (not FOR_SALE).
    """
    general = vessel.get("general") or {}

    if general.get("status") != "FOR_SALE":
        return None

    name = (vessel.get("vesselName") or "").strip()
    if not name:
        logger.debug("Skipping vessel with empty name (id=%s)", vessel.get("id"))
        return None

    slug = vessel.get("slug")
    legacy_id = vessel.get("legacyId")

    # Price
    price = None
    if general.get("priceVisible") and general.get("price") is not None:
        try:
            price = float(general["price"])
        except (ValueError, TypeError):
            pass

    # Dimensions
    dims = general.get("vesselDimensions") or {}
    length_m = None
    width_m = None
    if dims.get("length") is not None:
        try:
            length_m = float(dims["length"])
        except (ValueError, TypeError):
            pass
    if dims.get("width") is not None:
        try:
            width_m = float(dims["width"])
        except (ValueError, TypeError):
            pass

    # Tonnage
    tonnage = None
    tonnage_data = general.get("tonnage") or {}
    if tonnage_data.get("maxTonnage") is not None:
        try:
            tonnage = float(tonnage_data["maxTonnage"])
        except (ValueError, TypeError):
            pass

    # Build year
    build_year = general.get("yearOfBuild")
    if build_year is not None:
        try:
            build_year = int(build_year)
        except (ValueError, TypeError):
            build_year = None

    # Type
    vessel_type = map_type(general.get("type"))

    # Images
    gallery = vessel.get("gallery") or []
    image_url = None
    image_urls = None
    if gallery and legacy_id:
        image_url = build_image_url(legacy_id, gallery[0]["filename"])
        image_urls = [
            build_image_url(legacy_id, img["filename"])
            for img in gallery
            if img.get("filename")
        ]

    # Raw details: engine info, draft, original type enum
    raw_details = {}
    if dims.get("draft") is not None:
        raw_details["draft"] = dims["draft"]
    if general.get("type"):
        raw_details["gsk_type"] = general["type"]
    if general.get("priceDropped") is not None:
        raw_details["price_dropped"] = general["priceDropped"]

    technics = vessel.get("technics") or {}
    engines = technics.get("engines") or []
    if engines:
        raw_details["engines"] = [
            {k: v for k, v in eng.items() if v is not None}
            for eng in engines
        ]

    detail_url = f"https://www.gskbrokers.eu/nl/schip/{slug}" if slug else None

    return {
        "source": "gsk",
        "source_id": str(slug) if slug else str(vessel.get("id")),
        "name": name,
        "type": vessel_type,
        "length_m": length_m,
        "width_m": width_m,
        "build_year": build_year,
        "tonnage": tonnage,
        "price": price,
        "url": detail_url,
        "image_url": image_url,
        "image_urls": image_urls,
        "raw_details": raw_details or None,
    }


def scrape() -> dict:
    """Scrape GSK Brokers via GraphQL and upsert vessels. Returns a summary dict."""
    stats = {"inserted": 0, "price_changed": 0, "unchanged": 0, "error": 0, "total": 0}

    skip = 0
    total_count = None

    while True:
        logger.info("Fetching vessels skip=%d limit=%d...", skip, PAGE_SIZE)
        resp = _fetch_with_retry(GRAPHQL_URL, {
            "query": QUERY,
            "variables": {"skip": skip, "limit": PAGE_SIZE},
        })
        data = resp.json()

        get_vessels = data.get("data", {}).get("getVessels", {})
        vessels = get_vessels.get("vessels") or []
        if total_count is None:
            total_count = get_vessels.get("totalCount", 0)
            logger.info("Total vessels on GSK: %d", total_count)

        if not vessels:
            logger.info("No more vessels at skip=%d, stopping.", skip)
            break

        for v in vessels:
            parsed = parse_vessel(v)
            if parsed is None:
                continue

            # Fetch detail page for comprehensive raw_details
            slug = v.get("slug")
            if slug:
                detail_specs = _fetch_detail(slug)
                if detail_specs:
                    # Merge detail specs into raw_details (detail takes precedence)
                    existing_raw = parsed.get("raw_details") or {}
                    existing_raw.update(detail_specs)
                    parsed["raw_details"] = existing_raw
                    logger.info(
                        "  %s — specs: %d keys",
                        parsed["name"], len(detail_specs),
                    )

            result = upsert_vessel(parsed)
            stats[result] += 1
            stats["total"] += 1

        skip += PAGE_SIZE
        if skip >= total_count:
            break

    logger.info("GSK: scraped %d for-sale vessels out of %d total.", stats["total"], total_count or 0)
    return stats


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    summary = scrape()
    logger.info("GSK Brokers: %s", summary)
