from scrape_gsk import map_type, build_image_url, parse_vessel, _resolve_title, _clean_detail, parse_detail


def _make_vessel(overrides=None):
    """Build a sample GSK GraphQL vessel dict for testing."""
    base = {
        "id": "69844e25a49893e3ddaf2ae0",
        "legacyId": "6279264777273344",
        "vesselName": "Montana II",
        "slug": "montana-ii",
        "general": {
            "type": "PUSH_BARGE",
            "yearOfBuild": 1992,
            "price": 895000,
            "priceVisible": True,
            "priceDropped": None,
            "status": "FOR_SALE",
            "vesselDimensions": {"length": 92.12, "width": 11.49, "draft": 3.71},
            "tonnage": {"maxTonnage": 2480.23},
        },
        "gallery": [
            {"filename": "Montana 1.jpg"},
            {"filename": "MK 13.jpeg"},
        ],
        "technics": {
            "engines": [
                {"make": "Cummins", "power": 775, "powerType": "HP", "yearOfBuild": 2006}
            ]
        },
    }
    if overrides:
        for key, value in overrides.items():
            if isinstance(value, dict) and isinstance(base.get(key), dict):
                base[key].update(value)
            else:
                base[key] = value
    return base


class TestMapType:
    def test_push_barge(self):
        assert map_type("PUSH_BARGE") == "Duwbak"

    def test_push_boat(self):
        assert map_type("PUSH_BOAT") == "Duw/Sleepboot"

    def test_tonnage_variants_all_motorvrachtschip(self):
        for t in ("TONS_250_399", "TONS_400_499", "TONS_500_749",
                   "TONS_750_999", "TONS_1000_1499", "TONS_1500"):
            assert map_type(t) == "Motorvrachtschip", f"Failed for {t}"

    def test_tanker_types(self):
        assert map_type("TANKERS_9005_9995") == "Tankschip"
        assert map_type("CEMENT_TANKER") == "Tankschip"
        assert map_type("POWDER_TANKER") == "Tankschip"

    def test_other_types(self):
        assert map_type("YAUGHT") == "Jacht"
        assert map_type("HOUSEBOAT") == "Woonschip"
        assert map_type("DUMP_BARGE") == "Beunschip"
        assert map_type("BARGE") == "Koppelverband"
        assert map_type("TUG_105_195") == "Duw/Sleepboot"
        assert map_type("PASSENGER_SHIP") == "Passagiersschip"
        assert map_type("NEWLY_BUILD") == "Nieuwbouw"

    def test_none(self):
        assert map_type(None) is None

    def test_unknown_type(self):
        assert map_type("UNKNOWN_FUTURE_TYPE") is None


class TestBuildImageUrl:
    def test_standard(self):
        url = build_image_url("6279264777273344", "Montana 1.jpg")
        assert url == (
            "https://gskbrokers.imgix.net/vessels/6279264777273344"
            "/images/Montana 1.jpg?fit=crop&w=600&h=400"
        )

    def test_special_chars_in_filename(self):
        url = build_image_url("123", "photo (2).jpeg")
        assert "photo (2).jpeg" in url
        assert url.startswith("https://gskbrokers.imgix.net/vessels/123/images/")


class TestParseVessel:
    def test_basic_vessel(self):
        v = parse_vessel(_make_vessel())
        assert v["source"] == "gsk"
        assert v["source_id"] == "montana-ii"
        assert v["name"] == "Montana II"
        assert v["type"] == "Duwbak"
        assert v["length_m"] == 92.12
        assert v["width_m"] == 11.49
        assert v["build_year"] == 1992
        assert v["tonnage"] == 2480.23
        assert v["price"] == 895000.0
        assert v["url"] == "https://www.gskbrokers.eu/nl/schip/montana-ii"

    def test_image_url(self):
        v = parse_vessel(_make_vessel())
        assert v["image_url"] == (
            "https://gskbrokers.imgix.net/vessels/6279264777273344"
            "/images/Montana 1.jpg?fit=crop&w=600&h=400"
        )

    def test_image_urls_list(self):
        v = parse_vessel(_make_vessel())
        assert len(v["image_urls"]) == 2
        assert "Montana 1.jpg" in v["image_urls"][0]
        assert "MK 13.jpeg" in v["image_urls"][1]

    def test_not_for_sale_skipped(self):
        v = parse_vessel(_make_vessel({"general": {"status": "SOLD"}}))
        assert v is None

    def test_price_not_visible(self):
        v = parse_vessel(_make_vessel({"general": {"priceVisible": False}}))
        assert v["price"] is None

    def test_price_none(self):
        v = parse_vessel(_make_vessel({"general": {"price": None}}))
        assert v["price"] is None

    def test_no_gallery(self):
        v = parse_vessel(_make_vessel({"gallery": []}))
        assert v["image_url"] is None
        assert v["image_urls"] is None

    def test_no_tonnage(self):
        v = parse_vessel(_make_vessel({"general": {"tonnage": {"maxTonnage": None}}}))
        assert v["tonnage"] is None

    def test_no_dimensions(self):
        v = parse_vessel(_make_vessel({"general": {"vesselDimensions": {}}}))
        assert v["length_m"] is None
        assert v["width_m"] is None

    def test_raw_details_contains_engine(self):
        v = parse_vessel(_make_vessel())
        assert v["raw_details"] is not None
        assert "engines" in v["raw_details"]
        assert v["raw_details"]["engines"][0]["make"] == "Cummins"

    def test_raw_details_contains_draft(self):
        v = parse_vessel(_make_vessel())
        assert v["raw_details"]["draft"] == 3.71

    def test_raw_details_contains_gsk_type(self):
        v = parse_vessel(_make_vessel())
        assert v["raw_details"]["gsk_type"] == "PUSH_BARGE"

    def test_no_engines(self):
        v = parse_vessel(_make_vessel({"technics": {"engines": []}}))
        assert "engines" not in (v["raw_details"] or {})

    def test_no_slug_uses_id(self):
        vessel = _make_vessel({"slug": None})
        v = parse_vessel(vessel)
        assert v["source_id"] == "69844e25a49893e3ddaf2ae0"
        assert v["url"] is None

    def test_build_year_none(self):
        v = parse_vessel(_make_vessel({"general": {"yearOfBuild": None}}))
        assert v["build_year"] is None

    def test_price_dropped_in_raw_details(self):
        v = parse_vessel(_make_vessel({"general": {"priceDropped": True}}))
        assert v["raw_details"]["price_dropped"] is True

    def test_empty_name_skipped(self):
        v = parse_vessel(_make_vessel({"vesselName": ""}))
        assert v is None

    def test_none_name_skipped(self):
        v = parse_vessel(_make_vessel({"vesselName": None}))
        assert v is None

    def test_whitespace_name_skipped(self):
        v = parse_vessel(_make_vessel({"vesselName": "   "}))
        assert v is None


class TestResolveTitle:
    def test_nl_preferred(self):
        titles = [{"locale": "en", "value": "English"}, {"locale": "nl", "value": "Dutch"}]
        assert _resolve_title(titles) == "Dutch"

    def test_fallback_to_first_value(self):
        titles = [{"locale": "en", "value": "English"}, {"locale": "de", "value": "German"}]
        assert _resolve_title(titles) == "English"

    def test_none(self):
        assert _resolve_title(None) is None

    def test_empty_list(self):
        assert _resolve_title([]) is None

    def test_string_passthrough(self):
        assert _resolve_title("some text") == "some text"

    def test_empty_values_skipped(self):
        titles = [{"locale": "nl", "value": ""}, {"locale": "en", "value": "Fallback"}]
        assert _resolve_title(titles) == "Fallback"


class TestCleanDetail:
    def test_removes_none_values(self):
        assert _clean_detail({"a": 1, "b": None}) == {"a": 1}

    def test_removes_empty_dicts(self):
        assert _clean_detail({"a": 1, "b": {}}) == {"a": 1}

    def test_removes_empty_lists(self):
        assert _clean_detail({"a": 1, "b": []}) == {"a": 1}

    def test_nested_cleanup(self):
        result = _clean_detail({"a": {"b": None, "c": 1}})
        assert result == {"a": {"c": 1}}

    def test_fully_empty_returns_none(self):
        assert _clean_detail({"a": None, "b": {}}) is None


class TestParseDetail:
    def _make_detail(self):
        return {
            "description": [{"locale": "nl", "value": "Een mooi schip"}, {"locale": "en", "value": "A nice ship"}],
            "general": {
                "euroNumber": "02316754",
                "welded": True,
                "riveted": False,
                "shipyard": "Grave",
                "vesselDimensions": {"length": 92.12, "width": 11.49, "draft": 3.71, "depth": 4.5},
                "buildInformation": [{"locale": "nl", "value": "Gebouwd in 1992"}],
                "particularities": [{"locale": "nl", "value": "Dubbele bodem"}],
                "tonnage": {"maxTonnage": 2480, "at2m50": 2100, "at1m90": None, "at2m20": None, "at2m80": None, "at3m00": None},
                "certificates": [{"title": "ADN", "validUntil": "2027-06-01"}],
                "pushCertificate": True,
                "oneManCertified": False,
                "oneManRadarCertified": False,
                "numberOfHolds": 2,
                "cargoholdCapacity": 3100.0,
                "trimFill": False,
                "doubleHull": True,
                "semiDoubleHull": False,
                "cargoholdTopDim": "60.00 x 10.00",
                "cargoholdTopLength": 60.0,
                "cargoholdTopWidth": 10.0,
                "cargoholdBottomDim": None,
                "cargoholdBottomLength": None,
                "cargoholdBottomWidth": None,
                "innerBottomMaterial": "Staal",
                "innerBottomThickness": 8.0,
                "innerBottomYearOfBuild": None,
                "containers": "40x 20ft / 20x 40ft",
                "washBulkhead": True,
                "midDeckConnection": None,
                "heightCoaming": 0.6,
                "framesCovered": True,
                "cargoholdBeams": False,
                "cargoholdHatchesType": "Staal",
                "cargoholdHatchesMake": None,
                "cargoholdYearOfBuild": None,
                "hatchCraneType": None,
                "hatchCraneMake": None,
                "hatchCraneYearOfBuild": None,
                "airdraftWithBallast": 5.0,
                "airdraftWithoutBallast": 7.5,
                "airdraftWheelhouseLowered": 4.0,
            },
            "wheelhouse": {
                "wheelhouseMaterial": [{"locale": "nl", "value": "Staal"}],
                "wheelhouseModel": "Hydraulisch",
                "wheelhouseYearOfBuild": None,
                "wheelhouseElevating": True,
                "wheelhouseFoldable": False,
                "wheelhouseColumn": None,
                "wheelhouseScissors": None,
                "wheelhouseInnerPassage": True,
                "wheelhouseSightHeight": "8.50m",
                "tanksSternFuel": 12000,
                "tanksSternFreshWater": 5000,
                "tanksSternDirtyWater": None,
                "tanksSternDirtyOil": None,
                "tanksSternOther": None,
                "tanksForeshipFuel": None,
                "tanksForeshipFreshWater": None,
                "tanksForeshipDirtyWater": None,
                "tanksForeshipDirtyOil": None,
                "tanksForeshipOther": None,
                "ballastTanksCapacityBack": 100000,
                "ballastTanksCapacityMiddle": None,
                "ballastTanksCapacityFront": 50000,
                "ballastTanksCapacityDoubleHull": None,
            },
            "technics": {
                "engines": [
                    {"description": None, "make": "Cummins", "type": "KTA19", "power": 775, "powerType": "HP",
                     "tpm": 1800, "yearOfBuild": 2006, "revision": None, "runningHours": "15000",
                     "environmentalClassification": "CCR2", "remarks": None}
                ],
                "gearboxes": [
                    {"make": "Reintjes", "type": "WAF 560", "reduction": "4.5:1",
                     "yearOfBuild": 2006, "revision": None, "runningHours": None, "remarks": None}
                ],
                "generators": [
                    {"make": "Hatz", "type": "3L41", "power": 30, "kva": 25,
                     "yearOfBuild": 2010, "revision": None, "runningHours": "5000",
                     "remarks": [{"locale": "nl", "value": "Recent gereviseerd"}]}
                ],
                "bowthrusterMake": "Veth",
                "bowthrusterSystem": "Hydraulisch",
            },
            "steering": {
                "steeringGear": {
                    "make": None,
                    "type": "Dubbelwerkend",
                    "system": "Hydraulisch",
                    "rudders": "2",
                },
                "propellor": {
                    "make": "Promarin",
                    "type": "Vaste spoed",
                    "material": "RVS",
                    "sparePropellor": True,
                    "nozzle": "Ja",
                },
                "bowthruster": {
                    "make": "Veth",
                    "type": "Hydraulisch",
                    "yearOfBuild": 2010,
                },
            },
            "equipment": {
                "additionalEquipment": [{"locale": "nl", "value": "Ankerlier"}],
                "winchesForeShip": {"make": "Lagersmit", "type": "Hydraulisch", "wireDrum": True, "chainDisks": None},
                "winchesStern": None,
                "retractableMooringPole": {"make": "Inland", "type": "Hydraulisch", "length": "8m", "yearOfBuild": 2015},
                "carCrane": None,
                "mastForeShip": "Staal 6m",
                "mastStern": None,
                "pump": {"number": 1, "capacity": 200.0, "make": "Grundfos", "description": None},
                "ballastPump": {"number": 2, "capacity": 500.0, "make": None, "description": [{"locale": "nl", "value": "Ballastpomp"}]},
                "deckWashPump": None,
                "otherPumpEquipment": "Lenspomp",
                "nauticalEquipment": {
                    "radars": {"type": "River", "make": "JRC", "yearOfBuild": 2020},
                    "radios": {"type": "VHF", "make": "Sailor", "yearOfBuild": None},
                    "gps": "Garmin",
                    "ais": "Class A",
                    "camerasYearOfBuild": "2022",
                    "pilot": {"type": "Autopilot", "make": "Navitron", "yearOfBuild": None},
                    "echoSounder": {"type": "Digital", "make": "Hondex", "yearOfBuild": None},
                    "steeringIndicator": None,
                    "otherNauticalEquipment": None,
                },
                "electricalEquipment": {
                    "heating": "CV ketel",
                    "airconditioning": None,
                    "solarPanels": None,
                    "batteries": "4x 12V",
                    "shoreConnection": True,
                    "shaftGenerator": None,
                    "otherElectricalEquipment": None,
                },
            },
        }

    def test_description(self):
        result = parse_detail(self._make_detail())
        assert result["description"] == "Een mooi schip"

    def test_general_fields(self):
        result = parse_detail(self._make_detail())
        assert result["euro_number"] == "02316754"
        assert result["welded"] is True
        assert result["riveted"] is False
        assert result["shipyard"] == "Grave"
        assert result["depth"] == 4.5

    def test_build_info_and_particularities(self):
        result = parse_detail(self._make_detail())
        assert result["build_information"] == "Gebouwd in 1992"
        assert result["particularities"] == "Dubbele bodem"

    def test_tonnage_details(self):
        result = parse_detail(self._make_detail())
        assert result["tonnage_details"]["maxTonnage"] == 2480
        assert result["tonnage_details"]["at2m50"] == 2100
        # None values should be excluded
        assert "at1m90" not in result["tonnage_details"]

    def test_certificates(self):
        result = parse_detail(self._make_detail())
        assert len(result["certificates"]) == 1
        assert result["certificates"][0]["title"] == "ADN"

    def test_cargohold(self):
        result = parse_detail(self._make_detail())
        assert result["cargohold"]["numberOfHolds"] == 2
        assert result["cargohold"]["cargoholdCapacity"] == 3100.0
        assert result["cargohold"]["cargoholdTopLength"] == 60.0
        assert result["cargohold"]["innerBottomMaterial"] == "Staal"
        assert result["cargohold"]["framesCovered"] is True

    def test_airdraft(self):
        result = parse_detail(self._make_detail())
        assert result["airdraft"]["airdraftWithBallast"] == 5.0
        assert result["airdraft"]["airdraftWithoutBallast"] == 7.5
        assert result["airdraft"]["airdraftWheelhouseLowered"] == 4.0

    def test_containers(self):
        result = parse_detail(self._make_detail())
        assert result["containers"] == "40x 20ft / 20x 40ft"

    def test_wheelhouse(self):
        result = parse_detail(self._make_detail())
        wh = result["wheelhouse"]
        assert wh["material"] == "Staal"
        assert wh["model"] == "Hydraulisch"
        assert wh["elevating"] is True
        assert wh["tanks"]["tanksSternFuel"] == 12000
        assert wh["ballast"]["ballastTanksCapacityBack"] == 100000
        assert wh["ballast"]["ballastTanksCapacityFront"] == 50000

    def test_engines(self):
        result = parse_detail(self._make_detail())
        assert len(result["engines"]) == 1
        assert result["engines"][0]["make"] == "Cummins"
        assert result["engines"][0]["power"] == 775
        assert result["engines"][0]["runningHours"] == "15000"

    def test_gearboxes(self):
        result = parse_detail(self._make_detail())
        assert len(result["gearboxes"]) == 1
        assert result["gearboxes"][0]["make"] == "Reintjes"

    def test_generators(self):
        result = parse_detail(self._make_detail())
        assert len(result["generators"]) == 1
        assert result["generators"][0]["make"] == "Hatz"
        assert result["generators"][0]["remarks"] == "Recent gereviseerd"

    def test_bowthruster(self):
        result = parse_detail(self._make_detail())
        assert result["bowthruster_make"] == "Veth"
        assert result["bowthruster_system"] == "Hydraulisch"

    def test_steering(self):
        result = parse_detail(self._make_detail())
        assert result["steering"]["steeringGear"]["system"] == "Hydraulisch"
        assert result["steering"]["steeringGear"]["type"] == "Dubbelwerkend"
        assert result["steering"]["propellor"]["make"] == "Promarin"
        assert result["steering"]["propellor"]["sparePropellor"] is True
        assert result["steering"]["bowthruster"]["make"] == "Veth"

    def test_equipment_nautical(self):
        result = parse_detail(self._make_detail())
        naut = result["equipment"]["nauticalEquipment"]
        assert naut["radars"]["make"] == "JRC"
        assert naut["gps"] == "Garmin"
        assert naut["ais"] == "Class A"

    def test_equipment_electrical(self):
        result = parse_detail(self._make_detail())
        elec = result["equipment"]["electricalEquipment"]
        assert elec["heating"] == "CV ketel"
        assert elec["shoreConnection"] is True
        assert elec["batteries"] == "4x 12V"
        # None values excluded
        assert "airconditioning" not in elec

    def test_equipment_winches(self):
        result = parse_detail(self._make_detail())
        eq = result["equipment"]
        assert eq["winchesForeShip"]["make"] == "Lagersmit"
        # None winchesStern excluded
        assert "winchesStern" not in eq

    def test_equipment_pumps(self):
        result = parse_detail(self._make_detail())
        eq = result["equipment"]
        assert eq["pump"]["make"] == "Grundfos"
        assert eq["ballastPump"]["description"] == "Ballastpomp"
        assert eq["otherPumpEquipment"] == "Lenspomp"

    def test_equipment_additional(self):
        result = parse_detail(self._make_detail())
        assert result["equipment"]["additionalEquipment"] == "Ankerlier"

    def test_equipment_mooring_pole(self):
        result = parse_detail(self._make_detail())
        pole = result["equipment"]["retractableMooringPole"]
        assert pole["make"] == "Inland"
        assert pole["yearOfBuild"] == 2015

    def test_none_input(self):
        assert parse_detail(None) is None

    def test_empty_input(self):
        assert parse_detail({}) is None
