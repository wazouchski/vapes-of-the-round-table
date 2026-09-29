#!/usr/bin/env python3
"""
Build data/search-index.json from the compendium articles.

Why this exists
---------------
assets/compendium-search.js loads this file on the first search keystroke so a
visitor can match against article prose, not only device names and specs. Its
comment points at `pipeline/build_search_index.py`, which is not in this
repository and is no longer available. The index was therefore unreproducible:
nobody could regenerate it, and nothing detected it going stale when an article
was edited.

This script restores that stage inside the repo. It was written against the
committed index and reproduces all 151 entries byte-for-byte, so it is a
rebuild of the original behaviour rather than a replacement for it.

What it extracts
----------------
The visible prose of `<div class="article-body">`, stopping at the article
footer. The footer holds the standing citation and takedown notice, which is
identical on every page and would only add noise to every search.

Usage
-----
    python3 tools/build_search_index.py            # write the index
    python3 tools/build_search_index.py --check    # verify, exit 1 on drift
"""

import argparse
import glob
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMPENDIUM = os.path.join(ROOT, "compendium")
INDEX = os.path.join(ROOT, "data", "search-index.json")

# Where the body prose starts, and the first of these markers ends it.
BODY_START = re.compile(r'<div class="article-body"[^>]*>(.*)', re.S)
BODY_STOP = ('<footer class="article-footer"', "<footer", "<script")
STRIP_BLOCKS = re.compile(r"<(script|style)\b.*?</\1>", re.S | re.I)
TAGS = re.compile(r"<[^>]+>")
WHITESPACE = re.compile(r"\s+")


def article_text(markup):
    """Return the flattened, lowercased prose of one article, or None."""
    match = BODY_START.search(markup)
    if not match:
        return None
    body = match.group(1)
    for marker in BODY_STOP:
        cut = body.find(marker)
        if cut != -1:
            body = body[:cut]
            break
    body = STRIP_BLOCKS.sub("", body)
    body = TAGS.sub(" ", body)
    body = html.unescape(body)
    return WHITESPACE.sub(" ", body).strip().lower()


def build():
    """Map slug -> searchable text for every compendium article."""
    index = {}
    skipped = []
    for path in sorted(glob.glob(os.path.join(COMPENDIUM, "*.html"))):
        slug = os.path.basename(path)[:-5]
        if slug == "index":
            continue
        with open(path, encoding="utf-8") as handle:
            text = article_text(handle.read())
        # An article with no recognisable body is a template change, not an
        # empty article. Report it rather than silently indexing nothing.
        if text is None:
            skipped.append(slug)
            continue
        index[slug] = text
    return index, skipped


def check(index, skipped):
    """Compare against the committed index. Returns a list of problems."""
    problems = []
    if skipped:
        problems.append(
            "articles with no readable <div class=\"article-body\">: %s"
            % ", ".join(skipped))
    if not os.path.exists(INDEX):
        problems.append("data/search-index.json is missing")
        return problems

    with open(INDEX, encoding="utf-8") as handle:
        committed = json.load(handle)

    added = sorted(set(index) - set(committed))
    removed = sorted(set(committed) - set(index))
    changed = sorted(s for s in set(index) & set(committed)
                     if index[s] != committed[s])
    if added:
        problems.append("articles missing from the index: %s" % ", ".join(added))
    if removed:
        problems.append("index entries with no article: %s" % ", ".join(removed))
    if changed:
        problems.append("articles edited since the index was built: %s"
                        % ", ".join(changed))
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="verify only; exit 1 if the index has drifted")
    args = parser.parse_args()

    index, skipped = build()

    if args.check:
        problems = check(index, skipped)
        if problems:
            print("Search index drift detected:")
            for problem in problems:
                print("  - %s" % problem)
            print("\nRun: python3 tools/build_search_index.py")
            return 1
        print("Search index is in sync: %d articles." % len(index))
        return 0

    # Compact, because every byte is served to the visitor. Keys are sorted so
    # the output does not depend on filesystem ordering.
    with open(INDEX, "w", encoding="utf-8") as handle:
        json.dump(index, handle, ensure_ascii=False, sort_keys=True,
                  separators=(",", ":"))

    size = os.path.getsize(INDEX)
    print("Wrote %s" % os.path.relpath(INDEX, ROOT))
    print("  articles: %d" % len(index))
    print("  size:     %.1f KB" % (size / 1024.0))
    if skipped:
        print("  SKIPPED (no readable body): %s" % ", ".join(skipped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
