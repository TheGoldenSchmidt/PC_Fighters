#!/usr/bin/env python3
"""Importiert die Kartenreferenz aus einer DOCX-Datei in PC-Fighters-JSON.

Das Skript verwendet absichtlich nur die Python-Standardbibliothek. Die DOCX
wird als ZIP/OOXML gelesen; zur Laufzeit des Spiels besteht keine Abhängigkeit
von Word oder python-docx. Bestehende Karten werden anhand der im Projekt
festgelegten Klassenverteilung deterministisch auf Referenz-Slots gelegt.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

CLASS_TABLES = [
    ("guardian", "Guardian", "animals", 3),
    ("kabloom", "Kabloom", "animals", 4),
    ("mega_grow", "Mega-Grow", "animals", 5),
    ("solar", "Solar", "animals", 6),
    ("beastly", "Beastly", "humans", 7),
    ("brainy", "Brainy", "humans", 8),
    ("hearty", "Hearty", "humans", 9),
    ("sneaky", "Sneaky", "humans", 10),
]

CHAMPIONS = [
    ("sonnenfackel", "Sonnenfackel", "animals", ["kabloom", "solar"]),
    ("kaeptn_kompostible", "Käpt'n Kompostible", "animals", ["kabloom", "mega_grow"]),
    ("wall_halla", "Wall-Halla", "animals", ["guardian", "solar"]),
    ("super_brainz", "Super Brainz", "humans", ["brainy", "sneaky"]),
    ("rostbolzen", "Rostbolzen", "humans", ["brainy", "hearty"]),
    ("der_zerschmetterer", "Der Zerschmetterer", "humans", ["hearty", "beastly"]),
]

LEGACY_BY_CLASS = {
    "guardian": ["baer", "eisbaer", "stegosaurus", "triceratops", "brachiosaurus", "schildkroete", "krokodil", "gecko", "eidechse", "waran", "compsognathus"],
    "kabloom": ["ratte", "streunerkatze", "getigerter", "katzenmutter", "schwarze_katze", "velociraptor", "adler_voegel", "wilder_instinkt", "klapperschlange", "taubenschwarm", "falke"],
    "mega_grow": ["wolf", "pferd", "alphawolf", "hauskater", "luchs", "spinosaurus", "tyrannosaurus_rex", "wildkatze", "der_puma", "kraehe", "der_schwarm"],
    "solar": ["schlange", "adler", "pteranodon", "uralte_schlange", "eule", "vogelmensch", "hetzjagd", "spatz", "moewe", "koenig_der_kobras"],
    "beastly": ["randy_marsh", "stahlgiesser", "der_alte_hund", "schrottsammlerin", "lehrling", "fliessbandarbeiter", "schichtwechsel", "betriebsrat", "streuner", "suppenkueche", "meute_der_vergessenen"],
    "brainy": ["erstsemester", "experimentelle_formel", "koffein_junkie", "nachhilfe", "gruppenarbeit", "bibliothekar", "alter_wissenschaftler", "die_fakultaet", "doktorandin", "pc_babies", "flugblatt_verteiler"],
    "hearty": ["rekrut", "schildwall", "feldscherin", "schildwache", "bannertraeger", "mobilmachung", "ritter", "kommandantin", "basisdemokratie", "solidaritaetskasse", "generalstreik"],
    "sneaky": ["junger_neffe", "streikposten", "kranfuehrer", "pfandsammler", "gewerkschaftssekretaerin", "die_massen", "werkzeugkiste", "vorarbeiter", "improvisiertes_lager", "ueberlebenskuenstler"],
}

TRAITS = {
    "Amphibious": "amphibious",
    "Bullseye": "bullseye",
    "Team-Up": "team_up",
    "Armored": "armored",
    "Anti-Hero": "anti_hero",
    "Deadly": "deadly",
    "Double Strike": "double_strike",
    "Frenzy": "frenzy",
    "Hunt": "hunt",
    "Strikethrough": "strikethrough",
    "Untrickable": "untrickable",
    "Gravestone": "gravestone",
    "Overshoot": "overshoot",
}

ROLE_WORDS = {
    "damage": ("schaden", "sturzflug", "gift", "dornen", "todesfluch", "hinrichten"),
    "buff": ("+1", "+2", "+3", "+4", "+5", "buff", "aura", "banner", "wachstum", "skalierung", "bedingt"),
    "protect": ("leben", "schild", "armored", "unverwundbar", "rettung", "zäh", "heil", "überlebt"),
    "draw": ("karte ziehen", "karten ziehen", "conjure", "conjuren", "lernen", "wissen"),
    "summon": ("erzeug", "beschwör", "summon", "token"),
    "move": ("beweg", "lane", "zurück auf hand", "bounce", "umgruppieren"),
    "destroy": ("zerstör", "peinig", "entwaff", "debuff", "verliert"),
    "death": ("beim tod", "beim zerstören", "stirbt"),
    "resource": ("sun", "brain", "energie", "kosten"),
}


def text_of(element: ET.Element) -> str:
    return "".join(node.text or "" for node in element.iter(W + "t")).strip()


def tables_from_docx(path: Path) -> list[list[list[str]]]:
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    tables: list[list[list[str]]] = []
    for table in root.iter(W + "tbl"):
        rows: list[list[str]] = []
        for row in table.findall(W + "tr"):
            rows.append([text_of(cell) for cell in row.findall(W + "tc")])
        tables.append(rows)
    return tables


def slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower().replace("&", " und ")
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")
    return normalized or "karte"


def roles(text: str) -> set[str]:
    lower = text.lower()
    return {role for role, needles in ROLE_WORDS.items() if any(needle in lower for needle in needles)}


def parse_reference_card(row: list[str], class_id: str, used_ids: set[str]) -> dict:
    name, cost_raw, stat_raw, rule_text = (row + ["", "", "", ""])[:4]
    card_id = slug(name)
    if card_id in used_ids:
        card_id = f"{class_id}_{card_id}"
    used_ids.add(card_id)
    base = {
        "id": card_id,
        "name": name,
        "faction": class_id,
        "cost": int(cost_raw),
        "deckable": True,
        "tribes": [],
        "referenceName": name,
        "text": rule_text if rule_text not in ("", "–", "-") else "Keine zusätzliche Fähigkeit.",
    }
    if stat_raw == "T":
        return {**base, "type": "action", "effect": {"kind": "referenz", "text": rule_text}}
    if stat_raw == "E":
        return {**base, "type": "environment", "effect": {"kind": "referenz", "text": rule_text}}
    match = re.fullmatch(r"(\d+)\s*/\s*(\d+)", stat_raw)
    if not match:
        raise ValueError(f"Ungültiges Wertefeld bei {name!r}: {stat_raw!r}")
    keywords = [internal for label, internal in TRAITS.items() if label.lower() in rule_text.lower()]
    abilities = [] if rule_text in ("", "–", "-") else [{"kind": "referenz", "text": rule_text}]
    return {
        **base,
        "type": "creature",
        "attack": int(match.group(1)),
        "health": int(match.group(2)),
        "keywords": keywords,
        "abilities": abilities,
        "projectile": "✨",
    }


def legacy_cards(cards_dir: Path, repo: Path) -> dict[str, dict]:
    result: dict[str, dict] = {}
    snapshot = cards_dir.parent / "legacy-card-snapshot.json"
    if snapshot.exists():
        try:
            value = json.loads(snapshot.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as error:
            raise SystemExit(f"Bestandskarten-Snapshot ist ungültig: {error}") from error
        if isinstance(value, list):
            for card in value:
                if isinstance(card, dict) and isinstance(card.get("id"), str):
                    result[card["id"]] = card
        if result:
            return result

    # Beim ersten Import stammen die unveränderten Bestandskarten aus diesen
    # drei Dateien. Git ist hier die zuverlässigste Quelle, auch wenn ein
    # vorheriger Importlauf bereits neue Klassendateien erzeugt hat. Danach
    # friert legacy-card-snapshot.json diese Quelle für spätere Reimporte ein.
    for relative in (
        "packages/engine/src/data/cards/animals.json",
        "packages/engine/src/data/cards/humans.json",
        "packages/engine/src/data/cards/neutral.json",
    ):
        completed = subprocess.run(
            ["git", "show", f"HEAD:{relative}"],
            cwd=repo,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
        )
        if completed.returncode != 0:
            continue
        try:
            value = json.loads(completed.stdout)
        except json.JSONDecodeError:
            continue
        if isinstance(value, list):
            for card in value:
                if isinstance(card, dict) and isinstance(card.get("id"), str):
                    result[card["id"]] = card
    for path in cards_dir.glob("*.json"):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if isinstance(value, list):
            for card in value:
                if isinstance(card, dict) and isinstance(card.get("id"), str):
                    result.setdefault(card["id"], card)
    return result


def card_type(card: dict) -> str:
    return str(card.get("type", "creature"))


def match_score(legacy: dict, reference: dict) -> tuple:
    if card_type(legacy) != card_type(reference):
        return (1, math.inf, reference["id"])
    shared = roles(str(legacy.get("text", ""))) & roles(str(reference.get("text", "")))
    role_penalty = 0 if shared else 40
    score = abs(int(legacy.get("cost", 0)) - int(reference.get("cost", 0))) * 20 + role_penalty
    if card_type(legacy) == "creature":
        score += abs(int(legacy.get("attack", 0)) - int(reference.get("attack", 0))) * 6
        score += abs(int(legacy.get("health", 1)) - int(reference.get("health", 1))) * 4
    return (0, score, reference["id"])


def compatible(legacy: dict, reference: dict) -> bool:
    if card_type(legacy) != card_type(reference):
        return False
    if abs(int(legacy.get("cost", 0)) - int(reference.get("cost", 0))) > 1:
        return False
    old_roles = roles(str(legacy.get("text", "")))
    new_roles = roles(str(reference.get("text", "")))
    if old_roles or new_roles:
        if not old_roles.intersection(new_roles):
            return False
    if card_type(legacy) == "creature":
        return (
            abs(int(legacy.get("attack", 0)) - int(reference.get("attack", 0))) <= 1
            and abs(int(legacy.get("health", 1)) - int(reference.get("health", 1))) <= 2
        )
    return True


def overlay_legacy(legacy: dict, reference: dict, class_id: str) -> tuple[dict, bool]:
    keep_rules = compatible(legacy, reference)
    if keep_rules:
        merged = dict(legacy)
        merged.pop("signature", None)
        merged.pop("category", None)
        merged.update({
            "faction": class_id,
            "deckable": True,
            "tribes": list(legacy.get("tribes", [])),
            "referenceName": reference["referenceName"],
        })
        return merged, True
    merged = dict(reference)
    merged["id"] = legacy["id"]
    merged["name"] = legacy["name"]
    if card_type(legacy) == "creature" and legacy.get("projectile"):
        merged["projectile"] = legacy["projectile"]
    return merged, False


def superpower_cards(table: list[list[str]]) -> tuple[list[dict], dict[str, list[str]]]:
    definitions: dict[str, dict] = {}
    assignments: dict[str, list[str]] = {champ[0]: [] for champ in CHAMPIONS}
    champ_by_label = {
        "Sonnenfackel": "sonnenfackel",
        "Käpt'n Kompostible": "kaeptn_kompostible",
        "Wall-Halla": "wall_halla",
        "Super Brainz": "super_brainz",
        "Rostbolzen": "rostbolzen",
        "Der Zerschmetterer": "der_zerschmetterer",
    }
    for row in table[1:]:
        if len(row) < 4:
            continue
        champ_label, raw_name, cost_raw, effect_text = row[:4]
        signature = "(Signatur)" in raw_name
        name = raw_name.replace(" (Signatur)", "")
        power_id = "super_" + slug(name)
        definitions.setdefault(power_id, {
            "id": power_id,
            "name": name,
            "faction": "neutral",
            "type": "superpower",
            "cost": int(cost_raw),
            "deckable": False,
            "tribes": [],
            "signaturePower": signature,
            "effect": {"kind": "referenz", "text": effect_text},
            "text": effect_text,
        })
        assignments[champ_by_label[champ_label]].append(power_id)
    return list(definitions.values()), assignments


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("docx", type=Path)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    repo = args.repo.resolve()
    data_dir = repo / "packages" / "engine" / "src" / "data"
    cards_dir = data_dir / "cards"
    decks_dir = data_dir / "decks"
    legacy_all = legacy_cards(cards_dir, repo)
    required_legacy_ids = {card_id for ids in LEGACY_BY_CLASS.values() for card_id in ids} | {"pc_principal"}
    legacy = {card_id: card for card_id, card in legacy_all.items() if card_id in required_legacy_ids}
    if set(legacy) != required_legacy_ids:
        missing = ", ".join(sorted(required_legacy_ids - set(legacy)))
        raise SystemExit(f"Bestandskarten fehlen: {missing}")
    snapshot_path = data_dir / "legacy-card-snapshot.json"
    if not snapshot_path.exists():
        write_json(snapshot_path, [legacy[card_id] for card_id in sorted(legacy)])
    tables = tables_from_docx(args.docx.resolve())
    if len(tables) < 12:
        raise SystemExit(f"Referenz enthält nur {len(tables)} statt mindestens 12 Tabellen.")

    used_ids = set(legacy)
    class_cards: dict[str, list[dict]] = {}
    for class_id, _name, _side, table_index in CLASS_TABLES:
        class_cards[class_id] = [
            parse_reference_card(row, class_id, used_ids)
            for row in tables[table_index][1:]
            if len(row) >= 4 and row[0].strip()
        ]

    manifest: list[dict] = []
    for class_id, legacy_ids in LEGACY_BY_CLASS.items():
        available = list(range(len(class_cards[class_id])))
        for legacy_id in legacy_ids:
            if legacy_id not in legacy:
                raise SystemExit(f"Bestandskarte fehlt: {legacy_id}")
            old = legacy[legacy_id]
            candidates = sorted(available, key=lambda i: match_score(old, class_cards[class_id][i]))
            if not candidates or match_score(old, class_cards[class_id][candidates[0]])[0] != 0:
                raise SystemExit(f"Kein passender Kartentyp in {class_id} für {legacy_id}")
            index = candidates[0]
            reference = class_cards[class_id][index]
            replacement, kept = overlay_legacy(old, reference, class_id)
            class_cards[class_id][index] = replacement
            available.remove(index)
            manifest.append({
                "legacyId": legacy_id,
                "classId": class_id,
                "replaced": reference["referenceName"],
                "keptLegacyRules": kept,
            })

    # Neutrale feste Ausnahme aus dem beschlossenen Plan.
    pc = legacy.get("pc_principal")
    if not pc:
        raise SystemExit("Bestandskarte pc_principal fehlt")
    hearty = class_cards["hearty"]
    chum_index = next((i for i, card in enumerate(hearty) if card["referenceName"] == "Chum Champion"), None)
    if chum_index is None:
        raise SystemExit("Referenzkarte Chum Champion fehlt")
    removed_chum = hearty.pop(chum_index)
    neutral_pc = dict(pc)
    neutral_pc.pop("signature", None)
    neutral_pc.pop("category", None)
    neutral_pc.update({"faction": "neutral", "deckable": True, "tribes": [], "referenceName": removed_chum["referenceName"]})
    manifest.append({"legacyId": "pc_principal", "classId": "neutral", "replaced": "Chum Champion", "keptLegacyRules": True})

    superpowers, power_assignments = superpower_cards(tables[11])
    champions = [
        {"id": cid, "name": name, "side": side, "classes": classes, "superpowers": power_assignments[cid]}
        for cid, name, side, classes in CHAMPIONS
    ]

    factions = [
        {"id": "animals", "name": "Animals", "parent": None, "color": "#3fae5a", "description": "Animals führen die vier ehemaligen Pflanzenklassen."},
        {"id": "guardian", "name": "Guardian", "parent": "animals", "description": "Schutz, Team-Up und widerstandsfähige Kämpfer."},
        {"id": "kabloom", "name": "Kabloom", "parent": "animals", "description": "Direktschaden, Schwärme und explosive Effekte."},
        {"id": "mega_grow", "name": "Mega-Grow", "parent": "animals", "description": "Wachstum, Verstärkung und Bonusangriffe."},
        {"id": "solar", "name": "Solar", "parent": "animals", "description": "Heilung, Ressourcen und Durchschlag."},
        {"id": "humans", "name": "Humans", "parent": None, "color": "#4a7dff", "description": "Humans führen die vier ehemaligen Zombieklassen."},
        {"id": "beastly", "name": "Beastly", "parent": "humans", "description": "Große Kämpfer, Jagd und Raserei."},
        {"id": "brainy", "name": "Brainy", "parent": "humans", "description": "Kartenvorteil, Ressourcen und Trickketten."},
        {"id": "hearty", "name": "Hearty", "parent": "humans", "description": "Rüstung, Leben und Mannschaftsboni."},
        {"id": "sneaky", "name": "Sneaky", "parent": "humans", "description": "Grabsteine, Bewegung und tödliche Treffer."},
        {"id": "neutral", "name": "Neutral", "parent": None, "neutral": True, "color": "#8a8f98", "description": "Neutrale Karten sind für jeden Champ erlaubt."},
    ]

    cards_dir.mkdir(parents=True, exist_ok=True)
    for path in cards_dir.glob("*.json"):
        path.unlink()
    for class_id, cards in class_cards.items():
        write_json(cards_dir / f"{class_id}.json", cards)
    write_json(cards_dir / "neutral.json", [neutral_pc])
    write_json(cards_dir / "superpowers.json", superpowers)
    write_json(data_dir / "factions.json", factions)
    write_json(data_dir / "champions.json", champions)
    write_json(data_dir / "migration-manifest.json", sorted(manifest, key=lambda x: x["legacyId"]))

    # Sechs deterministische 20/20-Startdecks: je vier Kopien der ersten fünf
    # nach der Migration verbleibenden Karten beider Champ-Klassen.
    decks_dir.mkdir(parents=True, exist_ok=True)
    for path in decks_dir.glob("*.json"):
        path.unlink()
    for champ in champions:
        entries = []
        for class_id in champ["classes"]:
            choices = [card for card in class_cards[class_id] if card.get("deckable", True)][:5]
            entries.extend({"cardId": card["id"], "count": 4} for card in choices)
        deck = {"name": f"{champ['name']} – Startdeck", "faction": champ["side"], "championId": champ["id"], "cards": entries}
        write_json(decks_dir / f"{champ['id']}.json", deck)
    write_json(data_dir / "deck-status.json", {
        "active": [champ["id"] for champ in champions],
        "allowCustomDecks": True,
        "disabledReason": "Eigene Decks sind aktiviert.",
    })

    total = sum(len(cards) for cards in class_cards.values()) + 1
    if total != 401:
        raise SystemExit(f"Import ergab {total} statt 401 deckbare Karten")
    print(f"Import abgeschlossen: {total} deckbare Karten, {len(superpowers)} Superkräfte, {len(manifest)} Bestandskarten.")


if __name__ == "__main__":
    main()
