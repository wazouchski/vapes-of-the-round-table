# Vapes of the Round Table

Community dry herb vaporizer hub — round table reviews, compendium, trusted artisans.

## Site Structure

```
/                        → Splash page (3 cards)
/compendium/             → DHV wiki (preserved from FuckCombustion.com)
/compendium/[model].html → Individual vaporizer articles
/artisans.html           → Trusted artisan/vendor directory
```

## Deployment

Automatically deploys to Namecheap shared hosting via FTP on every push to `main`.

### Required GitHub Secrets

Set these in your repo → Settings → Secrets → Actions:

| Secret | Value |
|--------|-------|
| `FTP_SERVER` | Your Namecheap FTP hostname (e.g. `ftp.yourdomain.com`) |
| `FTP_USERNAME` | FTP username from Namecheap cPanel |
| `FTP_PASSWORD` | FTP password from Namecheap cPanel |
| `FTP_SERVER_DIR` | Remote path (e.g. `/public_html/` or `/public_html/vapes/`) |

### Finding Your FTP Credentials (Namecheap)
1. Log into Namecheap → cPanel
2. Search "FTP Accounts" 
3. Use the main account credentials, or create a dedicated FTP user
4. FTP server is usually `ftp.yourdomain.com`

## Local Development

Just open `index.html` in a browser — no build step needed.

## Adding Wiki Articles

Add the article HTML to `compendium/`, then regenerate both generated files:

```bash
python3 tools/build_catalog.py
python3 tools/build_search_index.py
```

Commit the new article together with the regenerated `data/device-catalog.json`
and `data/search-index.json`. Editing an existing article needs the same two
commands — otherwise the new text is not findable by the site search.

## The device catalog

`data/device-catalog.json` is **generated from the compendium articles** by
`tools/build_catalog.py`. The articles are the source of truth; do not hand-edit
the catalog, because the next build will overwrite it.

```bash
python3 tools/build_catalog.py           # regenerate
python3 tools/build_catalog.py --check    # verify only, exits 1 on drift
```

`--check` runs in CI before deploy, so a push that leaves the catalog out of sync
with the articles cannot reach production.

## The search index

`data/search-index.json` maps each article slug to its flattened body text. It
is what `assets/compendium-search.js` loads on the first search keystroke, so a
visitor can match against article prose and not only device names.

```bash
python3 tools/build_search_index.py           # regenerate
python3 tools/build_search_index.py --check   # verify only, exits 1 on drift
```

This also runs in CI before deploy, so an article edit that skips the rebuild
fails the build rather than shipping text nobody can search for.

### What the generator guarantees

1. **Curated values win.** Any field a human has set is copied through
   untouched. The generator never overwrites editorial judgment.
2. **Nothing is invented.** A field that cannot be read from the article is left
   `null`. "Unknown" is a correct answer.
3. **Derivation is recorded.** Fields inferred from article text are listed in
   that device's `_derived` array so a human can review them.

### Table markup

`class="specs-table"` is used on the articles for four different kinds of table.
The generator classifies each by its header row and keeps them in separate
fields, so an editorial table is never flattened into the spec list:

| Header row starts with | Goes to |
|---|---|
| `Specification` / `Feature` | `specs_extracted` |
| `Effect` / `Temperature` / `Setting` | `temperature_guide` |
| `Accessory` | `accessories` |
| `Issue` | `known_issues` |
| `Variant` | `variants` |

A table whose header is not recognised, or that is not two columns wide, is
skipped rather than guessed at.

## Contributing

Community submissions via Google Form → Apps Script → Claude API (Phase 3).
