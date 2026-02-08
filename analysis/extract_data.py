#!/usr/bin/env python3
"""
Binnenvaart Intel - Data Extraction & Quality Analysis
Extracts rich fields from raw_details JSONB, flags outliers, produces CSVs.
"""

import json
import re
import sys
import os
from datetime import datetime, date

import pandas as pd
import numpy as np

# ---------------------------------------------------------------------------
# 1. Load raw data exported from Supabase (JSON file)
# ---------------------------------------------------------------------------

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(DATA_DIR, "vessels_raw.json")
OUTPUT_ALL = os.path.join(DATA_DIR, "extracted_data_all.csv")
OUTPUT_PRICED = os.path.join(DATA_DIR, "extracted_data_priced.csv")
ENGINE_FAILURES = os.path.join(DATA_DIR, "engine_hours_failures.txt")
RICH_FAILURES = os.path.join(DATA_DIR, "rich_field_failures.txt")
REPORT_FILE = os.path.join(DATA_DIR, "data_quality_report.md")

TODAY = date(2026, 2, 8)

# Failure logs
engine_failures = []
rich_failures = []


# ---------------------------------------------------------------------------
# 2. Parsing helpers
# ---------------------------------------------------------------------------

def safe_float(val):
    """Parse a numeric value from potentially messy string."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val) if val != 0 else None
    s = str(val).strip()
    if not s:
        return None
    # Remove common units and suffixes
    s = re.sub(r'\s*(pk|hp|kw|kva|ton|t|liter|l|m³|m3|m)\s*$', '', s, flags=re.IGNORECASE)
    # Handle Dutch decimal format: "1.500" = 1500, "1,5" = 1.5
    # If contains both . and , -> . is thousands sep, , is decimal
    if '.' in s and ',' in s:
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s and '.' not in s:
        # Single comma: could be decimal separator
        # If exactly 3 digits after comma, it's likely thousands (e.g., "1,500")
        match = re.match(r'^[\d]+,(\d{3})$', s.replace(' ', ''))
        if match:
            s = s.replace(',', '')
        else:
            s = s.replace(',', '.')
    else:
        # Only dots: remove as thousands separator if pattern matches
        # "1.500" -> 1500, "1.5" -> 1.5
        parts = s.split('.')
        if len(parts) == 2 and len(parts[1]) == 3 and parts[0].isdigit():
            s = s.replace('.', '')

    # Remove remaining non-numeric chars except . and -
    s = re.sub(r'[^\d.\-]', '', s)
    if not s or s == '.' or s == '-':
        return None
    try:
        v = float(s)
        return v if v != 0 else None
    except ValueError:
        return None


def parse_engine_hours(raw_value, vessel_name, source):
    """
    Parse engine hours from messy strings.
    Returns float or None. Logs failures.

    Examples:
      "42295" -> 42295
      "ca 20.000" -> 20000
      "70.000 per (9-2025)" -> 70000
      "69.500 (jan '26)" -> 69500
      "Na revisie 3.000" -> 3000
      "6.395 uur (juli' 22)" -> 6395
      "13685 01-2023" -> 13685
      "53000 (per 01-2024)" -> 53000
    """
    if raw_value is None:
        return None

    s = str(raw_value).strip()
    if not s:
        return None

    # Remove common prefixes
    s = re.sub(r'^(ca\.?\s*|circa\s*|na revisie\s*|per\s*|ongeveer\s*)', '', s, flags=re.IGNORECASE)

    # Remove date/time annotations in parentheses or after spaces
    # e.g., "(jan '26)", "(9-2025)", "(per 01-2024)", "uur (juli' 22)"
    s = re.sub(r'\s*\(.*?\)', '', s)
    s = re.sub(r'\s*per\s+\d{1,2}[-/]\d{2,4}', '', s, flags=re.IGNORECASE)
    s = re.sub(r'\s+\d{1,2}[-/]\d{2,4}\s*$', '', s)

    # Remove "uur" / "u" (Dutch for "hours") - but only standalone "u" not within words
    s = re.sub(r'\s*uur\s*', ' ', s, flags=re.IGNORECASE)
    s = re.sub(r'(\d)u\b', r'\1', s)  # "104000u" -> "104000"

    # Remove trailing text after comma that looks like dates: ", koprevisie 41000u / revisie 95450u"
    s = re.sub(r',\s*(koprevisie|revisie|rev).*$', '', s, flags=re.IGNORECASE)
    # Remove trailing text after "/" separator
    s = re.sub(r'\s*/\s*.*$', '', s)

    # Remove month names and date fragments
    s = re.sub(r'\s*(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\w*\s*\d*', '', s, flags=re.IGNORECASE)

    s = s.strip().rstrip(',').strip()

    # Extract just the leading numeric part (possibly with thousands separators)
    # Match patterns like "104000", "6.395", "70.000", "15.000 na revisie"
    match = re.match(r'^([\d]+(?:[.]\d{3})*(?:[,]\d+)?)', s)
    if match:
        num_part = match.group(1)
        result = safe_float(num_part)
        if result is not None and result > 0:
            return result

    # Try the whole string
    result = safe_float(s)
    if result is not None and result > 0:
        return result

    # Try to find any number in the remaining string
    numbers = re.findall(r'([\d]+(?:[.]\d{3})*)', s)
    if numbers:
        for num_str in numbers:
            result = safe_float(num_str)
            if result is not None and result > 0:
                return result

    engine_failures.append(f"{source} | {vessel_name} | raw: {raw_value}")
    return None


def parse_power_hp(raw_value, vessel_name, source):
    """Parse engine power, normalize to HP. 1 kW = 1.3596 HP."""
    if raw_value is None:
        return None

    if isinstance(raw_value, (int, float)):
        return float(raw_value) if raw_value > 0 else None

    s = str(raw_value).strip()
    if not s:
        return None

    # FIRST: Try extracting number followed by pk/hp/kw unit
    # This is the most reliable pattern for mixed strings like "Caterpillar 3508 DITA 811 pk, Bj. 1996"
    match = re.search(r'([\d][.\d]*)\s*(pk|hp)\b', s, re.IGNORECASE)
    if match:
        val = safe_float(match.group(1))
        if val and val > 0:
            return val

    match = re.search(r'([\d][.\d]*)\s*kw\b', s, re.IGNORECASE)
    if match:
        val = safe_float(match.group(1))
        if val and val > 0:
            return round(val * 1.3596, 1)

    # ONLY if no unit found: try parsing as plain number (for already-clean numeric values)
    # But only if the string looks purely numeric (no letters besides units)
    cleaned = re.sub(r'\s+', '', s)
    if re.match(r'^[\d.,]+$', cleaned):
        val = safe_float(s)
        if val is not None and val > 0:
            return val

    rich_failures.append(f"power | {source} | {vessel_name} | raw: {raw_value}")
    return None


def parse_kva(raw_value, vessel_name, source):
    """Parse generator kVA from string."""
    if raw_value is None:
        return None
    if isinstance(raw_value, (int, float)):
        return float(raw_value) if raw_value > 0 else None

    s = str(raw_value).strip()

    # Try to find all kVA numbers and take the largest
    matches = re.findall(r'(\d[\d.,]*)\s*kva', s, re.IGNORECASE)
    if matches:
        vals = [safe_float(m) for m in matches]
        vals = [v for v in vals if v and v > 0]
        if vals:
            return max(vals)

    # Also try kW for generators
    matches = re.findall(r'(\d[\d.,]*)\s*kw\b', s, re.IGNORECASE)
    if matches:
        vals = [safe_float(m) for m in matches]
        vals = [v for v in vals if v and v > 0]
        if vals:
            # Convert kW to kVA (approximate: kVA = kW / 0.8 power factor)
            return round(max(vals) / 0.8, 1)

    # Just try parsing the whole thing (for clean numeric values)
    cleaned = re.sub(r'\s+', '', s)
    if re.match(r'^[\d.,]+$', cleaned):
        val = safe_float(s)
        if val and val > 0:
            return val

    if s:
        rich_failures.append(f"generator_kva | {source} | {vessel_name} | raw: {raw_value}")
    return None


def parse_fuel_liters(raw_value, vessel_name, source):
    """Parse fuel tank capacity in liters."""
    if raw_value is None:
        return None

    s = str(raw_value).strip()
    if not s:
        return None

    # Handle m3 values (e.g., "61,00m3" or "28,00m3")
    match_m3 = re.search(r'([\d.,]+)\s*m[³3]?', s, re.IGNORECASE)
    if match_m3 and 'm3' in s.lower().replace(' ', ''):
        val = safe_float(match_m3.group(1))
        if val and val > 0:
            liters = val * 1000
            if liters > 200000:
                rich_failures.append(f"fuel_tank | {source} | {vessel_name} | raw: {raw_value} (parsed {liters}L from m3, likely data error)")
                return None
            return liters

    # Handle "L" values (e.g., "19.500 L", "68.000 L / 16.000 L")
    # Take the first/largest number
    matches = re.findall(r'([\d.]+)\s*(?:l|liter)', s, re.IGNORECASE)
    if matches:
        vals = [safe_float(m) for m in matches]
        vals = [v for v in vals if v and v > 0]
        if vals:
            return max(vals)

    # Handle "liter" at end
    match = re.search(r'([\d.,]+)\s*(?:l|liter)', s, re.IGNORECASE)
    if match:
        val = safe_float(match.group(1))
        if val and val > 0:
            return val

    val = safe_float(s)
    if val and val > 0:
        # Sanity check: inland vessels rarely exceed 100,000L (100 m3)
        if val > 200000:
            rich_failures.append(f"fuel_tank | {source} | {vessel_name} | raw: {raw_value} (parsed {val}L, capped as likely error)")
            return None
        return val

    if s:
        rich_failures.append(f"fuel_tank | {source} | {vessel_name} | raw: {raw_value}")
    return None


def parse_holds(raw_value, vessel_name, source):
    """Parse number of cargo holds."""
    if raw_value is None:
        return None
    if isinstance(raw_value, (int, float)):
        return int(raw_value) if raw_value > 0 else None
    s = str(raw_value).strip()
    match = re.search(r'(\d+)', s)
    if match:
        return int(match.group(1))
    return None


def parse_hull_type(raw_value):
    """Parse hull type: welded, riveted, or mixed."""
    if raw_value is None:
        return None
    if isinstance(raw_value, bool):
        return 'welded' if raw_value else None
    s = str(raw_value).strip().lower()
    if not s:
        return None
    if 'geklonken' in s and 'gelast' in s:
        return 'mixed'
    if 'geklonken' in s or 'riveted' in s:
        return 'riveted'
    if 'gelast' in s or 'welded' in s:
        return 'welded'
    return None


def parse_clearance_height(raw_value):
    """Parse clearance height in meters."""
    if raw_value is None:
        return None
    if isinstance(raw_value, (int, float)):
        return float(raw_value) if 0 < raw_value < 30 else None
    s = str(raw_value).strip()
    # Remove "m" suffix
    s = re.sub(r'\s*m\s*$', '', s, flags=re.IGNORECASE)
    val = safe_float(s)
    if val and 0 < val < 30:
        return val
    return None


def parse_cargo_capacity_m3(raw_value):
    """Parse cargo capacity in cubic meters."""
    if raw_value is None:
        return None
    if isinstance(raw_value, (int, float)):
        return float(raw_value) if raw_value > 0 else None
    s = str(raw_value).strip()
    # Try to find m³/m3 pattern first
    match = re.search(r'([\d.,]+)\s*m[³3]', s, re.IGNORECASE)
    if match:
        return safe_float(match.group(1))
    return safe_float(s)


def parse_double_hull(raw_value):
    """Parse whether vessel has double hull."""
    if raw_value is None:
        return None
    if isinstance(raw_value, bool):
        return raw_value
    s = str(raw_value).strip().lower()
    if 'dubbel' in s or 'double' in s:
        return True
    if 'enkel' in s or 'single' in s:
        return False
    return None


def parse_revision_year(raw_value):
    """Parse engine revision year."""
    if raw_value is None:
        return None
    if isinstance(raw_value, (int, float)):
        y = int(raw_value)
        return y if 1950 <= y <= 2026 else None
    s = str(raw_value).strip()
    # Look for 4-digit year
    match = re.search(r'(19\d{2}|20[0-2]\d)', s)
    if match:
        return int(match.group(1))
    return None


def parse_certificate_valid(raw_value):
    """Parse whether certificate of survey is valid."""
    if raw_value is None:
        return None
    if isinstance(raw_value, bool):
        return raw_value
    # Handle array of certificates (GSK format)
    if isinstance(raw_value, list):
        for cert in raw_value:
            if isinstance(cert, dict):
                title = (cert.get('title') or '').lower()
                if 'cvo' in title or 'certificaat' in title:
                    valid_until = cert.get('validUntil')
                    if valid_until:
                        try:
                            exp = datetime.fromisoformat(valid_until.replace('Z', '+00:00')).date()
                            return exp >= TODAY
                        except (ValueError, TypeError):
                            pass
                    return True  # Has certificate but no expiry
        return None
    s = str(raw_value).strip().lower()
    if not s or s == 'nee' or s == 'no':
        return False
    if s == 'ja' or s == 'yes':
        return True
    # Check for date in string (e.g., "Bureau Veritas, geldig t/m 24-11-2024")
    date_match = re.search(r'(\d{1,2}[-/]\d{1,2}[-/]\d{4})', s)
    if date_match:
        try:
            from datetime import datetime as dt_parser
            parts = re.split(r'[-/]', date_match.group(1))
            exp = date(int(parts[2]), int(parts[1]), int(parts[0]))
            return exp >= TODAY
        except (ValueError, IndexError):
            pass
    # If there's text, assume certificate exists
    if len(s) > 2:
        return True
    return None


def extract_engine_make_from_string(s):
    """Extract engine make/brand from a combined string like 'Caterpillar 3508 DITA-B'."""
    if not s:
        return None
    # Known engine brands
    brands = [
        'Caterpillar', 'CAT', 'Cummins', 'Volvo Penta', 'Volvo', 'Mitsubishi',
        'DAF', 'MAN', 'Deutz', 'Yanmar', 'Doosan', 'ABC', 'Detroit Diesel',
        'GM Detroit', 'GM', 'Scania', 'Perkins', 'John Deere', 'Iveco',
        'Mercedes', 'MTU', 'Wärtsilä', 'Wartsila', 'Hatz', 'Lister',
        'Baudouin', 'Nanni', 'Vetus', 'Steyr', 'Kubota'
    ]
    s_lower = s.lower()
    for brand in brands:
        if brand.lower() in s_lower:
            return brand
    # Return first word as fallback
    words = s.strip().split()
    if words:
        first = words[0].replace('Fabr.', '').strip()
        if first and len(first) > 1:
            return first
    return None


# ---------------------------------------------------------------------------
# 3. Source-specific extraction
# ---------------------------------------------------------------------------

def extract_rensendriessen(rd, name):
    """Extract rich fields from RensenDriessen raw_details."""
    if not rd:
        return {}

    engine_hours = parse_engine_hours(rd.get('main_engine_1_hours'), name, 'rensendriessen')
    engine_make = extract_engine_make_from_string(rd.get('main_engine_1', ''))
    engine_hp = parse_power_hp(rd.get('main_engine_1_hp'), name, 'rensendriessen')

    # If main engine has kW power type, it's stored in engines array
    # main_engine_1_hp is usually in HP already for R&D

    gen_kva = parse_kva(rd.get('generator_1_kva'), name, 'rensendriessen')

    # Bow thruster
    thruster_hp = parse_power_hp(rd.get('thruster_1_hp'), name, 'rensendriessen')

    # Fuel tank
    fuel = parse_fuel_liters(rd.get('fuel'), name, 'rensendriessen')

    # Number of cargo tanks (for tankers) or holds
    holds = parse_holds(rd.get('number_cargo_tanks'), name, 'rensendriessen')

    # Tonnage from raw if missing
    tonnage_raw = safe_float(rd.get('tonnage_max'))

    # New fields
    has_bow_thruster = thruster_hp is not None and thruster_hp > 0
    engine_revision_year = parse_revision_year(rd.get('main_engine_1_revision'))

    # Certificate: check multiple certificate fields
    cert_valid = None
    for cert_key in ['certificate_inquiry', 'certificate_shipsattest', 'certificate_adn']:
        val = rd.get(cert_key)
        if val:
            cert_valid = True
            break

    return {
        'engine_hours': engine_hours,
        'engine_make': engine_make,
        'engine_power_hp': engine_hp,
        'generator_kva': gen_kva,
        'bow_thruster_hp': thruster_hp,
        'fuel_tank_liters': fuel,
        'num_holds': holds,
        'tonnage_raw': tonnage_raw,
        'hull_type': None,
        'clearance_height_m': None,
        'cargo_capacity_m3': None,
        'double_hull': None,
        'has_bow_thruster': has_bow_thruster if thruster_hp else None,
        'engine_revision_year': engine_revision_year,
        'certificate_valid': cert_valid,
    }


def extract_gtsschepen(rd, name):
    """Extract rich fields from GTS Schepen raw_details."""
    if not rd:
        return {}

    engine_hours = parse_engine_hours(
        rd.get('machinekamer - draaiuren totaal'), name, 'gtsschepen')
    engine_make = extract_engine_make_from_string(
        rd.get('machinekamer - merk en type', ''))
    engine_hp = parse_power_hp(
        rd.get('machinekamer - vermogen'), name, 'gtsschepen')

    gen_kva = parse_kva(
        rd.get('generatoren - vermogen'), name, 'gtsschepen')

    # Bow thruster = voormachinekamer
    bow_hp = parse_power_hp(
        rd.get('voormachinekamer - vermogen'), name, 'gtsschepen')

    # Fuel tank
    fuel = parse_fuel_liters(
        rd.get('machinekamer - gasolietank achter'), name, 'gtsschepen')

    # Number of holds
    holds = parse_holds(
        rd.get('middenschip - aantal ruimen'), name, 'gtsschepen')

    # Tonnage
    tonnage_raw = safe_float(rd.get('algemene gegevens - tonnenmaat'))

    # New fields
    hull_type = parse_hull_type(rd.get('algemene gegevens - gelast / geklonken'))
    clearance_height = parse_clearance_height(rd.get('algemene gegevens - kruiplijnhoogte zonder ballast'))
    cargo_m3 = parse_cargo_capacity_m3(rd.get('middenschip - totale ruiminhoud'))
    double_hull = parse_double_hull(rd.get('middenschip - wanden'))
    has_bow_thruster = bow_hp is not None and bow_hp > 0
    engine_revision_year = parse_revision_year(rd.get('machinekamer - jaar revisie'))
    cert_valid = parse_certificate_valid(rd.get('algemene gegevens - certificaat van onderzoek'))

    return {
        'engine_hours': engine_hours,
        'engine_make': engine_make,
        'engine_power_hp': engine_hp,
        'generator_kva': gen_kva,
        'bow_thruster_hp': bow_hp,
        'fuel_tank_liters': fuel,
        'num_holds': holds,
        'tonnage_raw': tonnage_raw,
        'hull_type': hull_type,
        'clearance_height_m': clearance_height,
        'cargo_capacity_m3': cargo_m3,
        'double_hull': double_hull,
        'has_bow_thruster': has_bow_thruster if bow_hp else None,
        'engine_revision_year': engine_revision_year,
        'certificate_valid': cert_valid,
    }


def extract_pcshipbrokers(rd, name):
    """Extract rich fields from PC Shipbrokers raw_details."""
    if not rd:
        return {}

    engine_hours = parse_engine_hours(
        rd.get('hoofdmotor uren'), name, 'pcshipbrokers')

    # Engine make/power from "hoofdmotor (bj, type)" e.g. "Caterpillar 32, 860 pk, Bj. 2022"
    engine_str = rd.get('hoofdmotor (bj, type)', '') or ''
    engine_make = extract_engine_make_from_string(engine_str)
    engine_hp = parse_power_hp(engine_str, name, 'pcshipbrokers') if engine_str else None

    # Generator: "generatoren" e.g. "Stamford 650 kVA / Stamford 64 kVA, ..."
    gen_kva = parse_kva(rd.get('generatoren'), name, 'pcshipbrokers')

    # Bow thruster: "boegschroef (systeem,pk,revisie)" e.g. "Elektrisch 38 pk, Bj. 2024"
    bow_str = rd.get('boegschroef (systeem,pk,revisie)', '') or ''
    bow_hp = parse_power_hp(bow_str, name, 'pcshipbrokers') if bow_str else None
    # Also check boegschroefmotor
    if bow_hp is None:
        bow_motor = rd.get('boegschroefmotor (merk,bj,revisie)', '') or ''
        bow_hp = parse_power_hp(bow_motor, name, 'pcshipbrokers') if bow_motor else None

    # Fuel tank
    fuel = parse_fuel_liters(rd.get('brandstof'), name, 'pcshipbrokers')

    # Tonnage
    tonnage_raw = safe_float(rd.get('max tonnage'))

    # No structured holds field for pcshipbrokers
    holds = None

    # New fields
    hull_type = parse_hull_type(rd.get('bouw huid schip'))
    clearance_height = parse_clearance_height(rd.get('kruiphoogte zonder ballast'))
    cargo_m3 = parse_cargo_capacity_m3(rd.get('ruiminhoud'))
    double_hull = parse_double_hull(rd.get('trimvulling'))
    has_bow_thruster = bow_hp is not None and bow_hp > 0
    # Parse revision year from engine string
    engine_revision_year = None
    if engine_str:
        rev_match = re.search(r'(?:revis\w+|revisie|rev\.?)\s*(?:in\s+)?(19\d{2}|20[0-2]\d)', engine_str, re.IGNORECASE)
        if rev_match:
            engine_revision_year = int(rev_match.group(1))
    cert_valid = parse_certificate_valid(rd.get('certificaat van onderzoek'))

    return {
        'engine_hours': engine_hours,
        'engine_make': engine_make,
        'engine_power_hp': engine_hp,
        'generator_kva': gen_kva,
        'bow_thruster_hp': bow_hp,
        'fuel_tank_liters': fuel,
        'num_holds': holds,
        'tonnage_raw': tonnage_raw,
        'hull_type': hull_type,
        'clearance_height_m': clearance_height,
        'cargo_capacity_m3': cargo_m3,
        'double_hull': double_hull,
        'has_bow_thruster': has_bow_thruster if bow_hp else None,
        'engine_revision_year': engine_revision_year,
        'certificate_valid': cert_valid,
    }


def extract_galle(rd, name):
    """Extract rich fields from Galle raw_details."""
    if not rd:
        return {}

    # Galle stores generator info as freeform key names like:
    # "generatorset1x yanmar 45kva": "value..."
    # No structured engine hours field

    engine_hours = None  # Galle doesn't have engine hours
    engine_make = None
    engine_hp = None
    gen_kva = None
    bow_hp = None
    fuel = None

    # Try to find generator info from keys starting with "generatorset"
    for key, val in rd.items():
        key_lower = key.lower()
        combined = f"{key} {val}" if val else key

        if key_lower.startswith('generatorset'):
            if gen_kva is None:
                kva_match = re.search(r'(\d+(?:[.,]\d+)?)\s*kva', combined, re.IGNORECASE)
                if kva_match:
                    gen_kva = safe_float(kva_match.group(1))

    # Holds
    holds = parse_holds(rd.get('ruimen > aantal'), name, 'galle')

    # Tonnage
    tonnage_raw = safe_float(rd.get('tonnenmaat > maximum diepgang (t)'))

    # New fields - Galle has limited data
    clearance_height = parse_clearance_height(rd.get('afmetingen > holte (m)'))
    cargo_m3 = parse_cargo_capacity_m3(rd.get('tanks > inhoud tanks'))

    return {
        'engine_hours': engine_hours,
        'engine_make': engine_make,
        'engine_power_hp': engine_hp,
        'generator_kva': gen_kva,
        'bow_thruster_hp': bow_hp,
        'fuel_tank_liters': fuel,
        'num_holds': holds,
        'tonnage_raw': tonnage_raw,
        'hull_type': None,
        'clearance_height_m': clearance_height,
        'cargo_capacity_m3': cargo_m3,
        'double_hull': None,
        'has_bow_thruster': None,
        'engine_revision_year': None,
        'certificate_valid': None,
    }


def extract_gsk(rd, name):
    """Extract rich fields from GSK raw_details (structured JSON)."""
    if not rd:
        return {}

    engine_hours = None
    engine_make = None
    engine_hp = None
    gen_kva = None
    bow_hp = None
    fuel = None
    holds = None
    tonnage_raw = None

    # Technics -> engines
    technics = rd.get('technics', {}) or {}
    engines = technics.get('engines', []) or []
    if engines and len(engines) > 0:
        eng = engines[0]
        hours_raw = eng.get('runningHours')
        engine_hours = parse_engine_hours(hours_raw, name, 'gsk')
        engine_make = eng.get('make')
        power = eng.get('power')
        power_type = eng.get('powerType', 'HP')
        if power and power > 0:
            if power_type == 'KW':
                engine_hp = round(power * 1.3596, 1)
            else:
                engine_hp = float(power)

    # Technics -> generators (sum or max kVA)
    generators = technics.get('generators', []) or []
    if generators:
        kvas = [g.get('kva') for g in generators if g.get('kva') and g.get('kva') > 0]
        if kvas:
            gen_kva = max(kvas)  # Take largest generator

    # Steering -> bowthrusters
    steering = rd.get('steering', {}) or {}
    bowthrusters = steering.get('bowthrusters', []) or []
    if bowthrusters and len(bowthrusters) > 0:
        bt = bowthrusters[0]
        bt_engines = bt.get('engines', []) or []
        if bt_engines and len(bt_engines) > 0:
            bt_power = bt_engines[0].get('power')
            if bt_power and bt_power > 0:
                bow_hp = float(bt_power)

    # General -> numberOfHolds, tonnage, fuel
    general = rd.get('general', {}) or {}
    holds = general.get('numberOfHolds')

    tonnage_info = general.get('tonnage', {}) or {}
    if isinstance(tonnage_info, dict):
        tonnage_raw = safe_float(tonnage_info.get('maxTonnage'))

    cargo_cap = general.get('cargoholdCapacity')
    if cargo_cap and not tonnage_raw:
        tonnage_raw = safe_float(cargo_cap)

    # New fields
    hull_type = None
    welded = general.get('welded')
    if welded is True:
        hull_type = 'welded'
    elif welded is False:
        hull_type = 'riveted'

    clearance_height = parse_clearance_height(general.get('airdraftWithoutBallast'))
    cargo_m3 = parse_cargo_capacity_m3(general.get('cargoholdCapacity'))
    double_hull_val = general.get('doubleHull')
    double_hull = bool(double_hull_val) if double_hull_val is not None else None

    has_bow_thruster = len(bowthrusters) > 0 if bowthrusters else None

    engine_revision_year = None
    if engines and len(engines) > 0:
        rev = engines[0].get('revision')
        engine_revision_year = parse_revision_year(rev)

    certificates = general.get('certificates', []) or []
    cert_valid = parse_certificate_valid(certificates) if certificates else None

    return {
        'engine_hours': engine_hours,
        'engine_make': engine_make,
        'engine_power_hp': engine_hp,
        'generator_kva': gen_kva,
        'bow_thruster_hp': bow_hp,
        'fuel_tank_liters': fuel,
        'num_holds': holds,
        'tonnage_raw': tonnage_raw,
        'hull_type': hull_type,
        'clearance_height_m': clearance_height,
        'cargo_capacity_m3': cargo_m3,
        'double_hull': double_hull,
        'has_bow_thruster': has_bow_thruster,
        'engine_revision_year': engine_revision_year,
        'certificate_valid': cert_valid,
    }


# ---------------------------------------------------------------------------
# 4. Main processing
# ---------------------------------------------------------------------------

def process_vessels(vessels_data):
    """Process all vessels and return DataFrame."""

    extractors = {
        'rensendriessen': extract_rensendriessen,
        'gtsschepen': extract_gtsschepen,
        'pcshipbrokers': extract_pcshipbrokers,
        'galle': extract_galle,
        'gsk': extract_gsk,
    }

    rows = []
    for v in vessels_data:
        source = v.get('source', '')
        name = v.get('name', 'Unknown')
        rd = v.get('raw_details')
        if isinstance(rd, str):
            try:
                rd = json.loads(rd)
            except (json.JSONDecodeError, TypeError):
                rd = None

        extractor = extractors.get(source)
        if extractor and rd:
            rich = extractor(rd, name)
        else:
            rich = {}

        # Use tonnage from raw_details if main column is missing
        tonnage = v.get('tonnage') or 0
        if (not tonnage or tonnage == 0) and rich.get('tonnage_raw'):
            tonnage = rich['tonnage_raw']

        price = v.get('price') or 0
        length_m = v.get('length_m') or 0
        width_m = v.get('width_m') or 0
        build_year = v.get('build_year') or 0

        # Derived metrics
        price_per_meter = round(price / length_m, 2) if price > 0 and length_m > 0 else None
        price_per_ton = round(price / tonnage, 2) if price > 0 and tonnage > 0 else None
        vessel_age = (2026 - build_year) if build_year > 0 else None

        # Days on market
        first_seen = v.get('first_seen_at')
        if first_seen:
            try:
                fs_date = datetime.fromisoformat(first_seen.replace('Z', '+00:00')).date()
                days_on_market = (TODAY - fs_date).days
            except (ValueError, TypeError):
                days_on_market = None
        else:
            days_on_market = None

        rows.append({
            'id': v.get('id'),
            'name': name,
            'type': v.get('type'),
            'source': source,
            'price': price if price > 0 else None,
            'length_m': length_m if length_m > 0 else None,
            'width_m': width_m if width_m > 0 else None,
            'tonnage': tonnage if tonnage and tonnage > 0 else None,
            'build_year': build_year if build_year > 0 else None,
            'engine_hours': rich.get('engine_hours'),
            'engine_power_hp': rich.get('engine_power_hp'),
            'engine_make': rich.get('engine_make'),
            'generator_kva': rich.get('generator_kva'),
            'bow_thruster_hp': rich.get('bow_thruster_hp'),
            'fuel_tank_liters': rich.get('fuel_tank_liters'),
            'num_holds': rich.get('num_holds'),
            'hull_type': rich.get('hull_type'),
            'clearance_height_m': rich.get('clearance_height_m'),
            'cargo_capacity_m3': rich.get('cargo_capacity_m3'),
            'double_hull': rich.get('double_hull'),
            'has_bow_thruster': rich.get('has_bow_thruster'),
            'engine_revision_year': rich.get('engine_revision_year'),
            'certificate_valid': rich.get('certificate_valid'),
            'price_per_meter': price_per_meter,
            'price_per_ton': price_per_ton,
            'vessel_age': vessel_age,
            'days_on_market': days_on_market,
            'is_outlier': False,
            'canonical_vessel_id': v.get('canonical_vessel_id'),
        })

    return pd.DataFrame(rows)


def flag_outliers(df):
    """Flag price outliers using z-score > 3 on price_per_ton by type."""
    df['is_outlier'] = False

    for vessel_type, group in df[df['price_per_ton'].notna()].groupby('type'):
        if len(group) < 5:
            continue
        mean_ppt = group['price_per_ton'].mean()
        std_ppt = group['price_per_ton'].std()
        if std_ppt == 0:
            continue
        z_scores = (group['price_per_ton'] - mean_ppt) / std_ppt
        outlier_ids = group[z_scores.abs() > 3].index
        df.loc[outlier_ids, 'is_outlier'] = True

    return df


def generate_report(df_all, df_priced):
    """Generate data quality report markdown."""
    lines = []
    lines.append("# Data Quality Report")
    lines.append(f"\nGenerated: {TODAY}")
    lines.append(f"\n## Summary")
    lines.append(f"\n- **Total vessels**: {len(df_all)}")
    lines.append(f"- **With price**: {df_all['price'].notna().sum()}")
    lines.append(f"- **Unique (non-duplicate)**: {df_all['canonical_vessel_id'].isna().sum()}")
    lines.append(f"- **Priced & deduplicated**: {len(df_priced)}")
    lines.append(f"- **Outliers flagged**: {df_priced['is_outlier'].sum()}")

    # Coverage per source
    lines.append(f"\n## Field Coverage by Source")
    lines.append("")

    coverage_fields = ['price', 'length_m', 'width_m', 'tonnage', 'build_year',
                       'engine_hours', 'engine_power_hp', 'engine_make',
                       'generator_kva', 'bow_thruster_hp', 'fuel_tank_liters', 'num_holds',
                       'hull_type', 'clearance_height_m', 'cargo_capacity_m3',
                       'double_hull', 'has_bow_thruster', 'engine_revision_year',
                       'certificate_valid']

    sources = sorted(df_all['source'].unique())

    # Header
    header = "| Field | " + " | ".join(sources) + " | Total |"
    sep = "|" + "---|" * (len(sources) + 2)
    lines.append(header)
    lines.append(sep)

    for field in coverage_fields:
        row_parts = [f"| {field} "]
        for src in sources:
            subset = df_all[df_all['source'] == src]
            cnt = subset[field].notna().sum()
            pct = round(100 * cnt / len(subset), 1) if len(subset) > 0 else 0
            row_parts.append(f"| {cnt}/{len(subset)} ({pct}%) ")
        total_cnt = df_all[field].notna().sum()
        total_pct = round(100 * total_cnt / len(df_all), 1)
        row_parts.append(f"| {total_cnt}/{len(df_all)} ({total_pct}%) |")
        lines.append("".join(row_parts))

    # Anomalies
    lines.append(f"\n## Data Anomalies")

    # Build year missing
    missing_by = df_all[df_all['build_year'].isna()]
    lines.append(f"\n### Missing Build Year ({len(missing_by)} vessels)")
    if len(missing_by) > 0:
        for _, r in missing_by.head(20).iterrows():
            lines.append(f"- {r['name']} ({r['source']})")
        if len(missing_by) > 20:
            lines.append(f"- ... and {len(missing_by) - 20} more")

    # Impossible dimensions
    bad_dims = df_all[(df_all['length_m'].notna()) & (df_all['length_m'] < 10)]
    lines.append(f"\n### Short Vessels (length < 10m): {len(bad_dims)}")
    for _, r in bad_dims.iterrows():
        lines.append(f"- {r['name']} ({r['source']}): {r['length_m']}m")

    wide = df_all[(df_all['width_m'].notna()) & (df_all['width_m'] > 25)]
    lines.append(f"\n### Wide Vessels (width > 25m): {len(wide)}")
    for _, r in wide.iterrows():
        lines.append(f"- {r['name']} ({r['source']}): {r['width_m']}m")

    # Engine hours parsing stats
    lines.append(f"\n## Engine Hours Extraction")
    has_hours = df_all['engine_hours'].notna().sum()
    lines.append(f"\n- **Successfully parsed**: {has_hours}")
    lines.append(f"- **Parse failures**: {len(engine_failures)}")

    by_source = df_all.groupby('source')['engine_hours'].apply(lambda x: x.notna().sum())
    lines.append("\n| Source | Parsed | Total | Rate |")
    lines.append("|---|---|---|---|")
    for src in sources:
        total_src = len(df_all[df_all['source'] == src])
        parsed = by_source.get(src, 0)
        rate = round(100 * parsed / total_src, 1) if total_src > 0 else 0
        lines.append(f"| {src} | {parsed} | {total_src} | {rate}% |")

    if engine_failures:
        lines.append(f"\n### Parse Failures (first 20)")
        for f in engine_failures[:20]:
            lines.append(f"- {f}")
        if len(engine_failures) > 20:
            lines.append(f"- ... and {len(engine_failures) - 20} more")

    # Outliers
    outliers = df_priced[df_priced['is_outlier']]
    lines.append(f"\n## Price Outliers (z-score > 3 on price/ton by type)")
    lines.append(f"\n**{len(outliers)} outliers detected**")
    if len(outliers) > 0:
        lines.append("\n| Name | Source | Type | Price | Tonnage | Price/Ton |")
        lines.append("|---|---|---|---|---|---|")
        for _, r in outliers.iterrows():
            lines.append(f"| {r['name']} | {r['source']} | {r['type']} | {r['price']:,.0f} | {r['tonnage'] if pd.notna(r['tonnage']) else 'N/A'} | {r['price_per_ton']:,.0f} |")

    # Cross-source price conflicts
    lines.append(f"\n## Cross-Source Price Comparison")
    lines.append("\nVessels listed by multiple brokers (via canonical_vessel_id) with >20% price difference:")

    dupes = df_all[df_all['canonical_vessel_id'].notna() & df_all['price'].notna()]
    canonicals = df_all[df_all['id'].isin(dupes['canonical_vessel_id'].unique()) & df_all['price'].notna()]

    conflicts = []
    for _, dup in dupes.iterrows():
        canon = canonicals[canonicals['id'] == dup['canonical_vessel_id']]
        if len(canon) > 0:
            canon_row = canon.iloc[0]
            if canon_row['price'] > 0 and dup['price'] > 0:
                ratio = max(canon_row['price'], dup['price']) / min(canon_row['price'], dup['price'])
                if ratio > 1.2:
                    conflicts.append({
                        'name': canon_row['name'],
                        'source1': canon_row['source'],
                        'price1': canon_row['price'],
                        'source2': dup['source'],
                        'price2': dup['price'],
                        'ratio': ratio,
                    })

    if conflicts:
        lines.append("\n| Vessel | Source 1 | Price 1 | Source 2 | Price 2 | Ratio |")
        lines.append("|---|---|---|---|---|---|")
        for c in sorted(conflicts, key=lambda x: -x['ratio']):
            lines.append(f"| {c['name']} | {c['source1']} | {c['price1']:,.0f} | {c['source2']} | {c['price2']:,.0f} | {c['ratio']:.2f}x |")
    else:
        lines.append("\nNo conflicts > 1.2x found.")

    # Summary statistics
    lines.append(f"\n## Summary Statistics (Priced & Deduplicated)")

    stats_fields = ['price', 'length_m', 'width_m', 'tonnage', 'build_year',
                    'engine_hours', 'engine_power_hp', 'vessel_age', 'days_on_market',
                    'price_per_meter', 'price_per_ton']

    lines.append("\n| Metric | Count | Mean | Median | Min | Max | Std |")
    lines.append("|---|---|---|---|---|---|---|")

    for field in stats_fields:
        col = df_priced[field].dropna()
        if len(col) > 0:
            lines.append(
                f"| {field} | {len(col)} | {col.mean():,.1f} | {col.median():,.1f} | "
                f"{col.min():,.1f} | {col.max():,.1f} | {col.std():,.1f} |"
            )

    return "\n".join(lines)


def main():
    print("Loading vessel data...")
    with open(INPUT_FILE, 'r') as f:
        vessels_data = json.load(f)

    print(f"Loaded {len(vessels_data)} vessels")

    print("Processing vessels...")
    df_all = process_vessels(vessels_data)

    print("Flagging outliers...")
    df_all = flag_outliers(df_all)

    # Output 1: All vessels (for coverage analysis)
    df_all.to_csv(OUTPUT_ALL, index=False)
    print(f"Wrote {len(df_all)} rows to {OUTPUT_ALL}")

    # Output 2: Priced, deduplicated, outliers flagged
    df_priced = df_all[
        (df_all['price'].notna()) &
        (df_all['price'] > 0) &
        (df_all['canonical_vessel_id'].isna())  # Keep only canonical/unique vessels
    ].copy()
    df_priced.to_csv(OUTPUT_PRICED, index=False)
    print(f"Wrote {len(df_priced)} rows to {OUTPUT_PRICED}")

    # Write failure logs
    with open(ENGINE_FAILURES, 'w') as f:
        f.write(f"Engine Hours Parse Failures ({len(engine_failures)} total)\n")
        f.write("=" * 60 + "\n")
        for line in engine_failures:
            f.write(line + "\n")
    print(f"Wrote {len(engine_failures)} engine hour failures to {ENGINE_FAILURES}")

    with open(RICH_FAILURES, 'w') as f:
        f.write(f"Rich Field Parse Failures ({len(rich_failures)} total)\n")
        f.write("=" * 60 + "\n")
        for line in rich_failures:
            f.write(line + "\n")
    print(f"Wrote {len(rich_failures)} rich field failures to {RICH_FAILURES}")

    # Generate report
    print("Generating data quality report...")
    report = generate_report(df_all, df_priced)
    with open(REPORT_FILE, 'w') as f:
        f.write(report)
    print(f"Wrote report to {REPORT_FILE}")

    # Print summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total vessels:          {len(df_all)}")
    print(f"With price:             {df_all['price'].notna().sum()}")
    print(f"Priced & deduplicated:  {len(df_priced)}")
    print(f"Engine hours parsed:    {df_all['engine_hours'].notna().sum()}")
    print(f"Engine make extracted:  {df_all['engine_make'].notna().sum()}")
    print(f"Engine power parsed:    {df_all['engine_power_hp'].notna().sum()}")
    print(f"Generator kVA parsed:   {df_all['generator_kva'].notna().sum()}")
    print(f"Bow thruster HP:        {df_all['bow_thruster_hp'].notna().sum()}")
    print(f"Fuel tank liters:       {df_all['fuel_tank_liters'].notna().sum()}")
    print(f"Outliers flagged:       {df_priced['is_outlier'].sum()}")
    print(f"Parse failures (hours): {len(engine_failures)}")
    print(f"Parse failures (other): {len(rich_failures)}")


if __name__ == '__main__':
    main()
