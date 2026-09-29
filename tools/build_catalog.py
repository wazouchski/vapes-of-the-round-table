#!/usr/bin/env python3
"""
Build data/device-catalog.json from the compendium articles.

Why this exists
---------------
The catalog used to be produced by an out-of-repo pipeline. It drifted: the
committed catalog held 116 devices while 151 articles existed, so 35 devices
could not be filtered on the compendium page at all (assets/compendium-search.js
drives the heat-type and era chips plus spec-text search from this file).

This script makes the articles the single source of truth, so the two can no
longer silently disagree.

Rules it follows
----------------
1. Curated values win. Any field a human has set in the existing catalog is
   copied through untouched. This script never overwrites editorial judgment.
2. Nothing is invented. A field that cannot be read from the article is left
   null, not guessed. "Unknown" is a correct answer.
3. Derivation is recorded. Fields this script inferred for a new device are
   listed in `_derived` so a human can review them.

Usage
-----
    python3 tools/build_catalog.py            # write the catalog
    python3 tools/build_catalog.py --check    # verify, exit 1 on drift (CI)
"""

import argparse
import datetime
import glob
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMPENDIUM = os.path.join(ROOT, "compendium")
CATALOG = os.path.join(ROOT, "data", "device-catalog.json")
INDEX_PAGE = os.path.join(COMPENDIUM, "index.html")

# The "Articles Live" figure on the compendium index used to be hand-typed and
# went stale every time an article was added. The generator now owns it.
STAT_PATTERN = re.compile(
    r"(<!-- articles-live:start -->).*?(<!-- articles-live:end -->)", re.S)

# Fields a human may have curated. Never recomputed for a device that already
# has a value — see rule 1 above.
CURATED_FIELDS = (
    "manufacturer", "aliases", "image", "heat_type", "power", "form_factor",
    "material_path", "session_style", "difficulty", "maintenance",
    "flavor_character", "era", "sentiment", "hall", "tags", "related",
    "review_slugs",
)

STUB_MARKER = "community-suggested stub"


def read_articles():
    """Yield (slug, html_text) for every compendium article except the index."""
    for path in sorted(glob.glob(os.path.join(COMPENDIUM, "*.html"))):
        slug = os.path.basename(path)[:-5]
        if slug == "index":
            continue
        with open(path, encoding="utf-8") as handle:
            yield slug, handle.read()


def strip_tags(fragment):
    fragment = re.sub(r"<[^>]+>", "", fragment)
    return html.unescape(fragment).strip()


def parse_title(text, slug):
    match = re.search(r'<h1[^>]*class="article-title"[^>]*>(.*?)</h1>', text, re.S)
    if match:
        name = strip_tags(match.group(1))
        if name:
            return name
    return slug.replace("-", " ").title()


# The compendium reuses class="specs-table" for four different kinds of table.
# Only the first is key/value device specifications; the rest are editorial
# tables that must not be flattened into the spec dict. They are classified by
# their header row and kept in their own fields.
TABLE_KINDS = {
    "specs": ("specification", "feature"),
    "temperature_guide": ("effect", "temperature", "temperature range",
                          "desired effect", "setting"),
    "accessories": ("accessory",),
    "known_issues": ("issue",),
    "variants": ("variant",),
}


def _classify(header_cells):
    """Decide what a table is from its header row. None means 'not key/value'."""
    if len(header_cells) != 2:
        return None  # comparison tables and wider layouts are not key/value
    first = header_cells[0].strip().lower()
    for kind, markers in TABLE_KINDS.items():
        if first in markers:
            return kind
    return None


def parse_tables(text):
    """Split every table.specs-table into its proper bucket.

    Returns a dict of kind -> {key: value}. A table whose header we do not
    recognise is skipped rather than guessed at, so unrecognised editorial
    tables can never masquerade as specifications.
    """
    buckets = {kind: {} for kind in TABLE_KINDS}
    for table in re.findall(r'<table[^>]*class="specs-table"[^>]*>(.*?)</table>', text, re.S):
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S)
        if not rows:
            continue
        header = [strip_tags(c) for c in
                  re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", rows[0], re.S)]
        kind = _classify(header)
        if kind is None:
            continue
        for row in rows[1:]:  # row 0 is the header we just classified
            cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
            if len(cells) != 2:
                continue
            key, value = strip_tags(cells[0]), strip_tags(cells[1])
            if key and value:
                buckets[kind][key] = value
    return buckets


def parse_source_threads(text):
    """Collect the archived source links the article footer cites."""
    block = re.search(r'<ul class="source-threads">(.*?)</ul>', text, re.S)
    if not block:
        return []
    threads = []
    for anchor in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', block.group(1), re.S):
        threads.append({"url": anchor[0], "title": strip_tags(anchor[1])})
    return threads


def derive_heat_type(specs):
    """Read the heating method only when the article states it plainly."""
    text = (specs.get("Heating Method") or specs.get("Heating") or "").lower()
    if not text:
        return None
    has_convection = "convection" in text
    has_conduction = "conduction" in text
    if "hybrid" in text or (has_convection and has_conduction):
        return "hybrid"
    if has_convection:
        return "convection"
    if has_conduction:
        return "conduction"
    return None


def derive_power(specs):
    blob = " ".join(
        specs.get(key, "")
        for key in ("Power Source", "Power", "Battery", "Charging")
    ).lower()
    if not blob:
        return None
    if "butane" in blob or "torch" in blob:
        return "butane"
    if "battery" in blob or "18650" in blob or "rechargeable" in blob:
        return "battery"
    if "mains" in blob or "wall" in blob or "ac " in blob or "plug" in blob:
        return "mains"
    return None


def derive_form_factor(specs):
    blob = " ".join(
        specs.get(key, "") for key in ("Type", "Form Factor", "Category")
    ).lower()
    if "desktop" in blob or "tabletop" in blob:
        return "desktop"
    if "portable" in blob or "handheld" in blob:
        return "portable"
    return None


def derive_manufacturer(specs):
    value = (specs.get("Manufacturer") or specs.get("Brand") or "").strip()
    if not value:
        return None
    # Drop a trailing parenthetical country note: "Arizer (Canada)" -> "Arizer".
    return re.sub(r"\s*\([^)]*\)\s*$", "", value).strip() or None


def build():
    existing = {}
    generated_before = None
    if os.path.exists(CATALOG):
        with open(CATALOG, encoding="utf-8") as handle:
            previous = json.load(handle)
        generated_before = previous.get("generated_at")
        existing = {d["slug"]: d for d in previous.get("devices", [])}

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    devices = []

    for slug, text in read_articles():
        prior = existing.get(slug, {})
        tables = parse_tables(text)
        specs = tables["specs"]
        is_stub = STUB_MARKER in text

        device = {
            "slug": slug,
            "name": prior.get("name") or parse_title(text, slug),
            "url": "/compendium/%s.html" % slug,
            "is_stub": is_stub,
            "specs_extracted": specs,
            "temperature_guide": tables["temperature_guide"],
            "accessories": tables["accessories"],
            "known_issues": tables["known_issues"],
            "variants": tables["variants"],
            "source_threads": parse_source_threads(text),
        }

        # Rule 1: a curated value is copied through untouched.
        derived = []
        for field in CURATED_FIELDS:
            if field in prior and prior[field] not in (None, "", [], {}):
                device[field] = prior[field]
                continue
            # Rule 2 and 3: derive only what the article states, and say so.
            value = None
            if field == "heat_type":
                value = derive_heat_type(specs)
            elif field == "power":
                value = derive_power(specs)
            elif field == "form_factor":
                value = derive_form_factor(specs)
            elif field == "manufacturer":
                value = derive_manufacturer(specs)

            if value is not None:
                device[field] = value
                derived.append(field)
            else:
                device[field] = prior.get(field, _empty_for(field))

        if derived:
            device["_derived"] = derived

        device["first_indexed"] = prior.get("first_indexed") or now
        device["last_updated"] = now
        devices.append(device)

    return {
        "generated_at": now,
        "generated_by": "tools/build_catalog.py",
        "previous_generated_at": generated_before,
        "device_count": len(devices),
        "stub_count": sum(1 for d in devices if d["is_stub"]),
        "devices": devices,
    }


def _empty_for(field):
    if field in ("aliases", "session_style", "flavor_character", "tags",
                 "related", "review_slugs"):
        return []
    if field == "sentiment":
        return {}
    return None


def update_index_stat(count, write=True):
    """Keep the compendium index's 'Articles Live' figure in sync.

    Returns the figure currently on the page, or None if the marker is absent.
    """
    if not os.path.exists(INDEX_PAGE):
        return None
    with open(INDEX_PAGE, encoding="utf-8") as handle:
        page = handle.read()
    match = STAT_PATTERN.search(page)
    if not match:
        return None
    current = re.sub(r"<[^>]+>", "", match.group(0)).strip()
    replacement = '%s<span class="stat-num">%d</span>%s' % (
        match.group(1), count, match.group(2))
    updated = STAT_PATTERN.sub(lambda _: replacement, page, count=1)
    if write and updated != page:
        with open(INDEX_PAGE, "w", encoding="utf-8") as handle:
            handle.write(updated)
    return current


def check(catalog):
    """Report drift without writing. Returns a list of problems."""
    problems = []
    if not os.path.exists(CATALOG):
        return ["data/device-catalog.json is missing"]
    with open(CATALOG, encoding="utf-8") as handle:
        committed = json.load(handle)
    committed_count = len(committed.get("devices", []))
    if catalog["device_count"] != committed_count:
        problems.append(
            "%d articles but %d entries in the committed catalog"
            % (catalog["device_count"], committed_count)
        )
    committed_slugs = {d["slug"] for d in committed.get("devices", [])}
    fresh_slugs = {d["slug"] for d in catalog["devices"]}
    missing = sorted(fresh_slugs - committed_slugs)
    stale = sorted(committed_slugs - fresh_slugs)
    on_page = update_index_stat(catalog["device_count"], write=False)
    if on_page is None:
        problems.append("compendium/index.html is missing the articles-live marker")
    elif on_page != str(catalog["device_count"]):
        problems.append(
            "compendium/index.html says %s articles live, actual count is %d"
            % (on_page, catalog["device_count"]))
    if missing:
        problems.append("articles absent from the committed catalog: %s" % ", ".join(missing))
    if stale:
        problems.append("catalog entries with no article: %s" % ", ".join(stale))
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="verify only; exit 1 if the catalog has drifted")
    args = parser.parse_args()

    catalog = build()

    if args.check:
        problems = check(catalog)
        if problems:
            print("Catalog drift detected:")
            for problem in problems:
                print("  - %s" % problem)
            print("\nRun: python3 tools/build_catalog.py")
            return 1
        print("Catalog is in sync: %d articles, %d devices."
              % (catalog["device_count"], catalog["device_count"]))
        return 0

    with open(CATALOG, "w", encoding="utf-8") as handle:
        json.dump(catalog, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    update_index_stat(catalog["device_count"])

    derived_count = sum(1 for d in catalog["devices"] if d.get("_derived"))
    print("Wrote %s" % os.path.relpath(CATALOG, ROOT))
    print("  devices:         %d" % catalog["device_count"])
    print("  stubs:           %d" % catalog["stub_count"])
    print("  with derivation: %d (listed in each entry's _derived field)" % derived_count)
    return 0


if __name__ == "__main__":
    sys.exit(main())
